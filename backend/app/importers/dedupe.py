"""Decide what an import will do, without touching the database.

build_plan() takes the parsed rows plus a snapshot of what's already stored
and returns a Plan: donors to create, blank fields to fill on existing donors,
donor_sources rows, gifts, and fuzzy duplicate pairs for admin review.

Matching rules (see docs/decisions.md):
  1. Row already imported (same source + external id)  -> skip, same donor.
  2. Same email as an existing donor                   -> that donor (auto-merge).
  3. No email, exact same name, and that donor came from this same source
     before (e.g. a monthly Benevity giver)            -> that donor.
  4. Otherwise                                          -> new donor.
  Then every new donor is fuzzy-compared to everyone else; close matches go to
  duplicate_candidates for an admin to confirm. Fuzzy matches never auto-merge.
"""

import re
from collections import Counter
from dataclasses import dataclass, field

from rapidfuzz import fuzz, process

from .normalize import (
    clean, clean_id, display_name, is_anonymous, name_key, norm_email,
    norm_phone, parse_amount, parse_date, row_hash, split_name,
)

NAME_MATCH = 90          # token_sort_ratio for "probably the same person"
NAME_MATCH_SAME_PHONE = 60
_BAD_STATUS = re.compile(r"refund|fail|cancel|declin|void|pending", re.I)
_FUNDER_WORDS = re.compile(r"funder|foundation|corporat|grant|organi[sz]ation|business|company", re.I)

Ref = int | str  # int = existing donor id, str = "new:N" for a donor this import creates


@dataclass
class Existing:
    donors: list[dict]                         # id, first_name, last_name, organization_name, email, phone, active, merged_into
    source_ids: dict[tuple[str, str], int]     # (source, external_id) -> donor_id
    donor_sources: dict[int, set[str]]         # donor_id -> sources it was imported from
    gift_ids: set[tuple[str, str]]             # (source, external_id) of stored gifts
    programs: dict[str, int]                   # lowercased program name -> id
    candidate_pairs: set[tuple[int, int]]      # (low id, high id) already queued


@dataclass
class NewDonor:
    ref: str
    first_name: str | None
    last_name: str | None
    organization_name: str | None
    email: str | None
    phone: str | None
    donor_type: str = "individual"
    active: bool = True
    inactive_reason: str | None = None

    def insert_row(self) -> dict:
        row = {
            "first_name": self.first_name,
            "last_name": self.last_name,
            "organization_name": self.organization_name,
            "email": self.email,
            "phone": self.phone,
            "donor_type": self.donor_type,
            "active": self.active,
        }
        if self.inactive_reason:
            row["inactive_reason"] = self.inactive_reason
        return row


