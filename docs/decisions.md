# Design decisions
 
Why the Coding in Color Donor & Funder Platform works the way it does. Each section
says what we built, why, and what we traded off. For how to run it, see the README.
 
## Stack
 
| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI (Python) | The team already knows it, it's simple, and `/docs` gives judges and CIC an interactive API page for free. |
| Database + login | Supabase (Postgres) | Built-in login, standard Postgres that works with any SQL tool, and row-level security (RLS) so access rules live in the database itself. |
| Frontend | React | The app is mostly screens people click through: lists, timelines, queues. |
| File parsing | pandas | Reads CSV and Excel exports the same way, including messy dates and Excel's `12345.0` IDs. |
| Fuzzy matching | rapidfuzz | Fast name-similarity scoring for duplicate detection. |
| Hosting | Vercel (frontend), Render (backend) | Both fit inside OHack's $20/month budget. |
 
## Roles and who can see what
 
There are three roles. Every logged-in person has a row in our `users` table with one of them.
 
| | CEO (`admin`) | Fundraising team (`fundraising`) | Board member (`board_member`) |
|---|---|---|---|
| See donors, gifts, history | All | All | Only donors they own |
| Add a donor | Yes | Yes (assigned round-robin) | Yes (they become the owner) |
| Edit donor details | Yes | No | Own donors |
| Reassign a donor / change donor type | Yes | No | No |
| Deactivate a donor | Yes | No | Own donors |
| Reactivate a donor | Yes | No | No |
| Import files | Yes | Yes | No |
| Review and merge duplicates | Yes | No | No |
| Draft, send, log messages | Yes | Yes, as themselves | Own donors, as themselves |
| Next steps (to-dos) | Any donor | Any donor | Own donors, assigned to themselves |
| Manage events | Yes | Yes | Read only |
| Funder packets | Yes | Yes | No |
| Enter program outcomes | Yes | No | No |
| Manage API keys | Yes | No | No |
 
The fundraising team sees everything because they run campaigns across all donors, but
they can't change who owns a donor or act as a board member. Board members only ever see
their own slice.
 
## How security is enforced
 
**Access rules live in the database, not just in Python.** Postgres row-level security
filters every query by who is asking. A board member who edits a donor ID in the URL gets
nothing back, because the database itself refuses to return someone else's donor. The
backend's role checks exist only to give clearer error messages.
 
**Two kinds of database connection.**
- Every request a person makes runs through a connection carrying *their* login token, so
  RLS applies to everything they do.
- A separate "service" connection, using the secret key, bypasses RLS. It is used only for
  system work: imports, the quarterly drafting job, checking API keys, and writing the
  export log. The code checks the caller's role before using it. The secret key never
  leaves the backend; the frontend only has the public key.
**Hidden and missing look the same.** Asking for a donor you can't see returns the same
404 as a donor that doesn't exist, so nobody can probe which IDs are real.
 
**Logins.** The frontend logs in with Supabase and sends the token with every request. The
backend verifies it with Supabase, then loads the person's row from `users`. A valid login
with no row, or with `active = false`, is refused. Removing a board member means setting
them inactive, which locks them out immediately while keeping their message history.
 
**Other protections.**
- API keys are stored as hashes, like passwords (see Read API).
- Every value in a funder packet is HTML-escaped, so a donor name from an imported file
  can't inject code into the CEO's browser.
- CORS only allows our frontend's addresses.
- Secrets live in `.env`, which is git-ignored. `.env.example` shows the variable names.
## Donors are never deleted
 
Donors are **active** or **inactive**, never deleted. Gift history is needed for grant
renewals and retention reports, and deleting a donor would erase it.
 
- **Deactivating** takes a donor out of every outreach queue. The database automatically
  closes their open to-dos, skips their unsent drafts, and refuses new drafts or sends to
  them. It also records who deactivated them and when, with an optional reason.
