import re
from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel

from ..auth import User, require_roles
from ..common import fetch_all, user_names, donor_display_name
from ..db import service_client
from ..importers.dedupe import find_duplicates_for
from ..importers.normalize import clean, norm_email, norm_phone
from ..templates import contact_links

router = APIRouter(prefix="/donors", tags=["donors"])

DONOR_FIELDS = (
    "id, first_name, last_name, organization_name, email, phone, "
    "donor_type, owner_id, active, last_thanked_at, created_at"
)

# Admin-only routes: put this in the decorator and keep `user: User` as the parameter.
# FastAPI caches get_current_user per request, so the login is only checked once.
ADMIN_ONLY = [Depends(require_roles("admin"))]


# ---------- helpers ----------

def _get_one(user: User, donor_id: int, fields: str = DONOR_FIELDS) -> dict:
    rows = user.db.table("donors").select(fields).eq("id", donor_id).limit(1).execute().data
    if not rows:
        # Same 404 whether it doesn't exist or RLS hid it, so ids can't be probed.
        raise HTTPException(404, "Donor not found")
    return rows[0]


def _db_error(e: APIError):
    if e.code == "23505":  # unique violation on email
        raise HTTPException(409, "A donor with this email already exists")
    raise HTTPException(400, e.message)  # e.g. a trigger's "Only admins can ..."


def _gift_stats(db, donor_ids: list[int]) -> dict[int, dict]:
    stats = defaultdict(lambda: {"lifetime_total": 0.0, "gift_count": 0, "last_gift_date": None})
    if not donor_ids:
        return stats
    wanted = set(donor_ids)
    if len(donor_ids) <= 100:
        build = lambda: (db.table("gifts").select("donor_id, amount, gift_date")
                         .in_("donor_id", donor_ids))
    else:  # a long id list makes the URL too long; RLS already limits rows to this user's donors
        build = lambda: db.table("gifts").select("donor_id, amount, gift_date")
    for g in fetch_all(build):
        if g["donor_id"] not in wanted:
            continue
        s = stats[g["donor_id"]]
        s["lifetime_total"] += float(g["amount"])
        s["gift_count"] += 1
        if not s["last_gift_date"] or g["gift_date"] > s["last_gift_date"]:
            s["last_gift_date"] = g["gift_date"]
    return stats


def _decorate(db, donors: list[dict]) -> list[dict]:
    names = user_names(db)
    stats = _gift_stats(db, [d["id"] for d in donors])
    return [{**d, "display_name": donor_display_name(d),
             "owner_name": names.get(d["owner_id"]), **stats[d["id"]]}
            for d in donors]


# ---------- read ----------

@router.get("")
def list_donors(
    user: User,
    include_inactive: bool = False,
    q: str | None = None,             # search name, organization, or email
    owner_id: str | None = None,      # staff: filter to one board member
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),     # paging: offset=100 for the second page
):
    """Board members only get their own donors back; staff get everyone.
    That filtering is done by Postgres RLS, not here."""
    query = user.db.table("donors").select(DONOR_FIELDS).is_("merged_into", "null")
    if not include_inactive:
        query = query.eq("active", True)
    if owner_id:
        query = query.eq("owner_id", owner_id)
    if q:
        term = re.sub(r"[,()*%]", " ", q).strip()  # these characters break the filter syntax
        if term:
            query = query.or_(f"first_name.ilike.%{term}%,last_name.ilike.%{term}%,"
                              f"organization_name.ilike.%{term}%,email.ilike.%{term}%")
    rows = query.order("last_name").range(offset, offset + limit - 1).execute().data
    return _decorate(user.db, rows)


@router.get("/{donor_id}")
def get_donor(donor_id: int, user: User):
    return _decorate(user.db, [_get_one(user, donor_id)])[0]


@router.get("/{donor_id}/timeline")
def timeline(donor_id: int, user: User):
    """Gifts, sent messages and finished to-dos newest first, plus open drafts and to-dos."""
    donor = _get_one(user, donor_id)
    db, names = user.db, user_names(user.db)

    gifts = (db.table("gifts")
             .select("id, amount, gift_date, source, campaign, programs(name)")
             .eq("donor_id", donor_id).execute().data)
    comms = (db.table("communications")
             .select("id, user_id, channel, kind, subject, body, status, "
                     "ai_generated, created_at, sent_at")
             .eq("donor_id", donor_id).execute().data)
    steps = (db.table("next_steps")
             .select("id, description, due_date, done, assigned_to, completed_at, "
                     "created_at, events(name, event_date)")
             .eq("donor_id", donor_id).execute().data)

    history, open_items = [], []
    for g in gifts:
        history.append({
            "type": "gift", "date": g["gift_date"], "id": g["id"],
            "title": f"${float(g['amount']):,.2f} gift",
            "detail": " · ".join(filter(None, [
                g["source"], g["campaign"], (g.get("programs") or {}).get("name")])),
        })
    for c in comms:
        item = {
            "type": "message", "id": c["id"], "status": c["status"],
            "date": c["sent_at"] or c["created_at"],
            "title": f"{(c['kind'] or 'message').replace('_', ' ')} · {c['channel'] or ''}",
            "by": names.get(c["user_id"]) or "System draft",
            "subject": c["subject"], "body": c["body"],
            "ai_generated": c["ai_generated"],
        }
        (open_items if c["status"] == "draft" else history).append(item)
    for s in steps:
        item = {
            "type": "next_step", "id": s["id"], "done": s["done"],
            "date": s["completed_at"] if s["done"] else s["due_date"],
            "title": s["description"],
            "assigned_to": names.get(s["assigned_to"]),
            "event": s.get("events"),
        }
        (history if s["done"] else open_items).append(item)

    history.sort(key=lambda x: x["date"] or "", reverse=True)
    open_items.sort(key=lambda x: x["date"] or "")  # soonest due first
    return {
        "donor": _decorate(db, [donor])[0],
        "open": open_items,
        "history": history,
    }


