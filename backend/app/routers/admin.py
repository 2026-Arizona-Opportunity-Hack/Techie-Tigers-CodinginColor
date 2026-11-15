from datetime import date, timedelta
from fastapi import APIRouter, Depends
from ..auth import CurrentUser, require_roles
from ..common import fetch_all

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