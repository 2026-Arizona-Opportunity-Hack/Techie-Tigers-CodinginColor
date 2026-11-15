"""Turn messy export cells into clean values. No database access here."""

import hashlib
import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation

import pandas as pd

_BLANKS = {"", "nan", "none", "null", "n/a", "na", "-", "--", "not shared by donor", "not shared"}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Name keys (see name_key) that mean "we don't know who this is".
_ANONYMOUS = {
    "anonymous", "anon", "anonymous donor", "anonymous anonymous",
    "not shared", "not shared by donor", "private", "private donor",
}




def clean(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return None if s.lower() in _BLANKS else s


def clean_id(value) -> str | None:
    """IDs from Excel sometimes come back as '12345.0'."""
    s = clean(value)
    if s and re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    return s


def norm_email(value) -> str | None:
    s = clean(value)
    if not s:
        return None
    s = s.lower()
    return s if _EMAIL_RE.match(s) else None


def norm_phone(value) -> str | None:
    """Digits only, US country code dropped, so (602) 555-1234 == +1 602.555.1234."""
    s = clean(value)
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) >= 7 else None


def parse_amount(value) -> Decimal | None:
    """'$1,250.00' -> 1250.00. Zero, negative and '(50.00)' (refunds) -> None."""
    s = clean(value)
    if not s:
        return None
    negative = s.startswith("(") and s.endswith(")")
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        amount = Decimal(s)
    except InvalidOperation:
        return None
    if negative:
        amount = -amount
    return amount.quantize(Decimal("0.01")) if amount > 0 else None


def parse_date(value) -> date | None:
    s = clean(value)
    if not s:
        return None
    try:
        ts = pd.to_datetime(s, errors="coerce")
    except (ValueError, TypeError, OverflowError):
        return None
    if ts is None or pd.isna(ts):
        return None
    d = ts.date()
    return d if 1990 <= d.year <= date.today().year + 1 else None


def split_name(full: str) -> tuple[str | None, str | None]:
    """'Smith, Jane' or 'Jane Q Smith' -> ('Jane', 'Smith') / ('Jane Q', 'Smith')."""
    if "," in full:
        last, first = (p.strip() for p in full.split(",", 1))
        return first or None, last or None
    parts = full.split()
    if len(parts) == 1:
        return parts[0], None
    return " ".join(parts[:-1]), parts[-1]


def display_name(first, last, org) -> str:
    person = " ".join(p for p in (first, last) if p)
    return person or org or ""


def name_key(first, last, org) -> str:
    """Lowercase letters/digits only, for exact name comparisons."""
    s = display_name(first, last, org).lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(s.split())


def is_anonymous(first, last, org) -> bool:
    key = name_key(first, last, org)
    return key in _ANONYMOUS


def row_hash(source: str, row: dict) -> str:
    """Stable id for rows whose export has no transaction id, so the same
    row uploaded twice is still recognised."""
    payload = json.dumps([source, sorted(row.items())], default=str)
    return "h:" + hashlib.sha256(payload.encode()).hexdigest()[:32]
