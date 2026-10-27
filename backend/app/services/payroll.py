"""Payroll runs: build payslips, and move a run through draft -> pending approval -> approved.

Maker-checker: whoever prepares (hr) and whoever approves (owner) are different people. Even if one
account held both roles, `approve` refuses to let the person who created a run approve it.
Approved runs are frozen: no regeneration, no deletion.
"""
from collections import defaultdict
from datetime import date, datetime, timezone

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app import payroll as calc
from app.config import PAY_DEFAULTS, PAY_LIMITS
from app.currency import to_usd
from app.models import AppConfig, Employee, Payslip, PayrollEvent, PayrollRun, VariablePay
from app.services.employees import NotFoundError


class PayrollError(Exception):
    """A rule was broken (wrong state, duplicate month...). `status` is the HTTP code to use."""

    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


# ---- configuration -------------------------------------------------------------------------

def get_config(db: Session) -> calc.PayConfig:
    stored = {k.key: k.value for k in db.scalars(select(AppConfig))}
    return calc.PayConfig(**{k: stored.get(k, default) for k, default in PAY_DEFAULTS.items()})


def set_config(db: Session, values: dict[str, float]) -> calc.PayConfig:
    for key, value in values.items():
        lo, hi = PAY_LIMITS[key]
        if not (lo <= value <= hi):
            raise PayrollError(f"{key} must be between {lo:g} and {hi:g}", 422)
        row = db.get(AppConfig, key)
        if row:
            row.value = value
        else:
            db.add(AppConfig(key=key, value=value))
    db.commit()
    return get_config(db)


# ---- variable pay --------------------------------------------------------------------------

def add_variable_pay(db: Session, employee_id: int, kind: str, amount: int, month: str, note: str | None,
                     actor: str) -> VariablePay:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise NotFoundError(employee_id)
    if kind not in calc.VARIABLE_KINDS:
        raise PayrollError(f"kind must be one of {calc.VARIABLE_KINDS}", 422)
    try:
        calc.month_bounds(month)
    except ValueError as exc:
        raise PayrollError(str(exc), 422) from None
    if _run_for_month(db, month) is not None and _run_for_month(db, month).status != "draft":
        raise PayrollError(f"Payroll for {month} is already submitted or approved; it can't take new items.")
    item = VariablePay(employee_id=employee_id, kind=kind, amount=amount, month=month,
                       note=(note or "").strip() or None, created_by=actor)
    db.add(item)
    db.commit()
    return item


def delete_variable_pay(db: Session, item_id: int) -> None:
    item = db.get(VariablePay, item_id)
    if item is None:
        raise NotFoundError(item_id)
    run = _run_for_month(db, item.month)
    if run is not None and run.status != "draft":
        raise PayrollError(f"Payroll for {item.month} is already submitted or approved; this item is locked.")
    db.delete(item)
    db.commit()


def list_variable_pay(db: Session, employee_id: int) -> list[VariablePay]:
    if db.get(Employee, employee_id) is None:
        raise NotFoundError(employee_id)
    return list(db.scalars(
        select(VariablePay).where(VariablePay.employee_id == employee_id).order_by(VariablePay.month.desc(), VariablePay.id.desc())
    ))


# ---- runs ----------------------------------------------------------------------------------

def _run_for_month(db: Session, month: str) -> PayrollRun | None:
    return db.scalar(select(PayrollRun).where(PayrollRun.month == month))


def get_run(db: Session, run_id: int) -> PayrollRun:
    run = db.get(PayrollRun, run_id)
    if run is None:
        raise NotFoundError(run_id)
    return run


def _event(db: Session, run: PayrollRun, actor: str, action: str, note: str | None = None) -> None:
    db.add(PayrollEvent(run_id=run.id, actor=actor, action=action, note=note))


def _build_payslips(db: Session, run: PayrollRun) -> int:
    cfg = get_config(db)
    _, last = calc.month_bounds(run.month)
    variable: dict[int, dict[str, float]] = defaultdict(lambda: {"taxable": 0.0, "reimb": 0.0})
    for emp_id, kind, amount in db.execute(
        select(VariablePay.employee_id, VariablePay.kind, VariablePay.amount).where(VariablePay.month == run.month)
    ):
        variable[emp_id]["reimb" if kind == "reimbursement" else "taxable"] += amount

    rows = []
    for e in db.scalars(select(Employee).where(Employee.status == "active", Employee.hire_date <= last)):
        v = variable.get(e.id, {"taxable": 0.0, "reimb": 0.0})
        p = calc.compute_payslip(e.salary, cfg, calc.proration(e.hire_date, run.month), v["taxable"], v["reimb"])
        rate = to_usd(1, e.currency)
        rows.append({"run_id": run.id, "employee_id": e.id, "currency": e.currency, **p, "fx_to_usd": rate,
                     "gross_usd": round(p["gross"] * rate, 2), "net_usd": round(p["net"] * rate, 2),
                     "retirement_pct": cfg.retirement_pct, "tax_pct": cfg.tax_pct})
    if rows:
        db.execute(insert(Payslip), rows)
    return len(rows)


def create_run(db: Session, month: str, actor: str) -> PayrollRun:
    try:
        first, _ = calc.month_bounds(month)
    except ValueError as exc:
        raise PayrollError(str(exc), 422) from None
    if first > date.today().replace(day=1):
        raise PayrollError("You can't run payroll for a future month.", 422)
    if _run_for_month(db, month) is not None:
        raise PayrollError(f"A payroll run for {month} already exists.")
    run = PayrollRun(month=month, status="draft", created_by=actor)
    db.add(run)
    db.flush()
    count = _build_payslips(db, run)
    _event(db, run, actor, "created", f"{count} payslips generated")
    db.commit()
    return run


