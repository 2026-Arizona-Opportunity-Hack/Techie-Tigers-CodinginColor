"""Generate FICTIONAL sample exports for testing the donor import.

Every person and organization here is made up. Emails use example.com/.org/.net
and phone numbers use the 555-01xx range reserved for fiction.

    python3 docs/sample-data/make_samples.py

writes zeffy_sample.csv, benevity_sample.csv and cic_spreadsheet_sample.csv
next to this script. The output is the same every run.

What the data is built to show (see README.md in this folder):
  - same email in Zeffy and the spreadsheet -> merged automatically
  - same phone, different emails            -> flagged for duplicate review
  - every retention status across 2023-2026  (new, retained, increased,
    decreased, lapsed, reactivated)
  - a gift in the last 30 days               -> thank-you draft
  - rows the importer should skip: a refund, a failed payment, a bad date
  - Benevity's report title lines above the header, and an anonymous donor
"""

import csv
from pathlib import Path

OUT = Path(__file__).parent

# ------------------------------------------------------------------ Zeffy
# Online donations. No program column, so these gifts are unrestricted.
ZEFFY_HEADER = ["Payment ID", "First Name", "Last Name", "Email", "Phone",
                "Company Name", "Amount", "Payment Date", "Payment Status", "Form Name"]

# (first, last, email, phone, company, [(date, amount, form), ...])
ZEFFY_DONORS = [
    # Retained every year; also in the spreadsheet with the SAME email -> auto-merge
    ("Maria", "Garcia", "maria.garcia@example.com", "(602) 555-0101", "",
     [("2023-11-28", 50, "Giving Tuesday 2023"), ("2024-12-03", 75, "Giving Tuesday 2024"),
      ("2025-12-02", 100, "Giving Tuesday 2025"), ("2026-03-14", 100, "Pi Day Drive 2026")]),
    # Same phone as "Jim Wilson" in the spreadsheet, different email -> review queue
    ("James", "Wilson", "jwilson@example.com", "602-555-0142", "",
     [("2024-06-10", 150, "Summer Camp Sponsorship"), ("2025-06-15", 150, "Summer Camp Sponsorship")]),
    # Increased: 2025 -> 2026
    ("Aisha", "Rahman", "aisha.rahman@example.org", "480-555-0117", "",
     [("2025-04-02", 100, "AZ Gives Day 2025"), ("2026-04-07", 250, "AZ Gives Day 2026")]),
    # Decreased: 2025 -> 2026
    ("Daniel", "Okafor", "d.okafor@example.net", "", "",
     [("2024-12-03", 500, "Giving Tuesday 2024"), ("2025-12-02", 500, "Giving Tuesday 2025"),
      ("2026-05-20", 200, "Spring Appeal 2026")]),
    # Lapsed: gave 2024 and 2025, not 2026 -> on the call list
    ("Priya", "Shah", "priya.shah@example.com", "602-555-0156", "",
     [("2024-04-03", 250, "AZ Gives Day 2024"), ("2025-04-02", 300, "AZ Gives Day 2025")]),
    ("Kevin", "Nguyen", "kevin.nguyen@example.org", "", "",
     [("2025-12-02", 1000, "Giving Tuesday 2025")]),
    # Reactivated: 2023, skipped 2024, back in 2025, and gave again in 2026
    ("Lucia", "Hernandez", "lucia.h@example.com", "623-555-0133", "",
     [("2023-08-19", 40, "Back to School 2023"), ("2025-08-23", 60, "Back to School 2025"),
      ("2026-08-22", 60, "Back to School 2026")]),
    # New in 2026, gift in the last 30 days -> automatic thank-you draft
    ("Marcus", "Bell", "marcus.bell@example.net", "480-555-0188", "",
     [("2026-11-03", 75, "Fall Appeal 2026")]),
    ("Sofia", "Delgado", "sofia.delgado@example.com", "", "",
     [("2026-09-12", 35, "Day of Compute 2026")]),
    # Small local business giving through Zeffy
    ("", "", "hello@cactuscoffee.example.com", "602-555-0170", "Cactus Coffee Roasters (fictional)",
     [("2025-10-10", 300, "Day of Compute 2025"), ("2026-10-09", 400, "Day of Compute 2026")]),
    # Retained, steady monthly-ish giver
    ("Ethan", "Brooks", "ethan.brooks@example.org", "", "",
     [("2023-01-15", 25, "Monthly Supporters"), ("2024-01-15", 25, "Monthly Supporters"),
      ("2025-01-15", 25, "Monthly Supporters"), ("2026-01-15", 25, "Monthly Supporters"),
      ("2026-07-15", 25, "Monthly Supporters")]),
]

