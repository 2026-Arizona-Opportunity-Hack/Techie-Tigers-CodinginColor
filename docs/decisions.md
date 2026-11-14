
Stack: FastAPI since we have experience in FastAPI and it's simple to use.
Supabase Postgres since it has built in login, a postgres database which is compatiable with the other SQL tools we need, and row level security.
React since the app is mostly screens to be interacted with, vercel and render also fit under the $20 budget to host. Pandas was also used to read csv imports.

We decided the visibility of each row by considering every P.0 requirement and our chosen P.1 requirement.

Admin should be able to see everything. Import csv files, review duplicates, merge, set donor type, enter outcomes, generate funder packets, and manage API keys.

Fundraising Team should be able to see all donors and board members as well but strictly for visibility. They can import, manage events, export campaign lists, create next steps on any donor. But can't reassign donors, change donor type, or send anything as a board member

Board members manage their own personal donors and can only see their donors. Add donors, log outreach, review and send drafts, manage next steps, deactivate their own donors.

Security is enforced through the Postgres row level security, not only through the backend as board members can't see other donors even if they changed their id the url.

Donors are never deleted, they're active or inactive set only by the CEO, since gift history is needed for grant renewals and retention reports. 

GONNA REWORD THIS LATER THIS ALL THE POINTS BUT AI WROTE ALL OF IT
Import and dedupe
The CEO or fundraising team uploads the spreadsheet, Zeffy and Benevity CSVs one file at a time.
Exact email matches merge automatically (one donor per email).
Fuzzy matches (similar names or the same phone) go to a review queue for the CEO to confirm or reject.
Confirmed duplicates are combined with merge_donors, which moves all gifts, messages and next steps to the kept donor and marks the duplicate inactive.
Every original record is saved in donor_sources, so any merge can be traced.
Each gift's platform transaction ID is stored, so re-uploading the same file doesn't create duplicate gifts.

Trade-off: Benevity often hides donor emails, so some duplicates will need manual review.

Round-robin assignment

New donors are automatically assigned to the active board member with the fewest active donors. Donors a board member adds themselves are assigned to that board member. Only the CEO can reassign, and a donor's open to-dos move with them.

A human sends every message

The app drafts messages but never sends them. Board members review the draft, then click a button that opens Gmail or their text app with the message filled in, and the message is logged as sent.

The database won't mark a message as sent without a real person and a timestamp. Sent messages can't be edited afterward, except by the CEO.

Why: The brief requires a human to approve every send, and using Gmail and sms links means we don't need to run any email infrastructure.

AI-drafted donor updates (P1)

GPT drafts updates from a donor's gift history and the program outcomes. Drafts are labeled as AI-generated and must be approved by a person.

Data minimization: we send GPT only the donor's first name, gift totals and program outcomes, never emails, phone numbers or full records.

Funder packets and outcomes

The CEO enters program outcomes per year (e.g. "AI Academy 2026: 45 students, 3 schools"). A funder's packet combines their gift history with the outcomes of the programs they funded, so program officers get outcome-linked reporting instead of anecdotes.

Gifts need a program attached for this to work, so the CEO tags funder gifts to programs.

Retention view

New / increased / decreased / retained / reactivated / lapsed labels are calculated from gifts every time they're viewed, never stored, so they're always current.

For the current year, "lapsed" means "hasn't given yet this year."

Read API

CIC's dashboard calls a key-authenticated API that returns totals already grouped by period, program and board member. It returns aggregates only, never donor names or contact details.

API keys are stored as hashes, so a database leak doesn't expose usable keys. The CEO can revoke a key at any time.

Export log

Every campaign list, funder packet and donor history export is recorded (who, when, what filter, how many rows). Exports are the moment PII leaves the system, so the CEO can always answer "who downloaded our donor list?"

Left out on purpose (future work)
Do-not-contact flag for donors. Not required by the brief; deactivating a donor covers it for now.
Google Calendar sync for events. Events are entered manually; the google_event_id column is ready for a sync later.
Company matches as separate donors. Matches are recorded as gifts for now.
