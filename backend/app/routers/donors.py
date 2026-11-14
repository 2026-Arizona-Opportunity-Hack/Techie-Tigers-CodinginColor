from fastapi import APIRouter, HTTPException, Query

from ..auth import User

router = APIRouter(prefix="/donors", tags=["donors"])

DONOR_FIELDS = (
    "id, first_name, last_name, organization_name, email, phone, "
    "donor_type, owner_id, active, last_thanked_at, created_at"
)


@router.get("")
def list_donors(user: User, include_inactive: bool = False, limit: int = Query(100, le=500)):
    """Board members only get their own donors back; staff get everyone.
    That filtering is done by Postgres RLS, not here."""
    q = user.db.table("donors").select(DONOR_FIELDS).is_("merged_into", "null")
    if not include_inactive:
        q = q.eq("active", True)
    return q.order("last_name").limit(limit).execute().data


@router.get("/{donor_id}")
def get_donor(donor_id: int, user: User):
    rows = user.db.table("donors").select(DONOR_FIELDS).eq("id", donor_id).limit(1).execute().data
    if not rows:
        # Same 404 whether it doesn't exist or RLS hid it, so ids can't be probed.
        raise HTTPException(404, "Donor not found")
    return rows[0]
