import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import COUNTRY_CURRENCY, COUNTRY_NAMES
from app.auth import require_roles
from app.currency import to_usd
from app.database import get_db
from app.schemas import (
    EmployeeCreate,
    EmployeeOut,
    EmployeePage,
    EmployeeUpdate,
    SalaryHistoryOut,
)
from app.services import employees as svc
from app.services.employees import EmployeeFilters

router = APIRouter(prefix="/api", tags=["employees"])

CSV_CHUNK_ROWS = 1000

SortField = Literal["id", "full_name", "country", "department", "job_title", "hire_date", "salary_usd"]


def filters_dep(
    q: str | None = None,
    country: str | None = None,
    department: str | None = None,
    job_title: str | None = None,
    status: Literal["active", "terminated"] | None = None,
) -> EmployeeFilters:
    return EmployeeFilters(q=q, country=country, department=department, job_title=job_title, status=status)


@router.get("/employees", response_model=EmployeePage)
def list_employees(
    filters: EmployeeFilters = Depends(filters_dep),
    sort_by: SortField = "id",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=svc.MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
):
    items, total = svc.list_employees(db, filters, sort_by, order, page, page_size)
    return EmployeePage(
        items=[EmployeeOut.from_employee(e) for e in items], total=total, page=page, page_size=page_size
    )


# Declared before /employees/{id} so "export.csv" is not parsed as an id.
@router.get("/employees/export.csv")
def export_csv(
    filters: EmployeeFilters = Depends(filters_dep),
    sort_by: SortField = "id",
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
):
    rows = svc.all_employees(db, filters, sort_by, order)  # materialised: session closes before streaming

    def generate():
        # Yield in chunks: one yield per row costs far more in ASGI overhead than the CSV work itself.
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["id", "full_name", "email", "country", "department", "job_title",
             "currency", "salary", "salary_usd", "hire_date", "status"]
        )
        for i, e in enumerate(rows, start=1):
            writer.writerow([e.id, e.full_name, e.email, e.country, e.department, e.job_title,
                             e.currency, e.salary, to_usd(e.salary, e.currency), e.hire_date.isoformat(), e.status])
            if i % CSV_CHUNK_ROWS == 0:
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate()
        yield buf.getvalue()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="employees.csv"'},
    )


@router.get("/employees/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    return EmployeeOut.from_employee(svc.get_employee(db, employee_id))


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles("hr"))])
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    return EmployeeOut.from_employee(svc.create_employee(db, payload))


@router.patch("/employees/{employee_id}", response_model=EmployeeOut, dependencies=[Depends(require_roles("hr"))])
def update_employee(employee_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    return EmployeeOut.from_employee(svc.update_employee(db, employee_id, payload))


@router.delete("/employees/{employee_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_roles("hr"))])
def deactivate_employee(employee_id: int, db: Session = Depends(get_db)):
    """Soft delete – marks the employee as terminated."""
    svc.deactivate_employee(db, employee_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/employees/{employee_id}/history", response_model=list[SalaryHistoryOut])
def salary_history(employee_id: int, db: Session = Depends(get_db)):
    return svc.salary_history(db, employee_id)


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    """Values used to populate filter dropdowns and form selects."""
    values = svc.distinct_values(db)
    values["countries"] = [
        {"code": c, "name": COUNTRY_NAMES[c], "currency": COUNTRY_CURRENCY[c]} for c in COUNTRY_CURRENCY
    ]
    return values
