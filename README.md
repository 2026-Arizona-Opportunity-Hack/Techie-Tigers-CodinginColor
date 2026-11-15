# Techie Tigers — Coding in Color

Built at [ASU Fall Hackathon 2026 | Phoenix Hackathon for Nonprofits: Nov 14-15](https://www.ohack.dev/hack/fall-2026) for the public good (MIT license).

> **⚠️ This is your team's ONE repository — all code goes here.** Please don't create
> another repo (personal or org). Judges, the Team Dashboard's code-activity card,
> the public project page and the nonprofit all read **this** repo; work pushed
> anywhere else is invisible to them and won't count. Everyone on the team should be
> a collaborator here — ask an organizer in Slack if someone can't push.

| | |
|---|---|
| **Nonprofit** | [Coding in Color](https://www.ohack.dev/nonprofit/YIXYdYCoxIZC08uQ5DL3) |
| **Problem statement** | [Donor & Funder Relationship Platform (CIC Problem 2)](https://www.ohack.dev/project/e26932c0df1b11f189a8dead68f07eb5) |
| **Team page** | [Techie Tigers](https://www.ohack.dev/hack/fall-2026/team/7fab9face05a11f1a9cddeadb145c312) · [Team Dashboard](https://www.ohack.dev/hack/fall-2026/manageteam) (story, demo video, submit) |
| **Slack** | team: [#techietigers](https://opportunity-hack.slack.com/app_redirect?channel=techietigers) · nonprofit: [#npo-coding-in-color](https://opportunity-hack.slack.com/app_redirect?channel=npo-coding-in-color) · help: [#ask-a-mentor](https://opportunity-hack.slack.com/archives/C01E5CGDQ74) |
| **Created by** | David Tang |

## Final day

Start recording your demo video by **Sun Nov 15, 12:00 PM MST** — hacking ends at **Sun Nov 15, 2:00 PM MST**, and a demo you recorded with time to spare beats a feature you finished at 1:59.

- Sun Nov 15, 11:00 AM MST — Presentation Feedback Hour
- **Sun Nov 15, 12:00 PM MST — Start recording your demo video**
- Sun Nov 15, 12:30 PM MST — Judges Arrive
- **Sun Nov 15, 2:00 PM MST — 🛑 Submission Deadline: Hacking ends**
- Sun Nov 15, 2:05 PM MST — Judging Round 1
- Sun Nov 15, 3:40 PM MST — Judging Final Round
- Sun Nov 15, 4:30 PM MST — Closing Ceremony: Winners Announced

## Before hacking ends — the submission checklist

Everything is submitted from your [Team Dashboard](https://www.ohack.dev/hack/fall-2026/manageteam); judges read the dashboard, this README and your demo video.

- [ ] **Code pushed** to this repo, in small PRs (see `AGENTS.md`) — judges and future recruiters read the history
- [ ] **Project story** written on the dashboard (`#project`): the problem, who it helps, what you built, what's next
- [ ] **Demo video** (4 minutes or less) on YouTube, Vimeo, Loom or Google Drive, linked on the dashboard (`#demo`) — show it working, not slides
- [ ] **Submit** on the dashboard (you can keep editing until the close)
- [ ] This README filled in below: team, tech stack, how to run it, live link if you have one
- Optional: a [DevPost entry](https://opportunity-hack-2026-arizona.devpost.com/) — the dashboard is the submission of record.

Judges score **Scope, Documentation, Polish and Security**, plus a separate **Accessibility** prize — the rubric is at [ohack.dev/hackathon-judging-criteria](https://www.ohack.dev/hackathon-judging-criteria). Document your work as GitHub Issues as you go: that's how you get public credit for it.

## Team

<!-- Replace with real people; link GitHub profiles so this repo works as your portfolio -->
- [Lucas Chavez](https://github.com/viatenp) — Backend
- [David Tang](https://github.com/davidmtang7) — Backend
- [Tommy Truong](https://github.com/halfoj) — Front End

## What we built

<!-- Two or three sentences: the problem, who it helps, what the nonprofit can do now that they couldn't before -->
Coding in Color's donors and funders lived in one spreadsheet plus separate Zeffy and Benevity exports, board members tracked outreach on handwritten lists, and follow-ups were forgotten whenever the next emergenct hit. Our platform merges every source into one deduplicated donor list, gives each board member their own donors with reminders and ready-to-send thank-you and quarterly drafts, and keeps a person in charge of every message that goes out. Now CIC can see which donors gave more, gave less, or stopped giving year over year, send a funder their full gift history and outcomes in one click, and feed live donor totals to its dashboard, instead of rebuilding all of it by hand for every grant.

## Tech stack

- Frontend:
    - React 19 + TypeScript 6, built with Vite 8
    - React Router 7 for routing
    - Tailwind CSS 4
    - Lucide-react for icons
    - Supabase-js for login and sessions in the browser
    - ESLint 10 with typescript-eslint for linting
- Backend:
    - Python with FastAPI, run on Uvicorn
    - Pydantic 2 and pydantic-settings for request models and config, python-dotenv for .env files
    - Pandas and openpyxl to import CSV and Excel files
    - RapidFuzz for fuzzy duplicate-donor matching
    - PyJWT to verify Supabase login tokens
    - Routers: donors, imports, communications, reports, exports, next_steps, admin, me, public_api
- Database:
    - Supabasae (hosted Postgres), reached through the supabase Python client (postgREST)
    - The schema is i backend/database/database.sql, with migrations in backend/database/migrations/
- APIs / services:
    - Supabase Auth: users sign in on the frontend, and the backend checks their JWT and role
    - The project's own public read API: GET /api/v1/summary, protected by an X-API-Key header. It returns totals only, no donor personal info, and the admins create and revoke the keys. Setup guide for CIC's dashboard owner: [docs/read-api.md](docs/read-api.md)
    - Contact links, not a sending service: thank-you and outreach messages are build as Gmail compose, mailto:, sms:, and tel: links. Nothing is sent from the server, and the project has no SendGrid and Twilio.
    - Google Fonts on the frontend

## Run it locally

You need Python 3.12+, Node 20+, and a Supabase project.

```bash
git clone https://github.com/2026-Arizona-Opportunity-Hack/Techie-Tigers-CodinginColor.git
cd Techie-Tigers-CodinginColor
cp .env.example .env          # backend settings — fill in your own values, never commit .env
```

**1. Database (once):** in the Supabase SQL Editor, run `backend/database/database.sql`.
Then create users in Supabase → Authentication and add a matching row in the `users`
table with a role (`admin`, `fundraising` or `board_member`).

**2. Backend** (http://localhost:8000, API docs at /docs):
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**3. Frontend** (http://localhost:5173), in a second terminal:
```bash
cd frontend
npm install
cp .env.example .env.local    # then fill in the 3 values below
npm run dev
```
What each role sees, how the frontend works, deploying and troubleshooting: [frontend/README.md](frontend/README.md).

### Environment variables

Backend — `.env` at the repo root:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase publishable key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (`sb_secret_...`) — backend only, never in the frontend |
| `FRONTEND_ORIGINS` | Comma-separated allowed origins, e.g. `http://localhost:5173` |
| `OPENAI_API_KEY` | Optional — for AI-drafted donor updates (falls back to a template) |

Frontend — `frontend/.env.local` locally, and Vercel → Environment Variables in production:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key only — never the secret key |
| `VITE_API_URL` | `http://localhost:8000` locally, the Render URL in production |

On Render, set the same backend variables under the service's Environment tab.
## Links

- Live demo: https://frontend-techie-tigers.vercel.app may take up to a minute on first launch
- Demo video: https://techie-tigers-codingincolor.onrender.com — interactive docs at `/docs` 
- Design / docs: [Architecture decisions](docs/decisions.md) · [Read API](docs/read-api.md)

## After the hackathon

Winning teams finish the project with the nonprofit — the [Definition of Done](https://www.ohack.dev/about/completion) (deployed, nonprofit sign-off, docs, open source) is tracked on your team page. Keep the repo public and the README honest; recruiters do read these.

Need a hand this weekend? [#ask-a-mentor](https://opportunity-hack.slack.com/archives/C01E5CGDQ74) on Slack, or ask in [#techietigers](https://opportunity-hack.slack.com/app_redirect?channel=techietigers) and a mentor will drop in.
