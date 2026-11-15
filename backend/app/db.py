"""Supabase connections.

service_client()  bypasses RLS. Only for imports, AI drafting, the API-key route,
                  and export_log. Check the caller's role in Python before using it.
user_client(token) acts AS the logged-in user, so RLS applies. Use for everything else.
"""

import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]  # publishable key
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # secret key


@lru_cache
def service_client() -> Client:
    """One shared client for the whole app (built on first use, then reused)."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def user_client(access_token: str) -> Client:
    """A new client per request, carrying the user's token so RLS applies."""
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client