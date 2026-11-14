from fastapi import APIRouter

from ..auth import User

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def read_me(user: User):
    """Who am I? The frontend uses this after login to pick which screens to show."""
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