# Rows the importer should SKIP, with the reason it should report
ZEFFY_BAD_ROWS = [
    ["ZF-9001", "Taylor", "Reed", "taylor.reed@example.com", "", "", "$80.00",
     "2026-02-14", "Refunded", "Valentine Appeal 2026"],          # refund
    ["ZF-9002", "Morgan", "Lee", "morgan.lee@example.com", "", "", "$45.00",
     "2026-06-01", "Failed", "Spring Appeal 2026"],              # failed payment
]


def write_zeffy():
    rows, n = [], 1000
    for first, last, email, phone, company, gifts in ZEFFY_DONORS:
        for date, amount, form in gifts:
            n += 1
            rows.append([f"ZF-{n}", first, last, email, phone, company,
                         f"${amount:,.2f}", date, "Succeeded", form])
    rows += ZEFFY_BAD_ROWS
    rows.sort(key=lambda r: r[7])
    with open(OUT / "zeffy_sample.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(ZEFFY_HEADER)
        w.writerows(rows)
    return len(rows)


# ------------------------------------------------------------------ Benevity
# Workplace giving. "Company" is the donor's EMPLOYER, not the donor.
# Real reports start with title lines above the header row.
BENEVITY_TITLE = [
    ["Benevity Donation Report (SAMPLE - fictional data)"],
    ["Charity: Coding in Color"],
    ["Period: 2023-01-01 to 2026-10-31"],
    [],
]
BENEVITY_HEADER = ["Transaction ID", "Donor First Name", "Donor Last Name", "Email",
                   "Company", "Project", "Donation Date", "Donation Amount",
                   "Match Amount", "Total Donation to be Acknowledged"]

# (first, last, email, employer, [(date, donation, match, project), ...])
BENEVITY_DONORS = [
    # Retained and increased
    ("Rachel", "Kim", "rachel.kim@example.com", "Sonoran Semiconductor Co. (fictional)",
     [("2024-10-15", 100, 100, "AI Academy"), ("2025-10-14", 150, 150, "AI Academy"),
      ("2026-10-13", 200, 200, "AI Academy")]),
    # Lapsed: gave 2025 only
    ("Tom", "Alvarez", "tom.alvarez@example.org", "Mesa Grid Utilities (fictional)",
     [("2025-03-20", 250, 250, "Summer Camp")]),
    # Decreased
    ("Hannah", "Cho", "hannah.cho@example.net", "Sonoran Semiconductor Co. (fictional)",
     [("2025-11-01", 500, 500, "K12 Programs"), ("2026-11-01", 200, 200, "K12 Programs")]),
    # Retained across all four years
    ("Omar", "Haddad", "omar.haddad@example.com", "Valley Software Group (fictional)",
     [("2023-12-10", 50, 0, "Day of Compute"), ("2024-12-09", 50, 0, "Day of Compute"),
      ("2025-12-08", 50, 0, "Day of Compute"), ("2026-06-08", 75, 0, "Day of Compute")]),
    # Lapsed big giver: biggest name on the call list
    ("Grace", "Patel", "grace.patel@example.org", "Mesa Grid Utilities (fictional)",
     [("2024-12-01", 1000, 1000, "AI Academy"), ("2025-12-01", 1250, 1250, "AI Academy")]),
]


def write_benevity():
    rows, n = [], 5000
    for first, last, email, employer, gifts in BENEVITY_DONORS:
        for date, donation, match, project in gifts:
            n += 1
            rows.append([f"BEN-{n}", first, last, email, employer, project, date,
                         f"{donation:.2f}", f"{match:.2f}", f"{donation + match:.2f}"])
    # Anonymous donor. Real Benevity reports may write "Not shared by donor" in
    # both name columns, which the importer doesn't catch yet; "Anonymous" works.
    rows.append(["BEN-5999", "Anonymous", "", "",
                 "Valley Software Group (fictional)", "K12 Programs", "2026-03-05",
                 "100.00", "100.00", "200.00"])
    rows.sort(key=lambda r: r[6])
    with open(OUT / "benevity_sample.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerows(BENEVITY_TITLE)
        w.writerow(BENEVITY_HEADER)
        w.writerows(rows)
    return len(rows)


# ------------------------------------------------------------------ CIC spreadsheet
# The staff's hand-kept sheet: funders and checks, mixed date formats, no IDs.
SHEET_HEADER = ["Name", "Organization", "Email", "Phone", "Amount", "Date",
                "Campaign", "Program", "Donor Type"]

SHEET_ROWS = [
    # Foundations and corporate funders (all fictional)
    ["Dana Whitfield", "Desert Bloom Foundation", "grants@desertbloom.example.org", "602-555-0190",
     "$10,000.00", "3/1/2023", "Annual Grant", "AI Academy", "Funder"],
    ["Dana Whitfield", "Desert Bloom Foundation", "grants@desertbloom.example.org", "602-555-0190",
     "$12,500.00", "3/4/2024", "Annual Grant", "AI Academy", "Funder"],
    ["Dana Whitfield", "Desert Bloom Foundation", "grants@desertbloom.example.org", "602-555-0190",
     "$15,000.00", "3/3/2025", "Annual Grant", "AI Academy", "Funder"],
    ["Dana Whitfield", "Desert Bloom Foundation", "grants@desertbloom.example.org", "602-555-0190",
     "$15,000.00", "3/2/2026", "Annual Grant", "AI Academy", "Funder"],
    ["", "Copper State Community Fund", "giving@copperstate.example.org", "480-555-0191",
     "$5,000.00", "9/15/2024", "Summer Camp Grant", "Summer Camp", "Funder"],
    ["", "Copper State Community Fund", "giving@copperstate.example.org", "480-555-0191",
     "$5,000.00", "9/12/2025", "Summer Camp Grant", "Summer Camp", "Funder"],
    # Lapsed funder: gave 2024 and 2025, nothing yet in 2026
    ["Leo Martins", "Saguaro Tech Partners", "leo.martins@saguarotech.example.com", "",
     "$2,500.00", "Jun 20, 2024", "Day of Compute Sponsor", "Day of Compute", "Funder"],
    ["Leo Martins", "Saguaro Tech Partners", "leo.martins@saguarotech.example.com", "",
     "$3,000.00", "Jun 18, 2025", "Day of Compute Sponsor", "Day of Compute", "Funder"],
    ["", "Grand Canyon Learning Trust", "info@gclt.example.org", "",
     "$7,500.00", "2026-01-20", "K12 Expansion", "K12 Programs", "Funder"],
    # Individuals who gave by check or at events
    # SAME EMAIL as Maria Garcia in Zeffy -> merged automatically
    ["Maria Garcia", "", "maria.garcia@example.com", "602-555-0101",
     "$200.00", "5/9/2025", "Day of Compute 2025", "Day of Compute", "Individual"],
    # SAME PHONE as James Wilson in Zeffy, different email -> duplicate review
    ["Jim Wilson", "", "jimmy.w@example.net", "(602) 555-0142",
     "$100.00", "10/2/2025", "Board Dinner 2025", "", "Individual"],
    ["Beatriz Soto", "", "beatriz.soto@example.com", "623-555-0160",
     "$500.00", "12/15/2023", "Year-End 2023", "K12 Programs", "Individual"],
    ["Beatriz Soto", "", "beatriz.soto@example.com", "623-555-0160",
     "$750.00", "12/16/2024", "Year-End 2024", "K12 Programs", "Individual"],
    ["Beatriz Soto", "", "beatriz.soto@example.com", "623-555-0160",
     "$1,000.00", "12/12/2025", "Year-End 2025", "K12 Programs", "Individual"],
    ["Samuel Ortiz", "", "", "480-555-0175",
     "$60.00", "4/22/2026", "Spring Appeal 2026", "", "Individual"],
    # Bad date -> the gift is skipped, the donor is kept
    ["Nina Park", "", "nina.park@example.org", "",
     "$40.00", "sometime in spring", "Spring Appeal 2026", "", "Individual"],
]


def write_sheet():
    with open(OUT / "cic_spreadsheet_sample.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(SHEET_HEADER)
        w.writerows(SHEET_ROWS)
    return len(SHEET_ROWS)


if __name__ == "__main__":
    print("zeffy_sample.csv:", write_zeffy(), "rows")
    print("benevity_sample.csv:", write_benevity(), "rows")
    print("cic_spreadsheet_sample.csv:", write_sheet(), "rows")
