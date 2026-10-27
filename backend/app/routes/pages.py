"""Endpoints for the Dashboard, Pay equity, employee position and FX Settings pages."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import require_roles
from app.config import COUNTRY_CURRENCY, COUNTRY_NAMES, DEFAULT_FX_TO_USD, FX_TO_USD
from app.database import get_db
from app.services import dashboard as dashboard_svc
from app.services import employees as emp_svc
from app.services import equity as equity_svc

router = APIRouter(prefix="/api", tags=["pages"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return dashboard_svc.overview(db)


@router.get("/equity")
def equity(
    band: Literal["below", "within", "above"] | None = None,
    country: str | None = None,
    department: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return equity_svc.report(db, band, country, department, page, page_size)


@router.get("/employees/{employee_id}/position")
def position(employee_id: int, db: Session = Depends(get_db)):
    return equity_svc.position(db, emp_svc.get_employee(db, employee_id))


class FxUpdate(BaseModel):
    to_usd: float = Field(gt=0, le=1000, description="USD value of one unit of the currency")


def _fx_list() -> list[dict]:
    countries: dict[str, list[str]] = {}
    for code, cur in COUNTRY_CURRENCY.items():
        countries.setdefault(cur, []).append(COUNTRY_NAMES[code])
    return [
        {"currency": c, "to_usd": FX_TO_USD[c], "default": DEFAULT_FX_TO_USD[c],
         "countries": countries.get(c, []), "editable": c != "USD"}
        for c in sorted(FX_TO_USD, key=lambda c: (c != "USD", c))
    ]


@router.get("/settings/fx")
def get_fx():
    return _fx_list()


@router.put("/settings/fx/{currency}", dependencies=[Depends(require_roles("hr"))])
def put_fx(currency: str, payload: FxUpdate, db: Session = Depends(get_db)):
    currency = currency.upper()
    if currency not in FX_TO_USD:
        raise HTTPException(404, f"Unknown currency {currency}")
    if currency == "USD":
        raise HTTPException(422, "USD is the reporting currency and is always 1.0")
    db.execute(text("UPDATE fx_rates SET to_usd = :r WHERE currency = :c"), {"r": payload.to_usd, "c": currency})
    db.commit()
    FX_TO_USD[currency] = payload.to_usd
    return _fx_list()


@router.post("/settings/fx/reset", dependencies=[Depends(require_roles("hr"))])
def reset_fx(db: Session = Depends(get_db)):
    for currency, rate in DEFAULT_FX_TO_USD.items():
        db.execute(text("UPDATE fx_rates SET to_usd = :r WHERE currency = :c"), {"r": rate, "c": currency})
    db.commit()
    FX_TO_USD.update(DEFAULT_FX_TO_USD)
    return _fx_list()