@dataclass
class Plan:
    new_donors: list[NewDonor] = field(default_factory=list)
    donor_updates: dict[int, dict] = field(default_factory=dict)
    sources: list[dict] = field(default_factory=list)      # has "donor_ref"
    gifts: list[dict] = field(default_factory=list)        # has "donor_ref"
    candidates: list[tuple[Ref, Ref, float, str]] = field(default_factory=list)
    stats: Counter = field(default_factory=Counter)
    skipped: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def build_plan(rows: list[tuple[int, dict]], mapping: dict[str, str],
               source: str, existing: Existing) -> Plan:
    """rows: (line number in the file, {header: cell})."""
    plan = Plan()
    by_id = {d["id"]: d for d in existing.donors}

    def resolve(donor_id: int) -> int:
        """Follow merged_into so gifts land on the kept donor."""
        seen = set()
        while by_id.get(donor_id, {}).get("merged_into") and donor_id not in seen:
            seen.add(donor_id)
            donor_id = by_id[donor_id]["merged_into"]
        return donor_id

    email_index: dict[str, int] = {}
    name_index: dict[str, list[int]] = {}
    for d in existing.donors:
        if d.get("merged_into"):
            continue
        e = norm_email(d.get("email"))
        if e:
            email_index.setdefault(e, d["id"])
        k = name_key(d.get("first_name"), d.get("last_name"), d.get("organization_name"))
        if k:
            name_index.setdefault(k, []).append(d["id"])

    new_by_email: dict[str, NewDonor] = {}
    new_by_name: dict[str, NewDonor] = {}
    seen_ext: set[str] = set()
    anon_label = f"Anonymous donors ({source.capitalize()})"
    anon_ref: Ref | None = None
    has_amount = "amount" in mapping

    def get(cells: dict, f: str):
        col = mapping.get(f)
        return cells.get(col) if col else None

    def skip(line: int, reason: str):
        plan.stats["rows_skipped"] += 1
        plan.skipped.append({"line": line, "reason": reason})

    def new_donor(**kw) -> NewDonor:
        nd = NewDonor(ref=f"new:{len(plan.new_donors)}", **kw)
        plan.new_donors.append(nd)
        return nd

    def fill_blanks(donor_id: int, **values):
        d = by_id.get(donor_id)
        if not d or not d.get("active", True):
            return
        upd = plan.donor_updates.setdefault(donor_id, {})
        for k, v in values.items():
            if v and not clean(d.get(k)) and k not in upd:
                if k == "email":
                    if v in email_index:
                        continue
                    email_index[v] = donor_id
                upd[k] = v
        if not upd:
            del plan.donor_updates[donor_id]

    for line, cells in rows:
        plan.stats["rows_read"] += 1

        status = clean(get(cells, "status"))
        if status and _BAD_STATUS.search(status):
            skip(line, f"payment status is '{status}'")
            continue

        first, last = clean(get(cells, "first_name")), clean(get(cells, "last_name"))
        full, org = clean(get(cells, "full_name")), clean(get(cells, "organization_name"))
        if not (first or last) and full:
            first, last = split_name(full)
        raw_email = clean(get(cells, "email"))
        email = norm_email(raw_email)
        if raw_email and not email:
            plan.stats["invalid_emails"] += 1
        phone = clean(get(cells, "phone"))

        amount = parse_amount(get(cells, "amount")) if has_amount else None
        anonymous = is_anonymous(first, last, org) or (
            not (first or last or org or email) and amount is not None)
        if not (first or last or org or email) and not anonymous:
            skip(line, "no name, organization or email")
            continue

        ext_id = clean_id(get(cells, "external_id")) or row_hash(source, cells)
        if ext_id in seen_ext:
            skip(line, "same row appears earlier in this file")
            continue
        seen_ext.add(ext_id)
        key = (source, ext_id)
        already = key in existing.source_ids

        # ---- which donor is this? ----
        ref: Ref
        if already:
            ref = resolve(existing.source_ids[key])
            plan.stats["rows_already_imported"] += 1
        elif anonymous:
            if anon_ref is None:
                ids = name_index.get(name_key(None, None, anon_label))
                if ids:
                    anon_ref = resolve(ids[0])
                else:
                    anon_ref = new_donor(
                        first_name=None, last_name=None, organization_name=anon_label,
                        email=None, phone=None, active=False, inactive_reason="anonymous",
                    ).ref
            ref = anon_ref
            plan.stats["anonymous_rows"] += 1
        else:
            nk = name_key(first, last, org)
            if email and email in email_index:
                ref = resolve(email_index[email])
                plan.stats["matched_by_email"] += 1
                fill_blanks(ref, first_name=first, last_name=last,
                            organization_name=org, phone=phone)
            elif email and email in new_by_email:
                ref = new_by_email[email].ref
            elif nk in new_by_name and (not email or not new_by_name[nk].email):
                nd = new_by_name[nk]
                if email:
                    nd.email = email
                    new_by_email[email] = nd
                nd.phone = nd.phone or phone
                ref = nd.ref
            else:
                same_source = [i for i in name_index.get(nk, [])
                               if source in existing.donor_sources.get(i, set())]
                if not email and same_source:
                    ref = resolve(same_source[0])
                    plan.stats["matched_by_name_same_source"] += 1
                    fill_blanks(ref, phone=phone)
                else:
                    dtype_raw = clean(get(cells, "donor_type")) or ""
                    is_funder = bool(_FUNDER_WORDS.search(dtype_raw)) or (org and not (first or last))
                    nd = new_donor(
                        first_name=first, last_name=last, organization_name=org,
                        email=email, phone=phone,
                        donor_type="funder" if is_funder else "individual",
                    )
                    if email:
                        new_by_email[email] = nd
                    if nk:
                        new_by_name.setdefault(nk, nd)
                    ref = nd.ref

        if isinstance(ref, int) and not by_id.get(ref, {}).get("active", True):
            plan.stats["rows_for_inactive_donors"] += 1

        # ---- gift ----
        if has_amount:
            gift_date = parse_date(get(cells, "date"))
            if amount is None:
                if clean(get(cells, "amount")):
                    plan.stats["gifts_skipped_bad_amount"] += 1
            elif gift_date is None:
                plan.stats["gifts_skipped_bad_date"] += 1
                plan.skipped.append({"line": line, "reason": "gift has no readable date"})
            elif key in existing.gift_ids:
                plan.stats["gifts_already_imported"] += 1
            else:
                program_name = clean(get(cells, "program"))
                program_id = existing.programs.get(program_name.lower()) if program_name else None
                if program_name and program_id is None:
                    plan.stats["gifts_unknown_program"] += 1
                plan.gifts.append({
                    "donor_ref": ref,
                    "amount": str(amount),
                    "gift_date": gift_date.isoformat(),
                    "source": source,
                    "campaign": clean(get(cells, "campaign")),
                    "program_id": program_id,
                    "external_id": ext_id,
                })

        # ---- source record (the trace for merges) ----
        if not already:
            plan.sources.append({
                "donor_ref": ref,
                "source": source,
                "external_name": display_name(first, last, org) or None,
                "external_email": raw_email,
                "external_id": ext_id,
                # Only the columns we use, not the whole export row (data minimization).
                "raw": {col: cells.get(col) for col in mapping.values()},
            })

    _find_fuzzy_duplicates(plan, existing, anon_label)

    plan.stats["donors_to_create"] = sum(1 for d in plan.new_donors if d.active)
    plan.stats["donors_to_update"] = len(plan.donor_updates)
    plan.stats["gifts_to_create"] = len(plan.gifts)
    plan.stats["sources_to_create"] = len(plan.sources)
    plan.stats["duplicate_candidates"] = len(plan.candidates)

    if plan.stats["invalid_emails"]:
        plan.warnings.append(f"{plan.stats['invalid_emails']} rows had an email that isn't valid; it was ignored.")
    if plan.stats["gifts_unknown_program"]:
        plan.warnings.append(
            f"{plan.stats['gifts_unknown_program']} gifts name a program that isn't in Programs; "
            "they were saved without a program.")
    return plan


