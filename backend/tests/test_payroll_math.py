from datetime import date

import pytest

from app import payroll as p

CFG = p.PayConfig(basic_pct=40, hra_pct_of_basic=50, retirement_pct=12, tax_pct=10)


def test_structure_parts_always_add_up_to_the_gross():
    for annual in (1_200_000, 999_999, 1, 7_777_777, 123_456):
        s = p.structure(annual, CFG)
        assert round(s["basic"] + s["hra"] + s["special"], 2) == s["gross"]


def test_structure_for_a_round_salary():
    # 1,200,000 a year -> 100,000 a month: basic 40,000, HRA 20,000 (50% of basic), special 40,000
    assert p.structure(1_200_000, CFG) == {"gross": 100_000.0, "basic": 40_000.0, "hra": 20_000.0, "special": 40_000.0}


def test_full_month_payslip():
    s = p.compute_payslip(1_200_000, CFG)
    assert s["gross"] == 100_000 and s["retirement"] == 4_800 and s["tax"] == 10_000
    assert s["net"] == 85_200 and s["variable"] == 0 and s["reimbursement"] == 0


def test_bonus_is_taxed_but_reimbursement_is_not():
    s = p.compute_payslip(1_200_000, CFG, taxable_variable=20_000, reimbursement=5_000)
    assert s["gross"] == 120_000 and s["tax"] == 12_000
    assert s["net"] == 120_000 - 4_800 - 12_000 + 5_000


def test_proration_of_a_mid_month_join():
    # joined on the 16th of a 30-day month: days 16..30 = 15 days = half the month
    assert p.proration(date(2026, 6, 16), "2026-06") == 0.5
    assert p.proration(date(2026, 6, 1), "2026-06") == 1.0
    assert p.proration(date(2020, 1, 1), "2026-06") == 1.0
    assert p.proration(date(2026, 7, 1), "2026-06") == 0.0
    s = p.compute_payslip(1_200_000, CFG, factor=0.5)
    assert s["gross"] == 50_000 and s["basic"] == 20_000 and s["net"] == 50_000 - 2_400 - 5_000


def test_month_parsing():
    assert p.month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 2, 29))  # leap year
    for bad in ("2026-13", "2026-00", "26-01", "2026/01", "abcd-ef", "1999-01"):
        with pytest.raises(ValueError):
            p.month_bounds(bad)
