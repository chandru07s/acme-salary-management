"""Salary insights. All figures are for ACTIVE employees, normalised to USD.

Design note: we project only the 5 columns we need (narrow rows), convert to USD
and aggregate in-process. For 10k-100k rows this is a few ms to tens of ms, keeps
the median exact (SQLite has no MEDIAN), and keeps the maths in pure, unit-testable
functions. If the dataset grew by orders of magnitude we'd push this into SQL
(window functions on Postgres) or a materialised summary table.
"""
from collections import defaultdict
from typing import Iterable, NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import REPORTING_CURRENCY, SALARY_BAND_EDGES_USD
from app.currency import to_usd
from app.models import Employee
from app.stats import distribution, summarize

GROUPABLE = {"country", "department", "job_title"}


class SalaryRow(NamedTuple):
    country: str
    department: str
    job_title: str
    currency: str
    salary: int

    @property
    def usd(self) -> float:
        return to_usd(self.salary, self.currency)


def load_rows(db: Session) -> list[SalaryRow]:
    stmt = select(
        Employee.country, Employee.department, Employee.job_title, Employee.currency, Employee.salary
    ).where(Employee.status == "active")
    return [SalaryRow(*r) for r in db.execute(stmt).all()]


def summary(rows: Iterable[SalaryRow]) -> dict:
    return {"currency": REPORTING_CURRENCY, **summarize([r.usd for r in rows])}


def group_stats(rows: Iterable[SalaryRow], group: str) -> list[dict]:
    if group not in GROUPABLE:
        raise ValueError(f"group must be one of {sorted(GROUPABLE)}")

    buckets: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        buckets[getattr(r, group)].append(r.usd)

    result = []
    for key, values in buckets.items():
        stats = summarize(values)
        # Pay spread: how wide is the range relative to the typical (median) salary?
        stats["spread_pct"] = round((stats["max"] - stats["min"]) / stats["median"] * 100, 1) if stats["median"] else 0.0
        result.append({"key": key, **stats})
    return sorted(result, key=lambda x: x["total"], reverse=True)


def salary_distribution(rows: Iterable[SalaryRow]) -> list[dict]:
    return distribution([r.usd for r in rows], SALARY_BAND_EDGES_USD)


def overview(db: Session) -> dict:
    rows = load_rows(db)
    return {
        "summary": summary(rows),
        "by_country": group_stats(rows, "country"),
        "by_department": group_stats(rows, "department"),
        "by_job_title": group_stats(rows, "job_title"),
        "distribution": salary_distribution(rows),
    }
