"""Read API for CIC's org dashboard (P0 8), plus the admin endpoints that manage its keys.

  POST /admin/api-keys              admin: create a key (shown once)
  GET  /admin/api-keys              admin: list keys (never the key itself)
  POST /admin/api-keys/{id}/revoke  admin: switch a key off immediately
  GET  /api/v1/summary              X-API-Key: aggregated totals, no donor PII

The key endpoints live here (not admin.py) so the two backend devs don't edit
the same file. Paths are written in full because main.py includes one router per file.
"""

import hashlib
import secrets
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from ..auth import User, require_role
from ..common import fetch_all
from ..db import service_client

router = APIRouter()  # no prefix: full paths below
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

ADMIN_ONLY = [Depends(require_role("admin"))]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_key(key: str) -> str:
    """Keys are stored like passwords: only the SHA-256 hash, never the key."""
    return hashlib.sha256(key.encode()).hexdigest()


# ---------------------------------------------------------------- key management

class KeyIn(BaseModel):
    name: str  # "CIC org dashboard"


@router.post("/admin/api-keys", status_code=201, tags=["admin"], dependencies=ADMIN_ONLY)
def create_key(body: KeyIn, user: User):
    key = "cic_" + secrets.token_urlsafe(32)
    row = user.db.table("api_keys").insert({
        "name": body.name, "key_hash": hash_key(key), "created_by": user.id,
    }).execute().data[0]
    return {"id": row["id"], "name": row["name"], "key": key,
            "warning": "Copy this key now. It can't be shown again."}


@router.get("/admin/api-keys", tags=["admin"], dependencies=ADMIN_ONLY)
def list_keys(user: User):
    return (user.db.table("api_keys")
            .select("id, name, created_at, last_used_at, revoked_at")  # never the hash
            .order("created_at", desc=True).execute().data)


@router.post("/admin/api-keys/{key_id}/revoke", tags=["admin"], dependencies=ADMIN_ONLY)
def revoke_key(key_id: int, user: User):
    rows = (user.db.table("api_keys").update({"revoked_at": now_iso()})
            .eq("id", key_id).execute().data)
    if not rows:
        raise HTTPException(404, "Key not found")
    return {"revoked": key_id}


# ---------------------------------------------------------------- key check

def require_api_key(key: str | None = Security(api_key_header)) -> dict:
    if not key:
        raise HTTPException(401, "Missing X-API-Key header")
    sdb = service_client()  # no logged-in user here; we checked the key ourselves
    rows = (sdb.table("api_keys").select("id, name, revoked_at")
            .eq("key_hash", hash_key(key)).limit(1).execute().data)
    if not rows or rows[0]["revoked_at"]:
        raise HTTPException(401, "Invalid or revoked API key")
    sdb.table("api_keys").update({"last_used_at": now_iso()}).eq("id", rows[0]["id"]).execute()
    return rows[0]


# ---------------------------------------------------------------- summary

def period_key(d: str, period: str) -> str:
    y, m = int(d[:4]), int(d[5:7])
    if period == "year":
        return str(y)
    if period == "quarter":
        return f"{y}-Q{(m - 1) // 3 + 1}"
    return f"{y}-{m:02d}"


class Bucket:
    def __init__(self):
        self.amount, self.gifts, self.donors = 0.0, 0, set()

    def add(self, g: dict):
        self.amount += float(g["amount"])
        self.gifts += 1
        self.donors.add(g["donor_id"])

    def out(self) -> dict:
        return {"amount": round(self.amount, 2), "gifts": self.gifts,
                "donors": len(self.donors)}


@router.get("/api/v1/summary", tags=["read API"])
def summary(period: Literal["month", "quarter", "year"] = "quarter",
            start: date | None = None, end: date | None = None,
            api_key: dict = Depends(require_api_key)):
    """Totals by period, program, source and board member, a retention snapshot,
    and the last 30 days of activity. No donor names, emails or phone numbers."""
    sdb = service_client()
    end = end or date.today()
    start = start or date(end.year - 1, 1, 1)  # default: last year + this year
    today = date.today()
    d30 = (today - timedelta(days=30)).isoformat()
    d90 = (today - timedelta(days=90)).isoformat()

    gifts = fetch_all(lambda: sdb.table("gifts")
                      .select("donor_id, amount, gift_date, source, programs(name)")
                      .gte("gift_date", start.isoformat()).lte("gift_date", end.isoformat())
                      .order("gift_date", desc=True))
    donors = {d["id"]: d for d in fetch_all(
        lambda: sdb.table("donors").select("id, owner_id, active, created_at"))}
    users = {u["id"]: u for u in sdb.table("users").select("id, name, role, active").execute().data}
    sent_90 = fetch_all(lambda: sdb.table("communications").select("donor_id, sent_at")
                        .eq("status", "sent").gte("sent_at", d90))
    open_steps = fetch_all(lambda: sdb.table("next_steps").select("assigned_to, due_date")
                           .eq("done", False))
    retention = fetch_all(lambda: sdb.table("donor_retention").select("status")
                          .eq("year", today.year))

    total, by_period = Bucket(), defaultdict(Bucket)
    by_program, by_source, by_member = defaultdict(Bucket), defaultdict(Bucket), defaultdict(Bucket)
    for g in gifts:
        total.add(g)
        by_period[period_key(g["gift_date"], period)].add(g)
        by_program[(g.get("programs") or {}).get("name") or "Unrestricted"].add(g)
        by_source[g["source"]].add(g)
        by_member[(donors.get(g["donor_id"]) or {}).get("owner_id")].add(g)

    touched = {c["donor_id"] for c in sent_90}
    board = []
    for uid, u in users.items():
        if u["role"] != "board_member" or not u["active"]:
            continue
        owned = [i for i, d in donors.items() if d["owner_id"] == uid and d["active"]]
        board.append({
            "board_member": u["name"],
            "donors_owned": len(owned),
            "donors_contacted_90d": sum(1 for i in owned if i in touched),
            "overdue_next_steps": sum(1 for s in open_steps
                                      if s["assigned_to"] == uid
                                      and s["due_date"] < today.isoformat()),
            **by_member[uid].out(),  # giving in the period from donors they own
        })

    recent = [g for g in gifts if g["gift_date"] >= d30]
    return {
        "generated_at": now_iso(),
        "range": {"start": start.isoformat(), "end": end.isoformat(), "period": period},
        "totals": {**total.out(),
                   "average_gift": round(total.amount / total.gifts, 2) if total.gifts else 0},
        "by_period": [{"period": k, **b.out()} for k, b in sorted(by_period.items())],
        "by_program": sorted(({"program": k, **b.out()} for k, b in by_program.items()),
                             key=lambda r: -r["amount"]),
        "by_source": [{"source": k, **b.out()} for k, b in by_source.items()],
        "by_board_member": sorted(board, key=lambda r: r["board_member"]),
        "retention_this_year": dict(Counter(r["status"] for r in retention)),
        "recent_activity_30d": {
            "gifts": len(recent),
            "amount": round(sum(float(g["amount"]) for g in recent), 2),
            "new_donors": sum(1 for d in donors.values() if (d["created_at"] or "") >= d30),
            "messages_sent": sum(1 for c in sent_90 if c["sent_at"] >= d30),
            "latest_gifts": [{  # no names: the dashboard doesn't need who
                "date": g["gift_date"], "amount": float(g["amount"]),
                "program": (g.get("programs") or {}).get("name") or "Unrestricted",
                "source": g["source"],
            } for g in recent[:10]],
        },
    }
