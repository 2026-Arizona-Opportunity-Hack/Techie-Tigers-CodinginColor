import importlib
import logging

from fastapi import FastAPI
from .routers import me, donors, imports, communications
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings

log = logging.getLogger(__name__)

app = FastAPI(title="Coding in Color — Donor & Funder Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,  # a list, exact origins, no trailing slash
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
    
for r in (me, donors, imports):
    app.include_router(r.router)

# Every router file in app/routers/. A file that hasn't been written yet is
# skipped with a warning instead of crashing the server, so teammates can
# merge their routers one at a time. Any OTHER import error (a typo or a
# missing package inside a router) still stops startup, so real bugs show up.
ROUTERS = [
    "me",
    "donors",
    "imports",
    "communications",
    "next_steps",
    "reports",
    "exports",
    "public_api",
    "admin",
]

for name in ROUTERS:
    module_path = f"{__package__}.routers.{name}"
    try:
        module = importlib.import_module(module_path)
    except ModuleNotFoundError as e:
        if e.name == module_path:
            log.warning("Router '%s' not written yet; skipping", name)
            continue
        raise
    if not hasattr(module, "router"):
        # Placeholder file (e.g. empty) that doesn't define `router` yet.
        log.warning("Router '%s' has no `router` yet; skipping", name)
        continue
    app.include_router(module.router)
