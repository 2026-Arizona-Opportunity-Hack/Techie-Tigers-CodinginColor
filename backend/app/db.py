"""Supabase clients.

user_client(token): runs as the logged-in user, so Postgres RLS decides what
they can see. Use this for every user-facing request.

service_client(): runs as the service role and BYPASSES RLS. Only use it for
server-side work the schema expects to run that way (CSV imports, AI drafting,
the API-key dashboard route). Never return its results unfiltered to a user.
"""

from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings


def user_client(access_token: str) -> Client:
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    client.postgrest.auth(access_token)
    return client


@lru_cache
def service_client() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)
