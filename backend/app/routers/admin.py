from collections import Counter, defaultdict
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import CurrentUser, require_roles
from ..common import fetch_all
from .reports import year_summary

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/board-summary")
def board_summary(user: CurrentUser = Depends(require_roles("admin", "fundraising"))):
    db = user.db
    today = date.today().isoformat()
    since = (date.today() - timedelta(days=90)).isoformat()

    members = [u for u in db.table("user_directory").select("*").execute().data
               if u["role"] == "board_member" and u["active"]]
    donors = fetch_all(lambda: db.table("donors").select("id, owner_id").eq("active", True))
    sent = fetch_all(lambda: db.table("communications").select("donor_id, user_id, sent_at")
                     .eq("status", "sent").gte("sent_at", since))
    open_steps = fetch_all(lambda: db.table("next_steps").select("assigned_to, due_date")
                           .eq("done", False))
    touched = {c["donor_id"] for c in sent}

    rows = []
    for m in members:
        mine = [d["id"] for d in donors if d["owner_id"] == m["id"]]
        hit = sum(1 for d in mine if d in touched)
        rows.append({
            "id": m["id"], "name": m["name"], "donors": len(mine),
            "touched_90d": hit,
            "touched_pct": round(100 * hit / len(mine)) if mine else None,
            "overdue_steps": sum(1 for s in open_steps
                                 if s["assigned_to"] == m["id"] and s["due_date"] < today),
            "last_outreach_90d": max((c["sent_at"] for c in sent if c["user_id"] == m["id"]),
                                     default=None),
        })
    rows.sort(key=lambda r: r["touched_pct"] if r["touched_pct"] is not None else 101)
    return {"members": rows,  # least-contacted first: who needs a nudge
            "unassigned_donors": sum(1 for d in donors if not d["owner_id"])}

# ---- Board member list and drill-down (CEO and fundraising team) ----

def _board_members(db) -> list[dict]:
    return sorted((u for u in db.table("user_directory").select("*").execute().data
                   if u["role"] == "board_member"), key=lambda u: u["name"])


def _owned_donors(db, owner_id: str | None = None) -> list[dict]:
    """Donors (active and inactive, not merged) with their owner. Inactive donors
    still count toward totals: their gifts are history."""
    def build():
        q = db.table("donors").select("id, owner_id, active").is_("merged_into", "null")
        return q.eq("owner_id", owner_id) if owner_id else q
    return fetch_all(build)


def _gifts(db) -> list[dict]:
    return fetch_all(lambda: db.table("gifts").select("donor_id, amount, gift_date"))


@router.get("/board-members")
def board_members(user: CurrentUser = Depends(require_roles("admin", "fundraising"))):
    """Every board member with how many donors they own and what those donors gave."""
    db = user.db
    year = str(date.today().year)
    donors = _owned_donors(db)
    owner_of = {d["id"]: d["owner_id"] for d in donors}
    active_count = Counter(d["owner_id"] for d in donors if d["active"])

    totals = defaultdict(lambda: {"total_raised": 0.0, "raised_this_year": 0.0, "gift_count": 0})
    for g in _gifts(db):
        owner = owner_of.get(g["donor_id"])
        if not owner:
            continue
        t = totals[owner]
        t["total_raised"] += float(g["amount"])
        t["gift_count"] += 1
        if g["gift_date"].startswith(year):
            t["raised_this_year"] += float(g["amount"])

    return [{
        "id": m["id"], "name": m["name"], "active": m["active"],
        "donors": active_count[m["id"]],
        "total_raised": round(totals[m["id"]]["total_raised"], 2),
        "raised_this_year": round(totals[m["id"]]["raised_this_year"], 2),
        "gift_count": totals[m["id"]]["gift_count"],
    } for m in _board_members(db)]


@router.get("/board-members/{member_id}")
def board_member_detail(member_id: str,
                        user: CurrentUser = Depends(require_roles("admin", "fundraising"))):
    """One board member's totals and their donors' retention, year by year.
    Their donor list comes from GET /donors?owner_id=<id>."""
    db = user.db
    member = next((m for m in _board_members(db) if m["id"] == member_id), None)
    if not member:
        raise HTTPException(404, "Board member not found")

    donors = _owned_donors(db, member_id)
    mine = {d["id"] for d in donors}
    year = str(date.today().year)
    gifts = [g for g in _gifts(db) if g["donor_id"] in mine]

    rows = [r for r in fetch_all(lambda: db.table("donor_retention")
                                 .select("donor_id, year, total, prev_total, status"))
            if r["donor_id"] in mine]
    current = date.today().year
    by_year = defaultdict(list)
    for r in rows:
        by_year[r["year"]].append(r)
    series = [year_summary(y, by_year[y], current) for y in sorted(by_year)]

    return {
        "id": member["id"], "name": member["name"], "active": member["active"],
        "donors": sum(1 for d in donors if d["active"]),
        "total_raised": round(sum(float(g["amount"]) for g in gifts), 2),
        "raised_this_year": round(sum(float(g["amount"]) for g in gifts
                                      if g["gift_date"].startswith(year)), 2),
        "gift_count": len(gifts),
        "retention": series,  # oldest year first; the last entry is the latest year
    }


class MemberStatusIn(BaseModel):
    active: bool


@router.patch("/board-members/{member_id}")
def set_board_member_active(member_id: str, body: MemberStatusIn,
                            user: CurrentUser = Depends(require_roles("admin"))):
    """CEO only: mark a board member active or inactive. An inactive member can't
    log in and gets no new round-robin donors. Donors they already own stay with
    them until the CEO reassigns them (the owner picker flags the old owner)."""
    if not any(m["id"] == member_id for m in _board_members(user.db)):
        raise HTTPException(404, "Board member not found")
    res = (user.db.table("users").update({"active": body.active})
           .eq("id", member_id).eq("role", "board_member").execute())
    if not res.data:
        raise HTTPException(403, "Couldn't update this board member")
    row = res.data[0]
    return {"id": row["id"], "name": row["name"], "active": row["active"]}
