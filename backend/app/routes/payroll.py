"""Pay structure, variable pay, payroll runs (with maker-checker) and payslip PDFs."""
import re

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import payroll as calc
from app.auth import Principal, current_user, require_roles
from app.config import PAY_LIMITS
from app.database import get_db
from app.models import Employee, Payslip, PayrollRun
from app.pdf import render_payslip
from app.services import employees as emp_svc
from app.services import payroll as svc
from app.services.employees import NotFoundError

router = APIRouter(prefix="/api", tags=["payroll"])

HR = Depends(require_roles("hr"))
OWNER = Depends(require_roles("owner"))
# Payroll amounts are more sensitive than the directory, so viewers can't see them.
PAYROLL_READERS = Depends(require_roles("hr", "owner"))


class PayConfigIn(BaseModel):
    basic_pct: float | None = Field(default=None, ge=0, le=100)
    hra_pct_of_basic: float | None = Field(default=None, ge=0, le=100)
    retirement_pct: float | None = Field(default=None, ge=0, le=100)
    tax_pct: float | None = Field(default=None, ge=0, le=100)


def _config_out(cfg: calc.PayConfig) -> dict:
    return {**cfg.__dict__, "limits": {k: list(v) for k, v in PAY_LIMITS.items()}}


@router.get("/settings/pay-config")
def get_pay_config(db: Session = Depends(get_db)):
    return _config_out(svc.get_config(db))


@router.put("/settings/pay-config", dependencies=[HR])
def put_pay_config(payload: PayConfigIn, db: Session = Depends(get_db)):
    return _config_out(svc.set_config(db, payload.model_dump(exclude_none=True)))


@router.get("/employees/{employee_id}/structure")
def structure(employee_id: int, db: Session = Depends(get_db)):
    e = emp_svc.get_employee(db, employee_id)
    cfg = svc.get_config(db)
    monthly = calc.structure(e.salary, cfg)
    return {"currency": e.currency, "monthly": monthly, "annual": {k: round(v * 12, 2) for k, v in monthly.items()},
            "config": cfg.__dict__}


# ---- variable pay --------------------------------------------------------------------------

class VariablePayIn(BaseModel):
    kind: str
    amount: int = Field(gt=0, le=1_000_000_000)
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    note: str | None = Field(default=None, max_length=200)


def _vp_out(v) -> dict:
    return {"id": v.id, "kind": v.kind, "amount": v.amount, "month": v.month, "note": v.note,
            "created_by": v.created_by, "created_at": v.created_at.isoformat()}


@router.get("/employees/{employee_id}/variable-pay", dependencies=[PAYROLL_READERS])
def list_variable_pay(employee_id: int, db: Session = Depends(get_db)):
    return [_vp_out(v) for v in svc.list_variable_pay(db, employee_id)]


@router.post("/employees/{employee_id}/variable-pay", status_code=201)
def add_variable_pay(employee_id: int, payload: VariablePayIn, user: Principal = Depends(require_roles("hr")),
                     db: Session = Depends(get_db)):
    return _vp_out(svc.add_variable_pay(db, employee_id, payload.kind, payload.amount, payload.month, payload.note, user.email))


@router.delete("/variable-pay/{item_id}", status_code=204, dependencies=[HR])
def delete_variable_pay(item_id: int, db: Session = Depends(get_db)):
    svc.delete_variable_pay(db, item_id)
    return Response(status_code=204)


# ---- runs ----------------------------------------------------------------------------------

class RunIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")


class RejectIn(BaseModel):
    note: str = Field(min_length=1, max_length=300)


@router.get("/payroll/runs", dependencies=[PAYROLL_READERS])
def list_runs(db: Session = Depends(get_db)):
    return svc.list_runs(db)


@router.post("/payroll/runs", status_code=201)
def create_run(payload: RunIn, user: Principal = Depends(require_roles("hr")), db: Session = Depends(get_db)):
    return svc.run_summary(db, svc.create_run(db, payload.month, user.email))


@router.get("/payroll/runs/{run_id}", dependencies=[PAYROLL_READERS])
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = svc.get_run(db, run_id)
    return {**svc.run_summary(db, run), "events": svc.events(db, run_id)}


@router.get("/payroll/runs/{run_id}/payslips", dependencies=[PAYROLL_READERS])
def run_payslips(run_id: int, q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                 db: Session = Depends(get_db)):
    return svc.payslips_for_run(db, run_id, q, page, page_size)


def _transition(name: str):
    def handler(run_id: int, user: Principal = Depends(require_roles("hr")), db: Session = Depends(get_db)):
        return svc.run_summary(db, getattr(svc, name)(db, run_id, user.email))

    return handler


router.add_api_route("/payroll/runs/{run_id}/regenerate", _transition("regenerate"), methods=["POST"])
router.add_api_route("/payroll/runs/{run_id}/submit", _transition("submit"), methods=["POST"])


@router.post("/payroll/runs/{run_id}/approve")
def approve_run(run_id: int, user: Principal = Depends(require_roles("owner")), db: Session = Depends(get_db)):
    return svc.run_summary(db, svc.approve(db, run_id, user.email))


@router.post("/payroll/runs/{run_id}/reject")
def reject_run(run_id: int, payload: RejectIn, user: Principal = Depends(require_roles("owner")), db: Session = Depends(get_db)):
    return svc.run_summary(db, svc.reject(db, run_id, user.email, payload.note))


@router.delete("/payroll/runs/{run_id}", status_code=204)
def delete_run(run_id: int, user: Principal = Depends(require_roles("hr")), db: Session = Depends(get_db)):
    svc.delete_run(db, run_id, user.email)
    return Response(status_code=204)


# ---- payslips ------------------------------------------------------------------------------

@router.get("/employees/{employee_id}/payslips", dependencies=[PAYROLL_READERS])
def employee_payslips(employee_id: int, db: Session = Depends(get_db)):
    return svc.payslips_for_employee(db, employee_id)


@router.get("/payslips/{payslip_id}/pdf", dependencies=[PAYROLL_READERS])
def payslip_pdf(payslip_id: int, db: Session = Depends(get_db)):
    p = db.get(Payslip, payslip_id)
    if p is None:
        raise NotFoundError(payslip_id)
    e, run = db.get(Employee, p.employee_id), db.get(PayrollRun, p.run_id)
    name = re.sub(r"[^A-Za-z0-9]+", "-", e.full_name).strip("-")
    return Response(render_payslip(p, e, run), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="payslip-{run.month}-{name}.pdf"'})
