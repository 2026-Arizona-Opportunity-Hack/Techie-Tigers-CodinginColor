# Backend (FastAPI)

## Run it

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env    # then fill in the Supabase values
fastapi dev app/main.py       # http://localhost:8000, docs at /docs
```

## How auth and permissions work

1. The React app logs in with Supabase Auth and sends `Authorization: Bearer <access_token>`.
2. `app/auth.py` verifies the token and loads the user's row from `users`.
3. Queries go through `user.db`, a Supabase client running **as that user**, so the
   row-level security in `database/database.sql` decides what they can see.

`service_client()` in `app/db.py` bypasses RLS. Use it only for server-side jobs
(CSV imports, AI drafting, the API-key dashboard route).

## Layout

```
app/
  main.py        app, CORS, routers
  config.py      settings from ../.env
  db.py          Supabase clients (per-user and service role)
  auth.py        current user + require_role()
  routers/       one file per resource (me, donors, ...)
```

To add an endpoint: create `app/routers/<thing>.py` with an `APIRouter`, take
`user: User` as a parameter, query `user.db`, and include the router in `main.py`.
