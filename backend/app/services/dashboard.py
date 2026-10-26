"""Home-page numbers: headline stats, who joined, who got a raise, and who needs a look."""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import COUNTRY_NAMES
from app.models import Employee, SalaryHistory
from app.services import equity, insights

RECENT = 6


def overview(db: Session) -> dict:
    rows = insights.load_rows(db)
    year_ago = date.today() - timedelta(days=365)

    hires = db.scalar(
        select(func.count(Employee.id)).where(Employee.status == "active", Employee.hire_date >= year_ago)
    )
    recent_hires = [
        {"id": e.id, "full_name": e.full_name, "job_title": e.job_title, "department": e.department,
         "country_name": COUNTRY_NAMES[e.country], "hire_date": e.hire_date.isoformat()}
        for e in db.scalars(
            select(Employee).where(Employee.status == "active").order_by(Employee.hire_date.desc(), Employee.id.desc()).limit(RECENT)
        )
    ]

    # Real changes only: the "Initial salary" row has no old_salary.
    changes_stmt = (
        select(SalaryHistory, Employee)
        .join(Employee, Employee.id == SalaryHistory.employee_id)
        .where(SalaryHistory.old_salary.is_not(None))
        .order_by(SalaryHistory.id.desc())
        .limit(RECENT)
    )
    recent_changes = [
        {"employee_id": e.id, "full_name": e.full_name, "currency": e.currency, "old_salary": h.old_salary,
         "new_salary": h.new_salary, "change_pct": round((h.new_salary - h.old_salary) / h.old_salary * 100, 1),
         "reason": h.reason, "changed_at": h.changed_at.isoformat()}
        for h, e in db.execute(changes_stmt)
    ]

    eq = equity.report(db, page_size=1)
    return {
        "summary": insights.summary(rows),
        "hires_last_12_months": hires or 0,
        "headcount_by_country": [
            {"country": g["key"], "name": COUNTRY_NAMES[g["key"]], "headcount": g["headcount"]}
            for g in sorted(insights.group_stats(rows, "country"), key=lambda g: -g["headcount"])
        ],
        "recent_hires": recent_hires,
        "recent_changes": recent_changes,
        "equity": {"below": eq["summary"]["below"], "below_pct": eq["summary"]["below_pct"],
                   "rated": eq["summary"]["rated"], "below_by_department": eq["below_by_department"][:3]},
    }
