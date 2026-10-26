"""Pay-equity view: how does each person's salary compare with their peers?

Peers = active employees with the same job title in the same country. They share a currency, so
the comparison needs no FX conversion (changing a rate never moves anyone's compa-ratio).
compa_ratio = salary / peer median. 1.00 is exactly at the median.
Groups smaller than MIN_PEERS give no ratio: a median of two people is not a benchmark.
"""
from collections import defaultdict
from datetime import date
from statistics import median
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import COUNTRY_NAMES
from app.currency import to_usd
from app.models import Employee

MIN_PEERS = 3
BELOW = 0.85
ABOVE = 1.15
Band = Literal["below", "within", "above"]


def band_for(ratio: float) -> Band:
    return "below" if ratio < BELOW else "above" if ratio > ABOVE else "within"


def tenure_years(hired: date, today: date | None = None) -> float:
    return round(((today or date.today()) - hired).days / 365.25, 1)


def _medians(db: Session) -> dict[tuple[str, str], tuple[float, int]]:
    groups: dict[tuple[str, str], list[int]] = defaultdict(list)
    for country, title, salary in db.execute(
        select(Employee.country, Employee.job_title, Employee.salary).where(Employee.status == "active")
    ):
        groups[(country, title)].append(salary)
    return {k: (float(median(v)), len(v)) for k, v in groups.items()}


def _row(e: Employee, med: tuple[float, int] | None) -> dict:
    ratio = round(e.salary / med[0], 3) if med and med[1] >= MIN_PEERS and med[0] else None
    return {
        "id": e.id, "full_name": e.full_name, "country": e.country, "country_name": COUNTRY_NAMES[e.country],
        "department": e.department, "job_title": e.job_title, "currency": e.currency,
        "salary": e.salary, "salary_usd": to_usd(e.salary, e.currency),
        "peer_median": med[0] if med else None, "peers": med[1] if med else 0,
        "compa_ratio": ratio, "band": band_for(ratio) if ratio is not None else None,
        "tenure_years": tenure_years(e.hire_date),
    }


def report(db: Session, band: str | None = None, country: str | None = None, department: str | None = None,
           page: int = 1, page_size: int = 25) -> dict:
    medians = _medians(db)
    stmt = select(Employee).where(Employee.status == "active")
    rows = [_row(e, medians.get((e.country, e.job_title))) for e in db.scalars(stmt)]
    rated = [r for r in rows if r["compa_ratio"] is not None]

    counts = {"below": 0, "within": 0, "above": 0}
    below_by_dept: dict[str, int] = defaultdict(int)
    for r in rated:
        counts[r["band"]] += 1
        if r["band"] == "below":
            below_by_dept[r["department"]] += 1

    selected = [
        r for r in rated
        if (not band or r["band"] == band) and (not country or r["country"] == country)
        and (not department or r["department"] == department)
    ]
    # Most underpaid first, unless looking at the "above" band.
    selected.sort(key=lambda r: r["compa_ratio"], reverse=(band == "above"))
    start = (page - 1) * page_size
    return {
        "summary": {**counts, "rated": len(rated), "unrated": len(rows) - len(rated),
                    "below_pct": round(counts["below"] / len(rated) * 100, 1) if rated else 0.0,
                    "thresholds": {"below": BELOW, "above": ABOVE, "min_peers": MIN_PEERS}},
        "below_by_department": sorted(
            ({"department": d, "count": n} for d, n in below_by_dept.items()), key=lambda x: -x["count"]
        ),
        "items": selected[start:start + page_size], "total": len(selected), "page": page, "page_size": page_size,
    }


def position(db: Session, employee: Employee) -> dict:
    """The same numbers for one person (used on the profile page)."""
    peers = [s for (s,) in db.execute(
        select(Employee.salary).where(
            Employee.status == "active", Employee.country == employee.country, Employee.job_title == employee.job_title
        )
    )]
    med = (float(median(peers)), len(peers)) if peers else None
    row = _row(employee, med)
    return {k: row[k] for k in ("peer_median", "peers", "compa_ratio", "band", "tenure_years")}
