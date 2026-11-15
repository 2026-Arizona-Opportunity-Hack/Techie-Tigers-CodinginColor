"""AI-drafted donor updates (P1).

The model only sees the donor's first name, their gifts (date, amount, program)
and program outcomes: never emails, phone numbers or full records. Whatever it
writes is saved as a draft; a person reviews and sends it like any other.
"""

import json
import re

import httpx

from .config import get_settings
from .templates import SIGN_OFF, first_name, money


class AIUnavailable(Exception):
    """AI is turned off, or the model call failed. Callers fall back to a template."""


SYSTEM = (
    "You write donor updates for Coding in Color, an Arizona nonprofit that teaches "
    "high school students computer science and AI. Write as the board member who "
    "personally knows this donor: warm, specific, plain language, no hype. "
    "Thank them for their actual giving, connect it to the programs they supported, "
    "and use the outcomes given. Use ONLY the facts provided: do not invent numbers, "
    "programs, events, what money was spent on, or what students' projects did. If "
    "a detail isn't in the facts, leave it out rather than guess; a shorter message "
    "is better than an embellished one. Do not add a greeting name other than the "
    "one given, and do not sign off; a signature is added after your text."
)


def _facts(donor: dict, gifts: list[dict], outcomes: list[dict]) -> str:
    lines = [f"Donor first name: {first_name(donor)}"]
    if gifts:
        total = sum(float(g["amount"]) for g in gifts)
        lines.append(f"Lifetime giving: {money(total)} across {len(gifts)} gift(s)")
        lines.append("Gifts, newest first:")
        for g in gifts[:15]:
            program = (g.get("programs") or {}).get("name") or "unrestricted"
            lines.append(f"- {g['gift_date']}: {money(g['amount'])} to {program}")
    else:
        lines.append("No gifts on record yet.")
    if outcomes:
        lines.append("Program outcomes:")
        for o in outcomes:
            program = (o.get("programs") or {}).get("name") or "Our programs"
            lines.append(f"- {program} ({o['year']}): {o['description']}")
    else:
        lines.append("No program outcomes recorded; speak generally about the work.")
    return "\n".join(lines)


def draft_update(donor: dict, gifts: list[dict], outcomes: list[dict],
                 channel: str) -> tuple[str | None, str]:
    """Returns (subject, body) for an email, or (None, body) for a text."""
    s = get_settings()
    if not s.openai_api_key:
        raise AIUnavailable("AI drafting is not configured")

    if channel == "text":
        shape = ('a text message under 320 characters. Reply with JSON only: '
                 '{"body": "..."}')
    else:
        shape = ('an email of 120-200 words starting with "Hi <first name>,". '
                 'Reply with JSON only: {"subject": "...", "body": "..."}')
    prompt = f"{_facts(donor, gifts, outcomes)}\n\nWrite {shape}"

    try:
        r = httpx.post(
            f"{s.openai_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {s.openai_api_key}"},
            json={"model": s.openai_model,
                  "messages": [{"role": "system", "content": SYSTEM},
                               {"role": "user", "content": prompt}],
                  "temperature": 0.3, "max_tokens": 1500},
            timeout=45,
        )
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"] or ""
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        raise AIUnavailable(f"AI request failed: {e}") from e

    # Models sometimes wrap JSON in prose or code fences; take the first object.
    match = re.search(r"\{.*\}", text, re.DOTALL)
    try:
        data = json.loads(match.group(0)) if match else {}
    except json.JSONDecodeError:
        data = {}
    body = (data.get("body") or "").strip()
    if not body:
        raise AIUnavailable("AI returned no usable draft")

    if channel == "text":
        return None, body + "\n- [Your name], Coding in Color"
    subject = (data.get("subject") or "").strip() or "An update from Coding in Color"
    return subject, body + SIGN_OFF
