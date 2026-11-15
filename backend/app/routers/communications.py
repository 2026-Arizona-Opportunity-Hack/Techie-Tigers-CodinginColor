from datetime import date, datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel
from ..auth import CurrentUser, get_current_user, require_roles
from ..common import user_names, donor_display_name, get_donor_or_404
from ..db import service_client
from ..templates import thank_you, contact_links, quarterly_update


router = APIRouter(prefix="/communications", tags=["communications"])
Kind = Literal["thank_you", "quarterly", "follow_up", "update", "event_invite", "other"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LogIn(BaseModel):
    donor_id: int
    channel: Literal["email", "text", "call", "in_person"]
    kind: Kind = "follow_up"
    subject: str | None = None
    body: str | None = None  # what was said, e.g. "Left voicemail"


@router.post("/log", status_code=201)
def log_outreach(body: LogIn, user: CurrentUser = Depends(get_current_user)):
    try:
        res = user.db.table("communications").insert({
            **body.model_dump(),
            "user_id": user.id,  # RLS requires you log as yourself
            "status": "sent", "sent_at": now_iso(),
        }).execute()
    except APIError as e:  # e.g. "This donor is inactive", or not your donor
        raise HTTPException(400, e.message)
    return res.data[0]

def create_thank_you_draft(db, gift_id: int, user_id: str | None = None):
    """Shared by the endpoint (db = user.db) and the importer (db = service_client).
    Returns the new draft, or None if this gift can't or shouldn't be thanked."""
    res = (db.table("gifts")
           .select("id, donor_id, amount, gift_date, programs(name), "
                   "donors(first_name, organization_name, email, phone, active)")
           .eq("id", gift_id).maybe_single().execute())
    if not res or not res.data:
        return None
    g, d = res.data, res.data["donors"]
    if not d["active"]:
        return None
    channel = "email" if d["email"] else "text" if d["phone"] else None
    if not channel:
        return None
    # Already thanked (or drafted) since this gift? Don't stack duplicates.
    existing = (db.table("communications").select("id")
                .eq("donor_id", g["donor_id"]).eq("kind", "thank_you")
                .neq("status", "skipped").gte("created_at", g["gift_date"])
                .limit(1).execute().data)
    if existing:
        return None
    subject, body = thank_you(d, g["amount"], (g.get("programs") or {}).get("name"), channel)
    return db.table("communications").insert({
        "donor_id": g["donor_id"], "user_id": user_id, "channel": channel,
        "kind": "thank_you", "subject": subject, "body": body, "status": "draft",
    }).execute().data[0]


def get_comm_or_404(db, cid: int) -> dict:
    res = (db.table("communications")
           .select("*, donors(first_name, last_name, organization_name, email, phone, active)")
           .eq("id", cid).maybe_single().execute())
    if not res or not res.data:
        raise HTTPException(404, "Message not found")
    return res.data


class ThankYouIn(BaseModel):
    gift_id: int


@router.post("/thank-you", status_code=201)
def draft_thank_you(body: ThankYouIn, user: CurrentUser = Depends(get_current_user)):
    try:
        draft = create_thank_you_draft(user.db, body.gift_id, user_id=user.id)
    except APIError as e:
        raise HTTPException(400, e.message)
    if not draft:
        raise HTTPException(400, "Can't draft: gift not found, donor inactive, "
                                 "no email or phone, or already thanked")
    return draft


class QuarterlyIn(BaseModel):
    donor_id: int


@router.post("/quarterly", status_code=201)
def draft_quarterly(body: QuarterlyIn, user: CurrentUser = Depends(get_current_user)):
    """Draft a quarterly update for one donor, pre-filled from the same template
    as the CEO's bulk job. Any role that can see the donor may ask (RLS limits
    board members to their own donors). If a quarterly draft is already waiting
    for this donor, that one is returned instead of stacking a duplicate."""
    d = get_donor_or_404(user.db, body.donor_id,
                         "id, first_name, organization_name, email, phone, active")
    if not d["active"]:
        raise HTTPException(400, "This donor is inactive")
    channel = "email" if d["email"] else "text" if d["phone"] else None
    if not channel:
        raise HTTPException(400, "This donor has no email or phone on file")

    waiting = (user.db.table("communications").select("*")
               .eq("donor_id", d["id"]).eq("kind", "quarterly").eq("status", "draft")
               .limit(1).execute().data)
    if waiting:
        return waiting[0]

    outcomes = (user.db.table("outcomes").select("year, description, programs(name)")
                .order("year", desc=True).limit(8).execute().data)
    jan1 = date(date.today().year, 1, 1).isoformat()
    gifts = (user.db.table("gifts").select("amount, gift_date")
             .eq("donor_id", d["id"]).execute().data)
    given_this_year = sum(float(g["amount"]) for g in gifts if g["gift_date"] >= jan1)
    gave_before = any(g["gift_date"] < jan1 for g in gifts)

    subject, text = quarterly_update(d, outcomes, given_this_year, gave_before)
    try:
        return user.db.table("communications").insert({
            "donor_id": d["id"], "user_id": user.id, "channel": channel,
            "kind": "quarterly", "subject": subject, "body": text,
            "status": "draft", "ai_generated": False,
        }).execute().data[0]
    except APIError as e:
        raise HTTPException(400, e.message)


class DraftEdit(BaseModel):
    subject: str | None = None
    body: str | None = None
    channel: Literal["email", "text"] | None = None


@router.patch("/{cid}")
def edit_draft(cid: int, body: DraftEdit, user: CurrentUser = Depends(get_current_user)):
    changes = body.model_dump(exclude_unset=True)
    # Editing a system draft claims it: RLS requires user_id = you on any update
    res = (user.db.table("communications").update({**changes, "user_id": user.id})
           .eq("id", cid).eq("status", "draft").execute())
    if not res.data:
        raise HTTPException(404, "Draft not found (or already sent)")
    return res.data[0]


@router.get("/{cid}/links")
def draft_links(cid: int, user: CurrentUser = Depends(get_current_user)):
    c = get_comm_or_404(user.db, cid)
    d = c["donors"]
    if c["status"] != "draft":
        raise HTTPException(400, "Only drafts can be opened for sending")
    if not d["active"]:
        raise HTTPException(400, "This donor is inactive")
    text = (c["body"] or "").replace("[Your name]", user.name)
    return contact_links(
        d["email"] if c["channel"] == "email" else None,
        d["phone"] if c["channel"] == "text" else None,
        c["subject"] or "", text)


@router.post("/{cid}/mark-sent")
def mark_sent(cid: int, user: CurrentUser = Depends(get_current_user)):
    c = get_comm_or_404(user.db, cid)
    if c["status"] != "draft":
        raise HTTPException(400, "Already sent or skipped")
    try:
        res = (user.db.table("communications").update({
            "status": "sent", "sent_at": now_iso(), "user_id": user.id,
            "body": (c["body"] or "").replace("[Your name]", user.name),  # history = what was sent
        }).eq("id", cid).eq("status", "draft").execute())
    except APIError as e:
        raise HTTPException(400, e.message)
    if not res.data:
        raise HTTPException(404, "Draft not found")
    if c["kind"] == "thank_you":
        # Fundraising can't update donors under RLS, so set this one field server-side
        service_client().table("donors").update(
            {"last_thanked_at": now_iso()}).eq("id", c["donor_id"]).execute()
    return res.data[0]


@router.post("/{cid}/skip")
def skip(cid: int, user: CurrentUser = Depends(get_current_user)):
    res = (user.db.table("communications")
           .update({"status": "skipped", "user_id": user.id})
           .eq("id", cid).eq("status", "draft").execute())
    if not res.data:
        raise HTTPException(404, "Draft not found")
    return res.data[0]


@router.post("/drafts/dismiss-quarterly", dependencies=[Depends(require_roles("admin"))])
def dismiss_quarterly_drafts(user: CurrentUser = Depends(get_current_user)):
    """CEO only: dismiss every waiting quarterly-update draft at once, e.g. to
    redo the batch after adding outcomes. Thank-yous and other drafts are left
    alone. Nothing is deleted: drafts become 'skipped', like the per-draft
    Dismiss, so the quarterly job can draft those donors again."""
    res = (user.db.table("communications")
           .update({"status": "skipped", "user_id": user.id})
           .eq("status", "draft").eq("kind", "quarterly").execute())
    return {"dismissed": len(res.data or [])}


@router.get("")
def message_list(status: Literal["sent", "draft", "skipped"] = "sent",
                 kind: Kind | None = None, limit: int = 50,
                 user: CurrentUser = Depends(get_current_user)):
    q = (user.db.table("communications")
         .select("id, donor_id, user_id, channel, kind, subject, status, sent_at, "
                 "created_at, ai_generated, donors(first_name, last_name, organization_name)")
         .eq("status", status))
    if kind:
        q = q.eq("kind", kind)
    order_col = "sent_at" if status == "sent" else "created_at"
    rows = q.order(order_col, desc=True).limit(min(limit, 200)).execute().data
    names = user_names(user.db)
    return [{**r,
             "sent_by": names.get(r["user_id"]),
             "donor_name": donor_display_name({**(r.get("donors") or {}), "id": r["donor_id"]})}
            for r in rows]