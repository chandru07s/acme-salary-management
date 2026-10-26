"""Insights maths verified against values computed by hand.

Fixture (active employees), USD-normalised:
    US Engineering   Software Engineer   100,000 USD -> 100,000
    US Engineering   Software Engineer   120,000 USD -> 120,000
    GB Engineering   Software Engineer   100,000 GBP -> 127,000   (x1.27)
    IN Sales         Sales Representative 1,000,000 INR -> 12,000 (x0.012)
"""
import pytest

from app.services import insights
from app.services.insights import SalaryRow

ROWS = [
    SalaryRow("US", "Engineering", "Software Engineer", "USD", 100_000),
    SalaryRow("US", "Engineering", "Software Engineer", "USD", 120_000),
    SalaryRow("GB", "Engineering", "Software Engineer", "GBP", 100_000),
    SalaryRow("IN", "Sales", "Sales Representative", "INR", 1_000_000),
]


def test_summary():
    s = insights.summary(ROWS)
    assert s["headcount"] == 4
    assert s["total"] == 359_000
    assert s["avg"] == 89_750
    assert s["median"] == 110_000  # (100k + 120k) / 2
    assert (s["min"], s["max"]) == (12_000, 127_000)
    assert s["currency"] == "USD"


def test_group_by_country():
    by = {g["key"]: g for g in insights.group_stats(ROWS, "country")}
    us = by["US"]
    assert (us["headcount"], us["total"], us["avg"], us["median"]) == (2, 220_000, 110_000, 110_000)
    assert us["spread_pct"] == 18.2  # (120k - 100k) / 110k
    assert by["GB"]["avg"] == 127_000


def test_group_by_job_title_median():
    by = {g["key"]: g for g in insights.group_stats(ROWS, "job_title")}
    assert by["Software Engineer"]["median"] == 120_000
    assert by["Software Engineer"]["headcount"] == 3


def test_groups_sorted_by_total_payroll_descending():
    keys = [g["key"] for g in insights.group_stats(ROWS, "country")]
    assert keys == ["US", "GB", "IN"]


def test_single_person_group_has_zero_spread():
    by = {g["key"]: g for g in insights.group_stats(ROWS, "country")}
    assert by["IN"]["spread_pct"] == 0.0


def test_invalid_group_rejected():
    with pytest.raises(ValueError):
        insights.group_stats(ROWS, "salary")


def test_distribution_buckets():
    bands = {b["label"]: b["count"] for b in insights.salary_distribution(ROWS)}
    assert bands["< 30k"] == 1  # the INR salary, worth 12k USD
    assert bands["100k – 150k"] == 3


def test_overview_ignores_terminated_employees(db, add):
    from app.services import employees as svc

    keep = add(salary=100_000, country="US")
    gone = add(salary=900_000, country="US")
    svc.deactivate_employee(db, gone.id)

    result = insights.overview(db)
    assert result["summary"]["headcount"] == 1
    assert result["summary"]["total"] == keep.salary


def test_overview_on_empty_db_does_not_crash(db):
    result = insights.overview(db)
    assert result["summary"]["headcount"] == 0
    assert result["by_country"] == []