Person = tuple[str, str | None, str | None]  # (display name, normalized phone, normalized email)


def _existing_people(donors: list[dict], anon_label: str | None = None) -> dict[Ref, Person]:
    """Active, un-merged donors that have a name, keyed by id."""
    anon_key = name_key(None, None, anon_label) if anon_label else None
    people: dict[Ref, Person] = {}
    for d in donors:
        if d.get("merged_into") or not d.get("active", True):
            continue
        name = display_name(d.get("first_name"), d.get("last_name"), d.get("organization_name"))
        if name and name_key(None, None, name) != anon_key:
            people[d["id"]] = (name, norm_phone(d.get("phone")), norm_email(d.get("email")))
    return people


def _matches(ref: Ref, people: dict[Ref, Person], choices: dict[Ref, str]):
    """Yield (other_ref, score, reason) for everyone who looks like `ref`.
    Same rules for imports and manual adds: name score >= NAME_MATCH, or a
    looser name match plus the same phone. Exact-email pairs are skipped
    because those are auto-merged (or blocked by the unique index), not reviewed."""
    name, phone, email = people[ref]
    for _, score, other in process.extract(
            name, choices, scorer=fuzz.token_sort_ratio,
            score_cutoff=NAME_MATCH_SAME_PHONE, limit=10):
        if other == ref:
            continue
        _, other_phone, other_email = people[other]
        if email and other_email and email == other_email:
            continue
        same_phone = bool(phone and phone == other_phone)
        if score >= NAME_MATCH or same_phone:
            yield other, round(score, 2), f"name {score:.0f}" + (" + same phone" if same_phone else "")


def find_duplicates_for(donor: dict, all_donors: list[dict]) -> list[tuple[int, float, str]]:
    """Fuzzy matches for ONE donor (e.g. one just added by hand) against all others.
    `donor` must include its id; `all_donors` may include it too (it's skipped)."""
    people = _existing_people(all_donors)
    people[donor["id"]] = (
        display_name(donor.get("first_name"), donor.get("last_name"), donor.get("organization_name")),
        norm_phone(donor.get("phone")), norm_email(donor.get("email")))
    if not people[donor["id"]][0]:
        return []
    choices = {ref: name for ref, (name, _, _) in people.items()}
    return list(_matches(donor["id"], people, choices))


def _find_fuzzy_duplicates(plan: Plan, existing: Existing, anon_label: str):
    people = _existing_people(existing.donors, anon_label)
    for nd in plan.new_donors:
        if nd.active:
            people[nd.ref] = (display_name(nd.first_name, nd.last_name, nd.organization_name),
                              norm_phone(nd.phone), nd.email)

    choices = {ref: name for ref, (name, _, _) in people.items()}
    seen: set[frozenset] = set()
    for nd in plan.new_donors:
        if not nd.active or nd.ref not in people:
            continue
        for other, score, reason in _matches(nd.ref, people, choices):
            pair = frozenset((nd.ref, other))
            if pair in seen:
                continue
            seen.add(pair)
            plan.candidates.append((nd.ref, other, score, reason))
