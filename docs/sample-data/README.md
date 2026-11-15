# Sample donor exports (fictional)

Three made-up exports for trying the import. **Every name, organization, email and
phone number is fictional**: emails use `example.com/.org/.net`, phones use the
`555-01xx` range, and organizations are invented.

| File | Import as | Rows | What's in it |
|---|---|---|---|
| `zeffy_sample.csv` | Zeffy | 28 | Online gifts 2023–2026, one refund and one failed payment |
| `cic_spreadsheet_sample.csv` | CIC spreadsheet | 16 | Foundation grants and checks, mixed date formats, one unreadable date |
| `benevity_sample.csv` | Benevity | 13 | Workplace gifts with company matches, report title lines above the header, one anonymous gift |

To rebuild them: `python3 docs/sample-data/make_samples.py`

## Import them in this order: Zeffy, spreadsheet, Benevity

Expected results on an empty database:

| File | New donors | New gifts | Skipped | Also |
|---|---|---|---|---|
| Zeffy | 11 | 26 | 2 (refund, failed payment) | |
| Spreadsheet | 8 | 15 | 1 gift (date "sometime in spring") | Maria Garcia matched by email; 1 possible duplicate |
| Benevity | 5 | 13 | 0 | 1 anonymous gift |

Uploading any file a second time adds **0** donors and **0** gifts.

## What each feature should show

- **Automatic merge:** Maria Garcia is in Zeffy and the spreadsheet with the same email, so she ends up as one donor with gifts from both.
- **Duplicate review:** James Wilson (Zeffy) and Jim Wilson (spreadsheet) share a phone number but have different emails, so they're flagged for review instead of merged.
- **Retention, 2026 compared with 2025** (yearly totals across all three files):
  - new: Marcus Bell, Sofia Delgado, Samuel Ortiz, Grand Canyon Learning Trust
  - increased: Aisha Rahman, Rachel Kim, Omar Haddad, Ethan Brooks, Cactus Coffee Roasters
  - decreased: Daniel Okafor, Hannah Cho, Maria Garcia ($300 in 2025, $100 so far in 2026)
  - same amount: Desert Bloom Foundation, Lucia Hernandez
  - lapsed (not yet this year): Grace Patel ($2,500 in 2025, the biggest), Priya Shah, Kevin Nguyen, Tom Alvarez, James/Jim Wilson, Beatriz Soto, Saguaro Tech Partners, Copper State Community Fund
  - **2025 view:** Lucia Hernandez is reactivated (gave in 2023, skipped 2024)
  - The exact status names come from the `donor_retention` view in the database.
- **Thank-you draft:** Marcus Bell's gift on Nov 3, 2026 is within the last 30 days.
- **Funder packet:** Desert Bloom Foundation gave to AI Academy every year from 2023 to 2026.

Program names in the spreadsheet (AI Academy, Summer Camp, K12 Programs, Day of
Compute) must exist in the `programs` table, or those gifts are saved without a
program. Benevity's "Project" column is read as the campaign, not the program.
