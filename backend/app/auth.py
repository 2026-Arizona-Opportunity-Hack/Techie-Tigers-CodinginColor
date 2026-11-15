"""Auth: the frontend logs in with Supabase Auth and sends
`Authorization: Bearer <access_token>`. We verify it with Supabase and load
the matching row from our `users` table."""

import logging
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from .db import service_client, user_client

log = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    name: str
    email: str
    role: str  # 'admin' | 'fundraising' | 'board_member'
    db: Client  # Supabase client scoped to this user (RLS applies)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_staff(self) -> bool:
        return self.role in ("admin", "fundraising")


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> CurrentUser:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")

    token = creds.credentials
    try:
        auth_user = service_client().auth.get_user(token).user
    except Exception as e:
        # Bad/expired tokens land here, but so do network errors. Log the real
        # cause so a Supabase outage doesn't look like "everyone's token is bad".
        log.warning("Token check failed: %s", e)
        auth_user = None
    if auth_user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    db = user_client(token)
    rows = (
        db.table("users")
        .select("id, name, email, role, active")
        .eq("id", auth_user.id)
        .limit(1)
        .execute()
        .data
    )
    if not rows or not rows[0]["active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No active account for this login")

    row = rows[0]
    return CurrentUser(row["id"], row["name"], row["email"], row["role"], db)


def require_role(*roles: str):
    """Dependency: `Depends(require_role("admin"))`. RLS is still the real guard;
    this just gives a clear 403 instead of an empty result."""

    def check(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for your role")
        return user

    return check


require_roles = require_role  # the build guide uses the plural name

User = Annotated[CurrentUser, Depends(get_current_user)]