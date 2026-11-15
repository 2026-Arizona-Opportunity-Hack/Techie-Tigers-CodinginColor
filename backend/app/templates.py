"""Message templates and contact links.

Every template signs off with "[Your name]". It's replaced with the sender's
real name when they open the draft's links and when they mark it sent.
"""

from urllib.parse import quote, urlencode

SIGN_OFF = "\n\nWith gratitude,\n[Your name]\nCoding in Color"


# ---------- formatting ----------

def first_name(d: dict) -> str:
    return d.get("first_name") or d.get("organization_name") or "friend"


def money(amount) -> str:
    a = float(amount)
    return f"${a:,.0f}" if a.is_integer() else f"${a:,.2f}"


# ---------- contact links ----------

def contact_links(email: str | None, phone: str | None,
                  subject: str = "", body: str = "") -> dict:
    """Links that open the sender's own Gmail or phone with the message filled in.
    A human always presses send."""
    links = {}
    if email:
        links["gmail"] = "https://mail.google.com/mail/?" + urlencode(
            {"view": "cm", "fs": "1", "to": email, "su": subject, "body": body},
            quote_via=quote)
        links["mailto"] = f"mailto:{email}?" + urlencode(
            {"subject": subject, "body": body}, quote_via=quote)
    if phone:
        num = f"+1{phone}"  # phones are stored as 10 digits
        links["sms"] = f"sms:{num}?&body={quote(body)}"  # ?& works on iPhone and Android
        links["call"] = f"tel:{num}"
    return links


# ---------- templates ----------

def thank_you(donor: dict, amount, program: str | None,
              channel: str) -> tuple[str | None, str]:
    """Returns (subject, body). Texts have no subject."""
    to_what = f" to {program}" if program else ""
    if channel == "text":
        return None, (
            f"Hi {first_name(donor)}, it's [Your name] from Coding in Color. "
            f"Thank you so much for your {money(amount)} gift{to_what}! "
            "It brings computer science to Arizona students whose schools don't offer it."
        )
    return "Thank you for your gift to Coding in Color", (
        f"Hi {first_name(donor)},\n\n"
        f"Thank you for your generous gift of {money(amount)}{to_what}. "
        "Because of supporters like you, high school students across Arizona "
        "are learning computer science and AI, often for the first time.\n\n"
        "I'll send you an update on what your gift makes possible."
        + SIGN_OFF
    )


def quarterly_update(donor: dict, outcomes: list[dict],
                     given_this_year: float = 0, gave_before: bool = False) -> tuple[str, str]:
    """outcomes: rows like {"year": 2026, "description": "...", "programs": {"name": "..."}},
    newest year first. Uses only the latest year's outcomes.
    given_this_year: the donor's total gifts since January 1.
    gave_before: whether they gave in any earlier year."""
    latest_year = outcomes[0]["year"] if outcomes else None
    highlights = "\n".join(
        f"- {(o.get('programs') or {}).get('name', 'Our programs')}: {o['description']}"
        for o in outcomes if o["year"] == latest_year
    ) or "- [Add this quarter's highlights]"
    if given_this_year > 0:
        opening = (f"Thank you for your {money(given_this_year)} in support this year. "
                   "Here's what it helped make possible for Arizona high schoolers:")
    elif gave_before:
        opening = ("Thank you for your past support of Coding in Color. Here's what "
                   "supporters like you made possible for Arizona high schoolers this year:")
    else:
        opening = ("Thank you for being part of Coding in Color. Here's what your support "
                   "made possible for Arizona high schoolers this year:")
    subject = "Your quarterly update from Coding in Color"
    body = (
        f"Hi {first_name(donor)},\n\n"
        f"{opening}\n\n"
        f"{highlights}\n\n"
        "I'd love to tell you more, or show you a class in action at our next event."
        + SIGN_OFF
    )
    return subject, body