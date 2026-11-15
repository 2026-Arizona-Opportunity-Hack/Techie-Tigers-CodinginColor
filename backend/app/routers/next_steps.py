from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel
from ..auth import CurrentUser, get_current_user, require_roles
from ..common import fetch_all, chunks, get_donor_or_404, donor_display_name
from ..db import service_client as sdb
from ..templates import quarterly_update

router = APIRouter(tags=["next steps"])  # no prefix: paths below are written in full


class StepIn(BaseModel):
    donor_id: int
    description: str
    due_date: date | None = None   # optional when event_id is given
    event_id: int | None = None    # "invite to Day of Compute"
    assigned_to: str | None = None


class StepEdit(BaseModel):
    description: str | None = None
    due_date: date | None = None


@router.post("/next-steps", status_code=201)
def create_step(body: StepIn, user: CurrentUser = Depends(get_current_user)):
    donor = get_donor_or_404(user.db, body.donor_id, "owner_id, active")
    if not donor["active"]:
        raise HTTPException(400, "This donor is inactive")

    due = body.due_date
    if not due:
        if not body.event_id:
            raise HTTPException(422, "due_date is required unless event_id is given")
        ev = (user.db.table("events").select("event_date")
              .eq("id", body.event_id).maybe_single().execute())
        if not ev or not ev.data:
            raise HTTPException(404, "Event not found")
        # invite two weeks before the event, but never in the past
        due = max(date.fromisoformat(ev.data["event_date"]) - timedelta(days=14), date.today())

    assigned = body.assigned_to or donor["owner_id"] or user.id
    if user.role == "board_member":
        assigned = user.id  # board members can't hand work to others

    try:
        return user.db.table("next_steps").insert({
            "donor_id": body.donor_id, "description": body.description,
            "due_date": due.isoformat(), "event_id": body.event_id,
            "assigned_to": assigned,
        }).execute().data[0]
    except APIError as e:
        raise HTTPException(400, e.message)


@router.patch("/next-steps/{step_id}")
def edit_step(step_id: int, body: StepEdit, user: CurrentUser = Depends(get_current_user)):
    changes = body.model_dump(exclude_unset=True, mode="json")  # mode=json: date -> string
    res = user.db.table("next_steps").update(changes).eq("id", step_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data[0]


@router.post("/next-steps/{step_id}/done")
def complete_step(step_id: int, user: CurrentUser = Depends(get_current_user)):
    res = (user.db.table("next_steps")
           .update({"done": True, "completed_at": datetime.now(timezone.utc).isoformat()})
           .eq("id", step_id).execute())
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data[0]


@router.get("/me/queue")
def my_queue(user: CurrentUser = Depends(get_current_user)):
    db = user.db
    today = date.today()
    week = (today + timedelta(days=7)).isoformat()
    since = (today - timedelta(days=90)).isoformat()

    my_donors = {d["id"]: d for d in fetch_all(
        lambda: db.table("donors")
        .select("id, first_name, last_name, organization_name, email, phone")
        .eq("owner_id", user.id).eq("active", True))}

    steps = (db.table("next_steps").select("id, donor_id, description, due_date, event_id")
             .eq("assigned_to", user.id).eq("done", False)
             .lte("due_date", week).order("due_date").execute().data)

    # Fetch without an id filter (RLS already scopes it) and filter here;
    # a long .in_() list would make the request URL too long.
    drafts = [c for c in fetch_all(
        lambda: db.table("communications")
        .select("id, donor_id, kind, channel, subject, created_at, ai_generated")
        .eq("status", "draft"))
        if c["donor_id"] in my_donors]
    touched = {c["donor_id"] for c in fetch_all(
        lambda: db.table("communications").select("donor_id")
        .eq("status", "sent").gte("sent_at", since))}
    has_draft = {c["donor_id"] for c in drafts}

    def name(donor_id):
        d = my_donors.get(donor_id)
        return donor_display_name(d) if d else f"Donor #{donor_id}"

    overdue = [{**s, "donor_name": name(s["donor_id"])}
               for s in steps if s["due_date"] < today.isoformat()]
    this_week = [{**s, "donor_name": name(s["donor_id"])}
                 for s in steps if s["due_date"] >= today.isoformat()]
    quarterly_owed = [{"donor_id": i, "donor_name": name(i)}
                      for i in my_donors if i not in touched and i not in has_draft]

    return {
        "counts": {"overdue": len(overdue), "this_week": len(this_week),
                   "drafts": len(drafts), "quarterly_owed": len(quarterly_owed)},
        "overdue": overdue,
        "this_week": this_week,
        "drafts_to_review": [{**c, "donor_name": name(c["donor_id"])} for c in drafts],
        "quarterly_owed": quarterly_owed,
    }


@router.post("/jobs/quarterly-drafts")
def quarterly_drafts(user: CurrentUser = Depends(require_roles("admin"))):
    since = (date.today() - timedelta(days=90)).isoformat()
    donors = fetch_all(lambda: sdb.table("donors")
                       .select("id, first_name, last_name, organization_name, email, phone")
                       .eq("active", True).not_.is_("owner_id", "null"))
    touched = {c["donor_id"] for c in fetch_all(
        lambda: sdb.table("communications").select("donor_id")
        .eq("status", "sent").gte("sent_at", since))}
    already = {c["donor_id"] for c in fetch_all(
        lambda: sdb.table("communications").select("donor_id")
        .eq("status", "draft").eq("kind", "quarterly"))}
    outcomes = (sdb.table("outcomes").select("year, description, programs(name)")
                .order("year", desc=True).limit(8).execute().data)

    rows, no_contact = [], 0
    for d in donors:
        if d["id"] in touched or d["id"] in already:
            continue
        if not d["email"] and not d["phone"]:
            no_contact += 1
            continue
        subject, body = quarterly_update(d, outcomes)
        rows.append({
            "donor_id": d["id"], "user_id": None,  # NULL = system draft
            "channel": "email" if d["email"] else "text",
            "kind": "quarterly", "subject": subject, "body": body,
            "status": "draft", "ai_generated": False,
        })
    for batch in chunks(rows):
        sdb.table("communications").insert(batch).execute()
    return {"drafts_created": len(rows), "skipped_no_email_or_phone": no_contact}