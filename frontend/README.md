# Frontend: Coding in Color donor platform

The web app CIC's CEO, fundraising staff and board members use every day: one donor
list, each board member's follow-ups, thank-you and update drafts that a person reviews
and sends, year-over-year retention, and CSV imports.

Built with React 19, TypeScript, Vite, React Router 7, Tailwind CSS 4, lucide-react
icons and supabase-js (login only, plus a few read-only queries). It talks to the
FastAPI backend in [`../backend`](../backend).

## Run it locally

You need Node 20+, and the backend running on http://localhost:8000 (see the
[main README](../README.md#run-it-locally)).

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:5173
```

`frontend/.env.local` (never committed):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co`, the same project as the backend |
| `VITE_SUPABASE_ANON_KEY` | The Supabase **publishable** key. Never the secret key: anything in the frontend is public. |
| `VITE_API_URL` | `http://localhost:8000` locally, the deployed backend URL in production |

Keep the dev server on port **5173**. The backend only accepts requests from the
origins in its `FRONTEND_ORIGINS` setting, so a second server on 5174 shows
"Can't reach the server."

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run lint` | ESLint (should report 0 problems) |
| `npm run preview` | Serve the built `dist/` locally |

To try imports, use the fictional Zeffy, Benevity and spreadsheet files in
[`docs/sample-data`](../docs/sample-data).

## What each role sees

After login the app asks the backend who you are (`GET /me`) and sends you to
`/admin`, `/fundraising` or `/board`.

| Page | CEO / admin | Fundraising | Board member |
|---|:-:|:-:|:-:|
| Overview: giving this year, retention, which board members are reaching out | ✓ | ✓ | Their own week: overdue, due, drafts |
| Donors list and donor page (gifts, timeline, contact links, retention badge) | All | All | Their own donors |
| Funder packet on a funder's page: gift history and outcomes as HTML or CSV | ✓ | ✓ | |
| Reassign a donor's board member (on the donor page) | ✓ | | |
| Follow-ups: what's due, overdue, or owed a quarterly touch | | | ✓ |
| Outreach: review drafts, send from your own Gmail or Messages, mark sent, log a call | ✓ | | ✓ |
| Retention: lapsed, decreased, retained, increased, reactivated, new, by year | All | All | Their own donors |
| CSV Imports (preview first, then import) | ✓ | | |
| Duplicate Review: merge or keep apart possible duplicates | ✓ | | |
| Board Members: each member's donors and outreach | ✓ | ✓ | |
| Programs and outcomes, used in updates and funder packets | ✓ | | |
| API Keys for CIC's dashboard | ✓ | | |

The frontend hides what a role can't use, but it isn't the security boundary. The backend
and Supabase row-level security (RLS) enforce every rule, so a board member gets only
their own donors even if they type another URL.

## How it works

- **Login:** `src/auth/AuthProvider.tsx` keeps the Supabase session, calls `GET /me`
  for the user's role, and `RequireAuth` keeps each `/:role/...` URL to that role.
- **Data:** almost everything goes through `src/lib/api.ts`. That file sends the
  user's login token to the backend and turns errors into readable messages. A few
  reads and writes go straight to Supabase with the user's own login, so RLS still
  applies: the `donor_retention` view, `duplicate_candidates`, the `merge_donors`
  function, and programs and outcomes.
- **People send every message.** The backend drafts thank-yous and quarterly updates.
  On Outreach a person edits the draft, chooses email or text, and opens it in their own
  Gmail or Messages. They press Send there, then click **Mark as sent** here. The app
  never sends anything on its own.
- **Accessibility:** retention colors always come with a text label, charts have
  a table view, and every action works with the keyboard and shows focus.

```
src/
  App.tsx            routes: /login and /:role/<page>; unknown pages go to Overview
  auth/              AuthProvider (session + role)
  components/        layout, sidebar, RequireAuth, retention badge, owner picker, next-step cell
  lib/api.ts         every backend and Supabase call, plus shared types
  lib/roles.ts       each role's sidebar menu
  lib/retentionStyle.ts  retention colors and labels
  pages/             one file per page
```

### Adding a page

1. Create `src/pages/MyPage.tsx`. Put any new API call in `src/lib/api.ts`.
2. Add a `<Route path="my-page" ...>` inside the `/:role` route in `src/App.tsx`.
3. Add it to the right roles in `src/lib/roles.ts` so it shows in the sidebar.
4. If only some roles may use it, check `useParams().role` on the page. Also make sure
   the backend or RLS enforces it.

## Deploying (Vercel)

Import the repo in Vercel with **Root Directory** set to `frontend`, and add the three
`VITE_` variables under Environment Variables. `vercel.json` sends every path to
`index.html` so deep links like `/board/outreach` work. Then add the Vercel URL to the
backend's `FRONTEND_ORIGINS`, or every request fails.

## Troubleshooting

| You see | Usually means |
|---|---|
| "Can't reach the server. Is the backend running?" | The backend isn't on `VITE_API_URL`, the page isn't on an allowed origin (port 5173 locally), or the backend crashed with a 500. Check the backend terminal. |
| "Invalid or expired token" on login | The backend's `SUPABASE_SERVICE_ROLE_KEY` is wrong or was rotated, or the frontend and backend point at different Supabase projects. |
| "No active account for this login" | The person exists in Supabase Auth but has no active row in the `users` table. |
| "Missing Supabase environment variables" | `frontend/.env.local` is missing or the dev server was started before it was created. Restart `npm run dev`. |
| `npm` error `ENOENT ... package.json` | Run npm commands inside `frontend/`, not the repo root. |
