"""CSV / Excel import for the donor spreadsheet, Zeffy and Benevity exports.

POST /imports/{source}?dry_run=true   preview: what would be created, nothing saved
POST /imports/{source}                 import for real

Admin and fundraising only. Writes use the service-role client (imports are
server-side work in the schema's design), so the role check below is the guard.
Uploading the same file twice is safe: rows already imported are skipped.
"""

import csv
import io
from enum import Enum
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from ..auth import CurrentUser, require_role
from ..db import service_client
from ..importers.dedupe import Existing, Plan, build_plan
from ..importers.mapping import find_header_row, map_columns

router = APIRouter(prefix="/imports", tags=["imports"])

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20_000
CHUNK = 500
IDENTITY_FIELDS = ("email", "first_name", "last_name", "full_name", "organization_name")


class Source(str, Enum):
    spreadsheet = "spreadsheet"
    zeffy = "zeffy"
    benevity = "benevity"


# ---------------------------------------------------------------- reading

def read_table(data: bytes, filename: str) -> list[list[str]]:
    name = filename.lower()
    if name.endswith(".xlsx"):
        try:
            df = pd.read_excel(io.BytesIO(data), header=None, dtype=str)
        except Exception:
            raise HTTPException(400, "Couldn't read that Excel file.")
        return df.fillna("").values.tolist()
    if name.endswith(".csv"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        return list(csv.reader(io.StringIO(text)))
    raise HTTPException(400, "Upload a .csv or .xlsx file.")


def to_records(table: list[list[str]], header_idx: int) -> tuple[list[str], list[tuple[int, dict]]]:
    headers, counts = [], {}
    for h in table[header_idx]:
        h = str(h).strip() or "column"
        counts[h] = counts.get(h, 0) + 1
        headers.append(h if counts[h] == 1 else f"{h} ({counts[h]})")

    records = []
    for offset, row in enumerate(table[header_idx + 1:]):
        if not any(str(c).strip() for c in row):
            continue
        cells = {h: (str(row[i]).strip() if i < len(row) else "") for i, h in enumerate(headers)}
        records.append((header_idx + offset + 2, cells))  # 1-based line in the file
    return headers, records


# ---------------------------------------------------------------- database

def fetch_all(db, table: str, columns: str, page: int = 1000) -> list[dict]:
    """Supabase returns at most 1000 rows per request; page through."""
    out, start = [], 0
    while True:
        rows = db.table(table).select(columns).range(start, start + page - 1).execute().data
        out += rows
        if len(rows) < page:
            return out
        start += page


def load_existing(db) -> Existing:
    donors = fetch_all(db, "donors",
                       "id, first_name, last_name, organization_name, email, phone, active, merged_into")
    sources = fetch_all(db, "donor_sources", "donor_id, source, external_id")
    gifts = fetch_all(db, "gifts", "source, external_id")
    programs = fetch_all(db, "programs", "id, name")
    pairs = fetch_all(db, "duplicate_candidates", "donor_id, candidate_id")

    donor_sources: dict[int, set[str]] = {}
    for s in sources:
        donor_sources.setdefault(s["donor_id"], set()).add(s["source"])
    return Existing(
        donors=donors,
        source_ids={(s["source"], s["external_id"]): s["donor_id"]
                    for s in sources if s["external_id"]},
        donor_sources=donor_sources,
        gift_ids={(g["source"], g["external_id"]) for g in gifts if g["external_id"]},
        programs={p["name"].strip().lower(): p["id"] for p in programs},
        candidate_pairs={(p["donor_id"], p["candidate_id"]) for p in pairs},
    )


def chunks(items: list, n: int = CHUNK):
    for i in range(0, len(items), n):
        yield items[i:i + n]


def apply_plan(db, plan: Plan, existing: Existing) -> dict:
    """Write in an order that keeps a re-run safe if something fails midway:
    donors -> donor_sources (marks rows as imported) -> gifts -> review queue."""
    ids: dict[str, int] = {}
    done = {"donors_created": 0, "donors_updated": 0, "sources_created": 0,
            "gifts_created": 0, "duplicate_candidates_created": 0, "donors_without_owner": 0}

    def resolve(ref) -> int:
        return ids[ref] if isinstance(ref, str) else ref

    def strip_ref(row: dict) -> dict:
        r = {k: v for k, v in row.items() if k != "donor_ref"}
        r["donor_id"] = resolve(row["donor_ref"])
        return r

    try:
        for batch in chunks(plan.new_donors):
            created = db.table("donors").insert([d.insert_row() for d in batch]).execute().data
            for nd, row in zip(batch, created):
                ids[nd.ref] = row["id"]
                if nd.active:
                    done["donors_created"] += 1
                    if row.get("owner_id") is None:
                        done["donors_without_owner"] += 1

        for donor_id, fields in plan.donor_updates.items():
            db.table("donors").update(fields).eq("id", donor_id).execute()
            done["donors_updated"] += 1

        for batch in chunks(plan.sources):
            db.table("donor_sources").insert([strip_ref(s) for s in batch]).execute()
            done["sources_created"] += len(batch)

        for batch in chunks(plan.gifts):
            db.table("gifts").insert([strip_ref(g) for g in batch]).execute()
            done["gifts_created"] += len(batch)

        pairs, seen = [], set(existing.candidate_pairs)
        for a, b, score, reason in plan.candidates:
            lo, hi = sorted((resolve(a), resolve(b)))
            if lo == hi or (lo, hi) in seen:
                continue
            seen.add((lo, hi))
            pairs.append({"donor_id": lo, "candidate_id": hi, "score": score, "reason": reason})
        for batch in chunks(pairs):
            db.table("duplicate_candidates").upsert(
                batch, on_conflict="donor_id,candidate_id", ignore_duplicates=True).execute()
            done["duplicate_candidates_created"] += len(batch)
    except Exception as exc:
        raise HTTPException(500, {
            "message": "Import stopped partway. Uploading the same file again will skip "
                       "rows that were already saved.",
            "saved_so_far": done,
            "error": str(exc)[:300],
        })
    return done


# ---------------------------------------------------------------- endpoint

@router.post("/{source}")
async def import_file(
    source: Source,
    file: Annotated[UploadFile, File(description="CSV or XLSX export")],
    user: Annotated[CurrentUser, Depends(require_role("admin", "fundraising"))],
    dry_run: Annotated[bool, Query(description="Preview only; nothing is saved")] = False,
):
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 5 MB.")
    if not data:
        raise HTTPException(400, "File is empty.")

    table = read_table(data, file.filename or "")
    if not table:
        raise HTTPException(400, "File has no rows.")
    header_idx = find_header_row(table, source.value)
    headers, records = to_records(table, header_idx)
    if len(records) > MAX_ROWS:
        raise HTTPException(413, f"File has more than {MAX_ROWS:,} rows.")

    mapping = map_columns(headers, source.value)
    if not any(f in mapping for f in IDENTITY_FIELDS):
        raise HTTPException(400, {
            "message": "Couldn't find a name or email column.",
            "headers_found": headers,
        })
    if source != Source.spreadsheet and not {"amount", "date"} <= mapping.keys():
        raise HTTPException(400, {
            "message": f"A {source.value} export needs amount and date columns.",
            "headers_found": headers,
            "columns_matched": mapping,
        })

    db = service_client()
    existing = load_existing(db)
    plan = build_plan(records, mapping, source.value, existing)

    result = {
        "source": source.value,
        "filename": file.filename,
        "dry_run": dry_run,
        "columns_matched": mapping,
        "columns_ignored": [h for h in headers if h not in mapping.values()],
        "summary": dict(plan.stats),
        "skipped": plan.skipped[:100],
        "warnings": plan.warnings,
    }
    if dry_run:
        return result

    saved = apply_plan(db, plan, existing)
    result["saved"] = saved
    if saved["donors_without_owner"]:
        result["warnings"].append(
            f"{saved['donors_without_owner']} new donors have no owner because there are no "
            "active board members yet. Add board members, then reassign.")
    return result
