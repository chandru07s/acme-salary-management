"""Pure payroll maths (no I/O). All money is in the employee's local currency, rounded to 2 decimals.

Monthly pay for a full month:
    gross_fixed = annual salary / 12, split into
        Basic   = basic_pct % of gross_fixed
        HRA     = hra_pct_of_basic % of Basic
        Special = whatever is left (so the parts always add up to the gross exactly)
A hire month is prorated by days worked. Bonuses and incentives are taxable and added to gross;
reimbursements are paid on top and are not taxed.
    retirement = retirement_pct % of (prorated) Basic
    tax        = tax_pct % of gross
    net        = gross - retirement - tax + reimbursements
The rates are flat illustrative figures, not statutory rules.
"""
import calendar
from dataclasses import dataclass
from datetime import date

TAXABLE_KINDS = ("bonus", "incentive")
VARIABLE_KINDS = (*TAXABLE_KINDS, "reimbursement")


@dataclass(frozen=True)
class PayConfig:
    basic_pct: float
    hra_pct_of_basic: float
    retirement_pct: float
    tax_pct: float


def r2(x: float) -> float:
    return round(x + 1e-9, 2)


def month_bounds(month: str) -> tuple[date, date]:
    """First and last day of 'YYYY-MM'. Raises ValueError for anything else."""
    if len(month) != 7 or month[4] != "-":
        raise ValueError("month must look like 2026-03")
    year, mon = int(month[:4]), int(month[5:])
    if not (1 <= mon <= 12 and 2000 <= year <= 2100):
        raise ValueError("month must look like 2026-03")
    return date(year, mon, 1), date(year, mon, calendar.monthrange(year, mon)[1])


def proration(hire_date: date, month: str) -> float:
    """Share of the month worked. 1.0 unless the person joined during that month."""
    first, last = month_bounds(month)
    if hire_date <= first:
        return 1.0
    if hire_date > last:
        return 0.0
    days = (last - first).days + 1
    return round((last - hire_date).days + 1, 6) / days


def structure(annual_salary: float, cfg: PayConfig) -> dict:
    """Full-month components. `special` absorbs rounding so basic + hra + special == gross."""
    gross = r2(annual_salary / 12)
    basic = r2(gross * cfg.basic_pct / 100)
    hra = r2(basic * cfg.hra_pct_of_basic / 100)
    return {"gross": gross, "basic": basic, "hra": hra, "special": r2(gross - basic - hra)}


def compute_payslip(annual_salary: float, cfg: PayConfig, factor: float = 1.0,
                    taxable_variable: float = 0.0, reimbursement: float = 0.0) -> dict:
    full = structure(annual_salary, cfg)
    basic, hra = r2(full["basic"] * factor), r2(full["hra"] * factor)
    special = r2(full["gross"] * factor) - basic - hra
    special = r2(special)
    gross = r2(basic + hra + special + taxable_variable)
    retirement = r2(basic * cfg.retirement_pct / 100)
    tax = r2(gross * cfg.tax_pct / 100)
    return {
        "proration": round(factor, 6), "basic": basic, "hra": hra, "special": special,
        "variable": r2(taxable_variable), "gross": gross, "retirement": retirement, "tax": tax,
        "reimbursement": r2(reimbursement), "net": r2(gross - retirement - tax + reimbursement),
    }
