import csv
import io
from collections import defaultdict
from datetime import date
from html import escape
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response

from ..auth import CurrentUser, require_roles
from ..common import fetch_all, get_donor_or_404, donor_display_name
from ..db import service_client
from ..templates import money

router = APIRouter(prefix="/exports", tags=["exports"])


def build_packet(db, donor_id: int) -> dict:
    """Gather one funder's gifts, totals, and the outcomes their gifts funded."""
    donor = get_donor_or_404(db, donor_id)
    if donor["donor_type"] != "funder":
        raise HTTPException(400, "Funder packets are only for funders, not individual donors")
    gifts = fetch_all(lambda: db.table("gifts")
                      .select("gift_date, amount, campaign, source, program_id, programs(name)")
                      .eq("donor_id", donor_id).order("gift_date"))
    years = {int(g["gift_date"][:4]) for g in gifts}
    program_ids = {g["program_id"] for g in gifts if g["program_id"]}
    unrestricted = any(not g["program_id"] for g in gifts)

    outcomes = fetch_all(lambda: db.table("outcomes")
                         .select("year, description, program_id, programs(name)").order("year"))
    funded = [o for o in outcomes
              if o["year"] in years and (unrestricted or o["program_id"] in program_ids)]

    by_year, by_program = defaultdict(float), defaultdict(float)
    for g in gifts:
        amt = float(g["amount"])
        by_year[g["gift_date"][:4]] += amt
        by_program[(g.get("programs") or {}).get("name") or "Unrestricted"] += amt

    return {
        "funder": donor_display_name(donor),
        "contact": {"name": " ".join(filter(None, (donor["first_name"], donor["last_name"]))),
                    "email": donor["email"], "phone": donor["phone"]},
        "as_of": date.today().isoformat(),
        "lifetime_total": round(sum(by_year.values()), 2),
        "first_gift": gifts[0]["gift_date"] if gifts else None,
        "by_year": dict(sorted(by_year.items())),
        "by_program": dict(sorted(by_program.items(), key=lambda kv: -kv[1])),
        "outcomes": [{"year": o["year"],
                      "program": (o.get("programs") or {}).get("name"),
                      "description": o["description"]} for o in funded],
        "gifts": [{"date": g["gift_date"], "amount": float(g["amount"]),
                   "program": (g.get("programs") or {}).get("name") or "Unrestricted",
                   "campaign": g["campaign"], "source": g["source"]} for g in gifts],
    }


def render_html(p: dict) -> str:
    """Print-ready packet. Every value is escaped: names come from imported files."""
    e = lambda v: escape(str(v)) if v is not None else ""
    rows = lambda pairs: "".join(f"<tr><td>{e(k)}</td><td class=n>{money(v)}</td></tr>"
                                 for k, v in pairs)
    gift_rows = "".join(
        f"<tr><td>{e(g['date'])}</td><td class=n>{money(g['amount'])}</td>"
        f"<td>{e(g['program'])}</td><td>{e(g['campaign'])}</td></tr>" for g in p["gifts"])
    outcome_items = "".join(
        f"<li><b>{e(o['year'])} · {e(o['program'])}:</b> {e(o['description'])}</li>"
        for o in p["outcomes"]) or "<li>No outcomes recorded for these years yet.</li>"
    return f"""<!doctype html><html><head><meta charset=utf-8>
<title>Funder packet: {e(p['funder'])}</title>
<style>
 body {{ font: 14px/1.5 system-ui, sans-serif; max-width: 760px; margin: 32px auto; color: #111; }}
 h1 {{ margin: 0 }} .muted {{ color: #555 }}
 table {{ border-collapse: collapse; width: 100%; margin: 8px 0 20px }}
 td, th {{ border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left }}
 .n {{ text-align: right; font-variant-numeric: tabular-nums }}
 .big {{ font-size: 28px; font-weight: 700 }}
 @media print {{ body {{ margin: 0 }} }}
</style></head><body>
<h1>{e(p['funder'])}</h1>
<p class=muted>Coding in Color · Funder history as of {e(p['as_of'])}</p>
<p><span class=big>{money(p['lifetime_total'])}</span> given since {e(p['first_gift'])}</p>
<h2>What this funding made possible</h2><ul>{outcome_items}</ul>
<h2>Giving by year</h2><table>{rows(p['by_year'].items())}</table>
<h2>Giving by program</h2><table>{rows(p['by_program'].items())}</table>
<h2>Gift history</h2>
<table><tr><th>Date</th><th class=n>Amount</th><th>Program</th><th>Campaign</th></tr>{gift_rows}</table>
</body></html>"""


@router.get("/funder-packet/{donor_id}")
def funder_packet(donor_id: int, format: Literal["html", "csv", "json"] = "html",
                  user: CurrentUser = Depends(require_roles("admin", "fundraising"))):
    p = build_packet(user.db, donor_id)
    service_client().table("export_log").insert({
        "user_id": user.id, "kind": "funder_packet",
        "filter": {"donor_id": donor_id, "format": format},
        "row_count": len(p["gifts"]),
    }).execute()

    if format == "json":
        return p
    if format == "csv":
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["date", "amount", "program", "campaign", "source"])
        w.writeheader()
        w.writerows(p["gifts"])
        filename = f"funder-{donor_id}-{p['as_of']}.csv"
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    return HTMLResponse(render_html(p))