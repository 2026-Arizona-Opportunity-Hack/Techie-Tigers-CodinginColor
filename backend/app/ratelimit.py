"""Per-user rate limits for the expensive endpoints (AI drafts, imports).

Keyed by the logged-in user's id rather than IP: behind Render's proxy many
users can share one IP, and both limited endpoints already require a login.

Counts live in this process's memory, so they reset when the server restarts.
That's fine for one Render instance; running several would need a shared store
such as Redis.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()  # sync endpoints run in a thread pool


def check(user_id: str, bucket: str, limit: int, per_seconds: int) -> None:
    """Allow `limit` calls per `per_seconds` for this user in this bucket, or raise 429."""
    now = time.monotonic()
    with _lock:
        q = _hits[f"{bucket}:{user_id}"]
        while q and now - q[0] >= per_seconds:
            q.popleft()
        if len(q) >= limit:
            retry_after = int(per_seconds - (now - q[0])) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Too many requests. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
        q.append(now)