- **Board members** can deactivate their own donors (for example, "asked us to stop
  contacting them"). **Only the CEO can reactivate**, so a donor who asked to stop can't be
  quietly switched back on.
- **Inactive donors still count** in gift totals, retention and funder packets, because
  that money really was given.
- The app has no delete permission on donors at all; a delete request is refused by the
  database.
## Import and dedupe
 
The CEO or fundraising team uploads the donor spreadsheet, Zeffy and Benevity exports, one
file at a time, as CSV or Excel.
 
**Preview first.** `?dry_run=true` shows exactly what an upload would do (new donors,
matches, gifts, skipped rows and why) without saving anything.
 
**Finding the columns.** Each export names its columns differently, so headers are compared
after removing case, spaces and punctuation ("Donor E-mail" matches "email"), against a list
of known names per field. Benevity puts report titles above its real header row, so the
importer scans the first 20 rows and uses the one that matches the most fields. Benevity's
"Company" column is the donor's *employer*, so it is not treated as an organization.
 
**Cleaning values.** Emails are lowercased and checked; phones become digits only; amounts
like `$1,250.00` become `1250.00`; most date formats are understood. Placeholder values such
as "N/A" and Benevity's "Not shared by donor" count as empty. Refunds, failed, cancelled and
pending payments are skipped, never counted as gifts.
 
**Matching each row to a donor**, in this order:
1. **Already imported** (same source and transaction ID): skipped, so re-uploading a file
   creates nothing new.
2. **Same email as an existing donor**: that donor. Merged automatically, because one email
   means one person. Blank fields on the existing donor (like a missing phone) are filled
   in; existing values are never overwritten.
3. **No email, exact same name, and that donor came from this same source before**: that
   donor. This catches monthly givers whose exports never include an email.
4. **Otherwise**: a new donor. Repeats within the same file reuse it.
**Fuzzy matches go to a review queue, never merged automatically.** After the file is
processed, every new donor is compared against everyone else. A name at least 90% similar,
or at least 60% similar *and* the same phone number, becomes a "possible duplicate" for the
CEO to merge or dismiss. Two different people named Maria Garcia are common, so name alone
never merges anyone. Donors added by hand get the same check.
 
**Merging** moves all of the duplicate's gifts, messages, next steps and source records to
the kept donor, fills the kept donor's blank contact fields, and marks the duplicate
inactive with a pointer (`merged_into`) to the donor it was merged into. It all happens in
one database transaction: either everything moves or nothing does. Later imports that match
the old donor follow the pointer, so new gifts land on the kept donor.
 
**Anonymous gifts** go to one inactive "Anonymous donors (Zeffy)" (or Benevity) record per
source. The money still counts in totals, without creating fake people or anyone to
contact.
 
**Every original record is kept** in `donor_sources`, so any merge can be traced back to the
rows it came from. To limit stored personal data, only the columns the importer actually
uses are saved, not the whole export row.
 
**Safe if it fails partway.** Writes happen in a fixed order (donors, then source records,
then gifts), and source records mark rows as imported before their gifts are written. If an
upload stops partway, uploading the same file again finishes the job without duplicates.
 
**Trade-offs.**
- Benevity often hides donor emails, so more Benevity donors land in the review queue.
- Gifts naming a program we don't recognise are saved without a program, with a warning.
- Gifts in the last 30 days get a thank-you draft automatically after an import.
## Owners and round-robin
 
Every active donor has one owner: a board member.
 
- **Imported donors** are assigned automatically to the active board member with the fewest
  active donors, so the load stays even. A database lock stops two simultaneous imports from
  both picking the same person.
- **Donors a board member adds themselves** belong to that board member.
- **Only the CEO reassigns.** When a donor moves, the previous owner's open to-dos move with
  them, so nothing is left with someone who can no longer see the donor.
- The CEO's **board summary** shows each board member's donor count, the share contacted in
  the last 90 days, and overdue to-dos, least-contacted first.
## A person sends every message
 
The app drafts messages but never sends them.
 
1. **Draft.** The system writes a thank-you (after an import, or when someone clicks Thank
   on a gift) or a quarterly update. Drafts sign off with `[Your name]`.
2. **Review.** The board member opens the draft and can edit it. Editing a system draft makes
   it theirs.
3. **Open.** One click opens their own Gmail, email app or phone with the message and their
   real name filled in.
4. **Mark as sent.** After pressing send in Gmail or Messages, they click Mark as sent. The
   message is logged with their name and the time, and a thank-you updates the donor's
   "last thanked" date.
The database refuses to mark a message sent without a real person and a timestamp. Sent
messages can't be edited afterward, except by the CEO. Every update only applies while a
message is still a draft, so a double-click can't send it twice.
 
Calls, texts and in-person meetings that happened outside the app are logged in one step,
so they also count as contact.
 
**Why.** The brief requires a human to approve every send. Gmail and SMS links mean we run no
email infrastructure, store no email credentials, and messages come from the board member's
own address, which donors recognise.
 
**Trade-off.** We can't detect whether someone actually pressed send in Gmail, so the record
relies on them clicking Mark as sent.
 
## Reminders and the quarterly touch
 
**"My queue" is the reminder system.** When a board member opens the app, it shows what they
owe: overdue to-dos, to-dos due this week, drafts waiting for review, and donors nobody has
contacted in 90 days.
 
**Next steps** are per-donor to-dos with a due date. They default to the donor's owner.
Linking one to an event (like Day of Compute) without a date sets it two weeks before the
event. To-dos can't be added to inactive donors.
 
**Quarterly touch.** A CEO-run job drafts an update for every active donor not contacted in
90 days, using that year's program outcomes. Donors who already have a pending quarterly
draft are skipped, so running the job twice is safe.
 
**Trade-off.** Free hosting doesn't run scheduled jobs reliably, so the CEO starts the
quarterly job with a button instead of it running on a timer.
 
## AI-drafted donor updates (P1)
 
Updates can be drafted by an AI model from a donor's gift history and program outcomes. AI
drafts are labeled as AI-generated (`ai_generated`) and go through the same review-and-send
flow as every other draft: a person reads it before it goes anywhere. When AI isn't
available, the same drafts are built from templates.
 
**Data minimization.** The model receives only the donor's first name, gift totals and
program outcomes, never email addresses, phone numbers or full records.
 
## Retention view
 
For each donor and year, giving is compared with the year before and labeled **new**,
**retained**, **increased**, **decreased**, **reactivated** (came back after a gap) or
**lapsed**. The labels are calculated from gifts every time the report is opened, never
stored, so they are always current.
 
The report shows the trend across years, the retention rate (of last year's donors, the
share who gave again), money lost from lapsed donors, a call list of the 25 biggest lapsed
donors, and a breakdown by board member. Board members see the same report for only their
own donors, because it reads through their RLS-scoped connection.
 
For the current year, "lapsed" means "hasn't given yet this year": these are the donors to
call before December 31.
 
## Funder packets and outcomes
 
The CEO enters program outcomes per year, for example "AI Academy 2026: 45 students, 3
schools". A funder packet combines the funder's gift history, totals by year and program,
and the outcomes of the programs they funded in the years they gave. Program officers get
outcome-linked reporting instead of anecdotes.
 
Gifts without a program count as unrestricted, so all outcomes from that year are included.
For a packet to be specific, the CEO tags funder gifts to programs.
 
The packet opens as a print-ready page (Print, then Save as PDF), or downloads as CSV.
 
When the Problem 1 team's read API exists, outcomes can come from it instead of being typed
in by hand.
 
## Read API
 
CIC's organization dashboard calls `GET /api/v1/summary` with an API key in the `X-API-Key`
header. It returns totals already grouped by period (month, quarter or year), program,
source and board member, plus a retention snapshot and the last 30 days of activity, so the
dashboard doesn't need to calculate anything.
 
- **Aggregates only.** It never returns donor names, emails or phone numbers. The dashboard
  needs program and donor health, not personal data.
- **Keys are stored as hashes.** A key is shown once when created; only its SHA-256 hash is
  kept, so a database leak doesn't expose usable keys.
- **Revocable.** The CEO can revoke a key at any time, and it stops working on the next
  request.
- **Keys go in a header, never the URL,** because URLs end up in logs and browser history.
## Export log
 
Every funder packet download is recorded: who, when, which filter, how many rows. Exports
are the moment personal data leaves the system, so the CEO can always answer "who downloaded
our donor data?" Only the backend can write to the log, and only the CEO can read it. The
log is designed to cover campaign lists and donor-history exports as well, when those are
added.
 
## Left out on purpose (future work)
 
- **Do-not-contact flag.** Not required by the brief; deactivating a donor covers it for now.
- **Google Calendar sync for events.** Events are entered by hand; the `google_event_id`
  column is ready for a sync later.
- **Company matches as separate donors.** Benevity company matches are recorded as part of
  the gift for now.
- **Campaign list and donor-history exports.** The export log already supports them.
- **Scheduled jobs.** The quarterly drafting job runs from a button rather than a timer.
## Known limitations
 
- **Board member totals use the current owner.** If a donor was reassigned mid-year, all of
  their giving counts toward the new owner in the read API.
- **Phone numbers.** Imports accept numbers with 7 or more digits, but text and call links
  assume a 10-digit US number.
- **"Sent" depends on the person.** We can't confirm a message was actually sent from Gmail
  or the phone; the record relies on Mark as sent.
 