@router.get("/{donor_id}/contact-links")
def get_contact_links(donor_id: int, user: User):
    d = _get_one(user, donor_id, "email, phone, active")
    if not d["active"]:
        raise HTTPException(400, "This donor is inactive")
    return contact_links(d["email"], d["phone"])


# ---------- write ----------

class DonorIn(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    organization_name: str | None = None
    email: str | None = None
    phone: str | None = None
    donor_type: Literal["individual", "funder"] = "individual"
    owner_id: str | None = None  # admin only; ignored for everyone else


class DonorEdit(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    organization_name: str | None = None
    email: str | None = None
    phone: str | None = None


class OwnerIn(BaseModel):
    owner_id: str


class DeactivateIn(BaseModel):
    reason: str | None = None


@router.post("", status_code=201)
def add_donor(body: DonorIn, user: User):
    row = {
        "first_name": clean(body.first_name), "last_name": clean(body.last_name),
        "organization_name": clean(body.organization_name),
        "email": norm_email(body.email), "phone": norm_phone(body.phone),
        "donor_type": body.donor_type,
    }
    if not any((row["first_name"], row["last_name"], row["organization_name"])):
        raise HTTPException(422, "A name or organization is required")
    # Who owns the new donor:
    #   board member -> themselves
    #   admin        -> body.owner_id, or round-robin if not given
    #   fundraising  -> always round-robin (only the CEO assigns owners)
    # The database enforces the same rules (donors_staff_insert policy and the
    # round-robin trigger), so this is just the friendly version.
    if user.role == "board_member":
        row["owner_id"] = user.id
    elif user.is_admin:
        row["owner_id"] = body.owner_id
    try:
        donor = user.db.table("donors").insert(row).execute().data[0]
    except APIError as e:
        _db_error(e)
    donor["possible_duplicates"] = _queue_duplicates(donor)
    return donor


def _queue_duplicates(donor: dict) -> int:
    """Run the import's fuzzy match on a hand-added donor and queue any hits
    for the CEO's review. Returns only a count: a board member can't see other
    members' donors, so we don't say who matched."""
    sdb = service_client()  # must compare against ALL donors, not just the ones RLS shows this user
    others = fetch_all(lambda: sdb.table("donors").select(
        "id, first_name, last_name, organization_name, email, phone, active, merged_into"))
    pairs = []
    for other_id, score, reason in find_duplicates_for(donor, others):
        lo, hi = sorted((donor["id"], other_id))
        pairs.append({"donor_id": lo, "candidate_id": hi, "score": score,
                      "reason": f"{reason} (added by hand)"})
    if pairs:
        sdb.table("duplicate_candidates").upsert(
            pairs, on_conflict="donor_id,candidate_id", ignore_duplicates=True).execute()
    return len(pairs)


@router.patch("/{donor_id}")
def edit_donor(donor_id: int, body: DonorEdit, user: User):
    changes = body.model_dump(exclude_unset=True)  # only the fields actually sent
    if not changes:
        raise HTTPException(422, "Nothing to change")
    if "email" in changes:
        changes["email"] = norm_email(changes["email"])
    if "phone" in changes:
        changes["phone"] = norm_phone(changes["phone"])
    try:
        rows = user.db.table("donors").update(changes).eq("id", donor_id).execute().data
    except APIError as e:
        _db_error(e)
    if not rows:  # RLS hid it: not your donor, or fundraising (who can't edit)
        raise HTTPException(404, "Donor not found")
    return rows[0]


@router.patch("/{donor_id}/owner", dependencies=ADMIN_ONLY)
def reassign(donor_id: int, body: OwnerIn, user: User):
    target = (user.db.table("user_directory").select("id, role, active")
              .eq("id", body.owner_id).limit(1).execute().data)
    if not target or not target[0]["active"] or target[0]["role"] != "board_member":
        raise HTTPException(400, "Owner must be an active board member")
    rows = user.db.table("donors").update({"owner_id": body.owner_id}).eq("id", donor_id).execute().data
    if not rows:
        raise HTTPException(404, "Donor not found")
    return rows[0]


@router.post("/{donor_id}/deactivate")
def deactivate(donor_id: int, body: DeactivateIn, user: User):
    try:
        rows = (user.db.table("donors")
                .update({"active": False, "inactive_reason": clean(body.reason)})
                .eq("id", donor_id).execute().data)
    except APIError as e:
        _db_error(e)
    if not rows:
        raise HTTPException(404, "Donor not found")
    return rows[0]  # the database trigger already closed open to-dos and skipped drafts


@router.post("/{donor_id}/reactivate", dependencies=ADMIN_ONLY)
def reactivate(donor_id: int, user: User):
    rows = user.db.table("donors").update({"active": True}).eq("id", donor_id).execute().data
    if not rows:
        raise HTTPException(404, "Donor not found")
    return rows[0]