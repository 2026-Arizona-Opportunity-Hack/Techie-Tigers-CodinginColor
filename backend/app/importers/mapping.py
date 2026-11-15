"""Match export column headers to our fields.

Headers are compared after lowercasing and removing everything but letters
and digits, so "Donor E-mail" == "donoremail". Earlier aliases win. To support
a new export format, add its header names here.
"""

import re

SOURCES = ("spreadsheet", "zeffy", "benevity")

ALIASES: dict[str, list[str]] = {
    "external_id": [
        "transactionid", "donationid", "paymentid", "receiptnumber",
        "referencenumber", "orderid", "id",
    ],
    "first_name": ["firstname", "donorfirstname", "first", "givenname"],
    "last_name": ["lastname", "donorlastname", "last", "surname", "familyname"],
    "full_name": ["fullname", "donorname", "name", "donor", "contactname"],
    "organization_name": [
        "organizationname", "organization", "orgname", "foundation", "funder",
    ],
    "email": ["email", "emailaddress", "donoremail", "donoremailaddress"],
    "phone": ["phone", "phonenumber", "mobile", "cell", "donorphone"],
    "amount": [
        "totaldonationtobeacknowledged",  # Benevity: donation + company match
        "donationamount", "giftamount", "totalamount", "amount", "total",
    ],
    "date": [
        "donationdate", "giftdate", "paymentdate", "transactiondate",
        "date", "datetime", "createdat",
    ],
    "campaign": ["campaign", "campaignname", "campaigntitle", "formname", "form", "project"],
    "program": ["program", "programname", "designation", "fund"],
    "donor_type": ["donortype", "type", "category"],
    "status": ["paymentstatus", "status"],
}

# Benevity's "Company" is the donor's employer, not the donor, so it is
# only treated as an organization for the spreadsheet and Zeffy.
_EXTRA = {
    "spreadsheet": {"organization_name": ["company", "companyname"]},
    "zeffy": {"organization_name": ["company", "companyname"]},
}

# Fields where "Payment Date (America/Phoenix)" should still match "paymentdate".
_PREFIX_OK = {"date", "amount"}


def canon(header) -> str:
    return re.sub(r"[^a-z0-9]", "", str(header).lower())


def aliases_for(source: str) -> dict[str, list[str]]:
    out = {k: list(v) for k, v in ALIASES.items()}
    for field, names in _EXTRA.get(source, {}).items():
        out[field] += names
    return out


def map_columns(headers: list[str], source: str) -> dict[str, str]:
    """Return {our_field: original_header} for every field we recognise."""
    by_canon: dict[str, str] = {}
    for h in headers:
        by_canon.setdefault(canon(h), h)

    mapping: dict[str, str] = {}
    used: set[str] = set()
    aliases = aliases_for(source)

    for field, names in aliases.items():
        for n in names:
            h = by_canon.get(n)
            if h is not None and h not in used:
                mapping[field] = h
                used.add(h)
                break

    # Second pass: prefix match for headers with suffixes like a timezone.
    for field in _PREFIX_OK - mapping.keys():
        for n in aliases[field]:
            h = next((orig for c, orig in by_canon.items()
                      if c.startswith(n) and orig not in used), None)
            if h is not None:
                mapping[field] = h
                used.add(h)
                break
    return mapping


def find_header_row(rows: list[list[str]], source: str, scan: int = 20) -> int:
    """Some exports (Benevity) put report titles above the real header.
    Pick the first row in the top `scan` rows that matches the most fields."""
    best_idx, best_hits = 0, 0
    for i, row in enumerate(rows[:scan]):
        hits = len(map_columns([c for c in row if str(c).strip()], source))
        if hits > best_hits:
            best_idx, best_hits = i, hits
    return best_idx
