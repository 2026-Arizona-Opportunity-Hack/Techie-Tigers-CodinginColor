# Backend (FastAPI)
 
## Run it
 
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env         # Windows: copy ..\.env.example ..\.env, then fill in Supabase values
uvicorn app.main:app --reload      # http://127.0.0.1:8000, docs at /docs
```
 
`.env` lives at the **repo root**, not in `backend/`. It needs:
 
```
SUPABASE_URL=https://your-project-ref.supabase.co   # no trailing slash or path
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...             # bypasses RLS: backend only, never commit
FRONTEND_ORIGINS=http://localhost:5173              # comma-separated if more than one
```
 
`--reload` restarts on `.py` changes but not `.env` changes; restart the server after editing `.env`.
 
On startup the log lists any router that was skipped (`Router 'x' not written yet`).
 
## How auth and permissions work
 
1. The React app logs in with Supabase Auth and sends `Authorization: Bearer <access_token>`.
2. `app/auth.py` verifies the token with Supabase and loads the user's row from `users`.
   No row, or `active = false`, returns 403.
3. Queries go through `user.db`, a Supabase client running **as that user**, so the
   row-level security in `database/database.sql` decides what they can see.
   Someone else's donor comes back empty, which the API turns into a 404.
`service_client()` in `app/db.py` bypasses RLS. Use it only for server-side jobs:
CSV imports, the quarterly drafting job, the API-key route, the export log, and
setting `last_thanked_at`. Check the caller's role in Python before using it.
 
Role checks for clearer errors: `dependencies=[Depends(require_role("admin"))]` on the
route, with `user: User` as the parameter. RLS is still the real guard.
 
### Getting a token to test in `/docs`
 
From `backend/` with the venv active, run `python` and:
 
```python
from app.config import get_settings
from supabase import create_client
s = get_settings()
c = create_client(s.supabase_url, s.supabase_anon_key)
c.auth.sign_in_with_password({"email": "ceo@test.com", "password": "..."}).session.access_token
```
 
Paste the printed token into **Authorize** at `/docs`. Tokens expire after about an hour.
The login needs a matching row in `users` (see the root README).
 
## Endpoints
 
| Area | Endpoint | Who |
|---|---|---|
| Me | `GET /me` | everyone |
| Donors | `GET /donors` (search `q`, `owner_id`, `include_inactive`, `limit`, `offset`) | RLS-scoped |
| | `GET /donors/{id}`, `GET /donors/{id}/timeline`, `GET /donors/{id}/contact-links` | RLS-scoped |
| | `POST /donors`, `PATCH /donors/{id}`, `POST /donors/{id}/deactivate` | owner / staff |
| | `PATCH /donors/{id}/owner`, `POST /donors/{id}/reactivate` | admin |
| Imports | `POST /imports/{source}` (`?dry_run=true` to preview) | admin, fundraising |
| Messages | `POST /communications/log` (call, text, email, meeting) | RLS-scoped |
| | `POST /communications/thank-you` (draft for a gift) | RLS-scoped |
| | `PATCH /communications/{id}`, `GET /communications/{id}/links` | RLS-scoped |
| | `POST /communications/{id}/mark-sent`, `POST /communications/{id}/skip` | RLS-scoped |
| | `GET /communications?status=sent` (send history) | RLS-scoped |
| Next steps | `POST /next-steps`, `PATCH /next-steps/{id}`, `POST /next-steps/{id}/done` | RLS-scoped |
| | `GET /me/queue` (overdue, this week, drafts, quarterly owed) | everyone |
| | `POST /jobs/quarterly-drafts` | admin |
| Reports | `GET /reports/retention?year=` | RLS-scoped |
| | `GET /admin/board-summary` | admin, fundraising |
| Exports | `GET /exports/funder-packet/{donor_id}?format=html\|csv\|json` | admin, fundraising |
| API keys | `POST /admin/api-keys`, `GET /admin/api-keys`, `POST /admin/api-keys/{id}/revoke` | admin |
| Read API | `GET /api/v1/summary?period=month\|quarter\|year&start=&end=` | `X-API-Key` header |
| Health | `GET /health` | anyone |
 
"RLS-scoped" means any logged-in user, seeing only what the database allows: board
members their own donors, admin and fundraising everyone.
 
## Importing donors (`POST /imports/{source}`)
 
`source` is `spreadsheet`, `zeffy` or `benevity`; upload a `.csv` or `.xlsx` (max 5 MB,
20,000 rows). Admin and fundraising only. Add `?dry_run=true` to preview without saving.
 
- Columns are matched by name (`app/importers/mapping.py`); report titles above
  the header row (Benevity) are skipped automatically. Benevity's "Company" is the
  donor's employer, so it is not treated as an organization.
- Same email as an existing donor: merged automatically, filling only blank fields.
  No email but the exact same name from the same source before: matched too.
  Similar name (90+), or a looser name match plus the same phone: added to
  `duplicate_candidates` for the CEO to review. Fuzzy matches never auto-merge.
- Re-uploading a file is safe: rows already imported (same source + transaction
  id, or a row hash when there's no id) are skipped. Refunded/failed/pending payments are skipped.
- Anonymous gifts go to one inactive "Anonymous donors (Source)" donor, so totals
  stay right without putting a fake person in anyone's queue.
- Only the mapped columns are kept in `donor_sources.raw`, not the whole row.
- Gift programs are matched by name to the `programs` table; add programs first.
- New gifts from the last 30 days get a thank-you draft for the donor's owner.
- If an import fails partway, uploading the same file again finishes it without duplicates.
## Messages: the system drafts, a person sends
 
Drafts (thank-yous, quarterly updates) are saved with `status = 'draft'` and sign off
with `[Your name]`. `GET /communications/{id}/links` returns Gmail, mailto, SMS and
call links with the sender's name filled in; the person sends from their own app, then
calls `mark-sent`. The database refuses `sent` without a `user_id` and `sent_at`, and
only drafts can be edited (except by admin).
 
## Read API for CIC's dashboard
 
Create a key as admin with `POST /admin/api-keys` (shown once; only its hash is stored),
then:
 
```bash
curl -H "X-API-Key: cic_..." "http://127.0.0.1:8000/api/v1/summary?period=month"
```
 
Returns totals by period, program, source and board member, a retention snapshot and
the last 30 days of activity. No donor names, emails or phone numbers.
 
## Layout
 
```
app/
  main.py          app, CORS (incl. X-API-Key), /health, router registration
  config.py        settings from ../.env
  db.py            Supabase clients: user_client(token) and service_client()
  auth.py          current user, User type, require_role()
  common.py        fetch_all (pages past the 1000-row limit), chunks, user_names,
                   donor_display_name, get_donor_or_404
  templates.py     thank-you and quarterly text, Gmail/SMS/call links
  importers/
    mapping.py     header matching and header-row detection
    normalize.py   cleaning emails, phones, amounts, dates, names
    dedupe.py      build_plan(): decides what an import does, plus fuzzy matching
  routers/
    me.py  donors.py  imports.py  communications.py  next_steps.py
    reports.py  exports.py  public_api.py  admin.py
```
 
Schema changes go in `database/database.sql` (for fresh setups) **and** a dated file
in `database/migrations/` to run once in the Supabase SQL editor on the existing database.
Migrations must be safe on a database that already has the tables: use
`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` / `DROP TRIGGER IF EXISTS` before
recreating, and `IF NOT EXISTS` on tables, columns and indexes.
 
## Conventions
 
- **Add an endpoint:** create `app/routers/<thing>.py` with `router = APIRouter(...)`,
  take `user: User` as a parameter, query `user.db`, and add `"<thing>"` to the
  `ROUTERS` list in `main.py`.
- **More than ~1000 rows?** Use `fetch_all(lambda: db.table(...)...)`; a plain
  `.execute()` silently stops at 1000.
- **Fetching one row:** `.limit(1).execute().data`, then 404 if empty, not `maybe_single()`.
- **Updates RLS blocks** return an empty list, not an error; check `if not rows` and 404.
- **Service client** is a function: `service_client().table(...)`.
- **Dates to the database:** `model_dump(mode="json")` or `.isoformat()`.
- **Postgres NUMERIC** comes back as a string; wrap amounts in `float()` before adding.
 