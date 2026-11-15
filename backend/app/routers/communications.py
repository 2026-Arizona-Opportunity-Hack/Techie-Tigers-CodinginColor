from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel
from ..auth import CurrentUser, get_current_user

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