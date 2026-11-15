"""Helpers shared by the routers."""

from fastapi import HTTPException


def fetch_all(build_query, page_size: int = 1000) -> list[dict]:
    """Supabase returns at most 1000 rows per request. This pages through all of them.
    Pass a function that builds a FRESH query each time:
        fetch_all(lambda: db.table("gifts").select("*").eq("donor_id", 5))
    """
    rows, start = [], 0
    while True:
        batch = build_query().range(start, start + page_size - 1).execute().data
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
        start += page_size


def chunks(rows: list, n: int = 500):
    """Split a list into batches for bulk inserts."""
    for i in range(0, len(rows), n):
        yield rows[i:i + n]


def user_names(db) -> dict[str, str]:
    """id -> name for every user, via the user_directory view (safe for every role)."""
    rows = db.table("user_directory").select("id, name").execute().data
    return {r["id"]: r["name"] for r in rows}


def donor_display_name(d: dict) -> str:
    name = f"{d.get('first_name') or ''} {d.get('last_name') or ''}".strip()
    return name or d.get("organization_name") or d.get("email") or f"Donor #{d.get('id')}"


def get_donor_or_404(db, donor_id: int, cols: str = "*") -> dict:
    rows = db.table("donors").select(cols).eq("id", donor_id).limit(1).execute().data
    if not rows:
        # Same 404 whether it doesn't exist or RLS hid it, so ids can't be probed.
        raise HTTPException(404, "Donor not found")
    return rows[0]