def _require_status(run: PayrollRun, *allowed: str) -> None:
    if run.status not in allowed:
        raise PayrollError(f"This run is {run.status.replace('_', ' ')}; that action needs {' or '.join(allowed).replace('_', ' ')}.")


def regenerate(db: Session, run_id: int, actor: str) -> PayrollRun:
    run = get_run(db, run_id)
    _require_status(run, "draft")
    db.execute(delete(Payslip).where(Payslip.run_id == run.id))
    count = _build_payslips(db, run)
    run.reject_note = None
    _event(db, run, actor, "regenerated", f"{count} payslips rebuilt from current data")
    db.commit()
    return run


def submit(db: Session, run_id: int, actor: str) -> PayrollRun:
    run = get_run(db, run_id)
    _require_status(run, "draft")
    if not db.scalar(select(func.count(Payslip.id)).where(Payslip.run_id == run.id)):
        raise PayrollError("This run has no payslips to approve.", 422)
    run.status = "pending_approval"
    run.reject_note = None
    _event(db, run, actor, "submitted")
    db.commit()
    return run


def approve(db: Session, run_id: int, actor: str) -> PayrollRun:
    run = get_run(db, run_id)
    _require_status(run, "pending_approval")
    if actor == run.created_by:
        raise PayrollError("Maker-checker: the person who prepared a run can't approve it.", 403)
    run.status = "approved"
    run.approved_by = actor
    run.approved_at = datetime.now(timezone.utc)
    _event(db, run, actor, "approved")
    db.commit()
    return run


def reject(db: Session, run_id: int, actor: str, note: str) -> PayrollRun:
    run = get_run(db, run_id)
    _require_status(run, "pending_approval")
    note = note.strip()
    if not note:
        raise PayrollError("Say why the run is being sent back.", 422)
    run.status = "draft"
    run.reject_note = note[:300]
    _event(db, run, actor, "rejected", note)
    db.commit()
    return run


def delete_run(db: Session, run_id: int, actor: str) -> None:
    run = get_run(db, run_id)
    _require_status(run, "draft")
    db.execute(delete(Payslip).where(Payslip.run_id == run.id))
    db.execute(delete(PayrollEvent).where(PayrollEvent.run_id == run.id))
    db.delete(run)
    db.commit()


# ---- reading -------------------------------------------------------------------------------

def run_summary(db: Session, run: PayrollRun) -> dict:
    n, gross, net = db.execute(
        select(func.count(Payslip.id), func.coalesce(func.sum(Payslip.gross_usd), 0), func.coalesce(func.sum(Payslip.net_usd), 0))
        .where(Payslip.run_id == run.id)
    ).one()
    return {
        "id": run.id, "month": run.month, "status": run.status, "created_by": run.created_by,
        "created_at": run.created_at.isoformat(), "approved_by": run.approved_by,
        "approved_at": run.approved_at.isoformat() if run.approved_at else None, "reject_note": run.reject_note,
        "headcount": n, "gross_usd": round(gross, 2), "net_usd": round(net, 2),
        "deductions_usd": round(gross - net, 2),
    }


def list_runs(db: Session) -> list[dict]:
    return [run_summary(db, r) for r in db.scalars(select(PayrollRun).order_by(PayrollRun.month.desc()))]


def events(db: Session, run_id: int) -> list[dict]:
    return [
        {"actor": e.actor, "action": e.action, "note": e.note, "at": e.at.isoformat()}
        for e in db.scalars(select(PayrollEvent).where(PayrollEvent.run_id == run_id).order_by(PayrollEvent.id.desc()))
    ]


def payslip_row(p: Payslip, e: Employee) -> dict:
    return {
        "id": p.id, "run_id": p.run_id, "employee_id": e.id, "full_name": e.full_name, "department": e.department,
        "job_title": e.job_title, "currency": p.currency, "proration": p.proration, "basic": p.basic, "hra": p.hra,
        "special": p.special, "variable": p.variable, "gross": p.gross, "retirement": p.retirement, "tax": p.tax,
        "reimbursement": p.reimbursement, "net": p.net, "net_usd": p.net_usd,
    }


def payslips_for_run(db: Session, run_id: int, q: str | None, page: int, page_size: int) -> dict:
    get_run(db, run_id)
    stmt = select(Payslip, Employee).join(Employee, Employee.id == Payslip.employee_id).where(Payslip.run_id == run_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Employee.full_name.ilike(like) | Employee.job_title.ilike(like) | Employee.department.ilike(like))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(Employee.full_name, Employee.id).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [payslip_row(p, e) for p, e in rows], "total": total, "page": page, "page_size": page_size}


def payslips_for_employee(db: Session, employee_id: int) -> list[dict]:
    if db.get(Employee, employee_id) is None:
        raise NotFoundError(employee_id)
    stmt = (
        select(Payslip, Employee, PayrollRun)
        .join(Employee, Employee.id == Payslip.employee_id)
        .join(PayrollRun, PayrollRun.id == Payslip.run_id)
        .where(Payslip.employee_id == employee_id)
        .order_by(PayrollRun.month.desc())
    )
    return [{**payslip_row(p, e), "month": r.month, "status": r.status} for p, e, r in db.execute(stmt)]
