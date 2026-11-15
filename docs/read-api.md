# Read API for CIC's org dashboard

This API gives CIC's org dashboard the donor and fundraising totals it shows,
already grouped by period, program and board member, so the dashboard doesn't
have to do any math. It needs no user login, only an API key.

It returns totals only. **It never returns donor names, emails, phone numbers
or addresses.**

## 1. Get a key

1. Sign in to the platform as the CEO / Admin.
2. Open **API Keys** in the sidebar.
3. Enter a name for the key (for example `CIC org dashboard`) and create it.
4. **Copy the key right away.** It starts with `cic_` and is shown only once.
   The platform stores only a scrambled (hashed) copy, so nobody can look it up
   later. If you lose it, create a new key and revoke the old one.

The API Keys page shows when each key was last used. **Revoke** turns a key off
immediately.

Keep the key secret, the same as a password. Store it in your dashboard tool's
settings or secrets, not in a shared document.

## 2. Call the API

```
GET <backend-url>/api/v1/summary
X-API-Key: cic_your_key_here
```

`<backend-url>` is the address of the deployed backend, the same value the
frontend uses as `VITE_API_URL`.

### Optional query parameters

| Parameter | Values | Default | What it does |
|---|---|---|---|
| `period` | `month`, `quarter`, `year` | `quarter` | How `by_period` groups gifts |
| `start` | date, `YYYY-MM-DD` | January 1 of last year | First gift date to include |
| `end` | date, `YYYY-MM-DD` | today | Last gift date to include |

### Examples

```bash
# Default: quarterly, from January 1 last year to today
curl -H "X-API-Key: cic_your_key_here" "https://<backend-url>/api/v1/summary"

# Monthly totals for 2026
curl -H "X-API-Key: cic_your_key_here" \
  "https://<backend-url>/api/v1/summary?period=month&start=2026-01-01&end=2026-12-31"
```

You can also try it in a browser: open `<backend-url>/docs`, click
**Authorize**, paste the key, then run `GET /api/v1/summary`.

## 3. What comes back

All amounts are in US dollars. The numbers below are made up to show the shape.

```json
{
  "generated_at": "2026-11-15T18:00:00+00:00",
  "range": { "start": "2025-01-01", "end": "2026-11-15", "period": "quarter" },
  "totals": { "amount": 42500.0, "gifts": 310, "donors": 124, "average_gift": 137.1 },
  "by_period": [
    { "period": "2026-Q3", "amount": 8200.0, "gifts": 61, "donors": 48 }
  ],
  "by_program": [
    { "program": "AI Academy", "amount": 15000.0, "gifts": 40, "donors": 22 },
    { "program": "Unrestricted", "amount": 9800.0, "gifts": 150, "donors": 90 }
  ],
  "by_source": [
    { "source": "zeffy", "amount": 12000.0, "gifts": 180, "donors": 95 }
  ],
  "by_board_member": [
    {
      "board_member": "Jane Doe",
      "donors_owned": 14,
      "donors_contacted_90d": 9,
      "overdue_next_steps": 2,
      "amount": 6250.0, "gifts": 30, "donors": 12
    }
  ],
  "retention_this_year": { "retained": 40, "increased": 18, "decreased": 12, "new": 20, "lapsed": 34 },
  "recent_activity_30d": {
    "gifts": 22,
    "amount": 3100.0,
    "new_donors": 5,
    "messages_sent": 17,
    "latest_gifts": [
      { "date": "2026-11-12", "amount": 50.0, "program": "Unrestricted", "source": "zeffy" }
    ]
  }
}
```

### Fields

Each group in `totals`, `by_period`, `by_program`, `by_source` and
`by_board_member` has the same three numbers:

- `amount`: total dollars given
- `gifts`: number of gifts
- `donors`: number of different donors who gave

All of them count only gifts between `start` and `end`.

| Field | Meaning |
|---|---|
| `generated_at` | When the response was built (UTC) |
| `range` | The dates and period actually used |
| `totals` | Totals for the whole range, plus `average_gift` |
| `by_period` | One row per month (`2026-11`), quarter (`2026-Q4`) or year (`2026`), oldest first |
| `by_program` | One row per program, largest amount first. Gifts not tied to a program show as `Unrestricted` |
| `by_source` | One row per intake channel (`zeffy`, `benevity`, `spreadsheet`, …) |
| `by_board_member` | One row per active board member, sorted by name. `amount`, `gifts` and `donors` are giving in the range from donors that board member owns. `donors_owned` is how many active donors they own, `donors_contacted_90d` is how many of those got a sent message in the last 90 days, and `overdue_next_steps` is how many open follow-ups assigned to them are past due |
| `retention_this_year` | How many donors are in each group this calendar year compared with last year: `new`, `retained`, `increased`, `decreased`, `reactivated`, `lapsed`. Groups with no donors are left out. Because the year isn't over, `lapsed` here means "gave last year, not yet this year" |
| `recent_activity_30d` | The last 30 days, counted from today whatever `start` and `end` are, but only for gifts that also fall inside the range. `latest_gifts` lists up to 10 recent gifts, newest first, with no donor names |

## 4. Errors

| Status | Meaning | What to do |
|---|---|---|
| `401` `Missing X-API-Key header` | No key was sent | Add the `X-API-Key` header |
| `401` `Invalid or revoked API key` | The key is wrong or was revoked | Check for copy-paste mistakes, or create a new key |
| `422` | A parameter is wrong, such as `period=week` or a badly formatted date | Fix the parameter |

## 5. Calling it from a web page

If the dashboard calls the API from code running in a browser, the browser
will block the call unless the dashboard's address is in the backend's
`FRONTEND_ORIGINS` setting, a comma-separated list in the backend's `.env`.
Ask whoever runs the backend to add it. Tools that
call the API from a server, such as most BI tools, scripts and Google Apps
Script, don't need this.

## 6. Refresh

The numbers are calculated fresh on every call. Refreshing every 15 to 60
minutes is plenty for a dashboard.
