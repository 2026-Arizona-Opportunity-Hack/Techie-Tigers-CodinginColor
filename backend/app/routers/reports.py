from collections import Counter, defaultdict
from datetime import date
from fastapi import APIRouter, Depends
from ..auth import CurrentUser, get_current_user
from ..common import fetch_all, user_names, donor_display_name

router = APIRouter(prefix="/reports", tags=["reports"])
STATUSES = ["new", "reactivated", "retained", "increased", "decreased", "lapsed"]
GAVE_LAST_YEAR = ("retained", "increased", "decreased", "lapsed")


def year_summary(y: int, rows: list[dict], current_year: int) -> dict:
    counts = Counter(r["status"] for r in rows)
    prior = sum(counts[s] for s in GAVE_LAST_YEAR)
    kept = prior - counts["lapsed"]
    return {
        "year": y,
        "in_progress": y == current_year,
        "counts": {s: counts[s] for s in STATUSES},
        "donors_giving": sum(counts[s] for s in STATUSES if s != "lapsed"),
        "total_raised": round(sum(float(r["total"]) for r in rows), 2),
        "retention_rate": round(100 * kept / prior, 1) if prior else None,
        "lost_from_lapsed": round(sum(float(r["prev_total"]) for r in rows
                                      if r["status"] == "lapsed"), 2),
        "gained_from_new": round(sum(float(r["total"]) for r in rows
                                     if r["status"] in ("new", "reactivated")), 2),
    }


@router.get("/retention")
def retention(year: int | None = None, user: CurrentUser = Depends(get_current_user)):
    db = user.db
    rows = fetch_all(lambda: db.table("donor_retention")
                     .select("donor_id, year, total, prev_total, status"))
    if not rows:
        return {"years": [], "selected": None, "call_list": [], "by_owner": []}

    current = date.today().year
    years = sorted({r["year"] for r in rows})
    year = year if year in years else (current if current in years else years[-1])

    by_year = defaultdict(list)
    for r in rows:
        by_year[r["year"]].append(r)
    series = [year_summary(y, by_year[y], current) for y in years]

    # Donor details for the selected year
    donors = {d["id"]: d for d in fetch_all(lambda: db.table("donors")
              .select("id, first_name, last_name, organization_name, owner_id, active"))}
    names = user_names(db)
    sel = by_year[year]

    call_list = sorted(
        (r for r in sel if r["status"] == "lapsed" and donors.get(r["donor_id"], {}).get("active")),
        key=lambda r: float(r["prev_total"]), reverse=True)[:25]
    call_list = [{
        "donor_id": r["donor_id"],
        "donor_name": donor_display_name(donors[r["donor_id"]]),
        "gave_last_year": float(r["prev_total"]),
        "owner_name": names.get(donors[r["donor_id"]]["owner_id"]),
    } for r in call_list]

    # Churn and activation per board member: whose donors are slipping?
    per_owner = defaultdict(Counter)
    for r in sel:
        owner = (donors.get(r["donor_id"]) or {}).get("owner_id")
        per_owner[owner][r["status"]] += 1
    by_owner = sorted(({
        "owner_name": names.get(o, "Unassigned"),
        **{s: c[s] for s in STATUSES},
        "retention_rate": (round(100 * (sum(c[s] for s in GAVE_LAST_YEAR) - c["lapsed"])
                                 / sum(c[s] for s in GAVE_LAST_YEAR), 1)
                           if sum(c[s] for s in GAVE_LAST_YEAR) else None),
    } for o, c in per_owner.items()), key=lambda x: x["lapsed"], reverse=True)

    return {
        "years": series,  # one entry per year: chart this as stacked bars of counts
        "selected": next(s for s in series if s["year"] == year),
        "call_list": call_list,  # biggest lapsed (or not-yet-this-year) donors first
        "by_owner": by_owner,
    }