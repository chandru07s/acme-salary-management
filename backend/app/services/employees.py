"""Employee use-cases. No HTTP concerns live here; routes translate errors."""
from dataclasses import dataclass

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import FX_TO_USD
from app.currency import currency_for_country
from app.models import Employee, SalaryHistory
from app.schemas import EmployeeCreate, EmployeeUpdate


class NotFoundError(Exception):
    pass


class DuplicateEmailError(Exception):
    pass


# Salary converted to USD *in SQL* so sorting across currencies is meaningful.


def _salary_usd_expr():
    """Built per query, not at import: FX rates can be edited at runtime on the Settings page."""
    return Employee.salary * case(dict(FX_TO_USD), value=Employee.currency, else_=0)

SORTABLE = {
    "id": Employee.id,
    "full_name": Employee.full_name,
    "country": Employee.country,
    "department": Employee.department,
    "job_title": Employee.job_title,
    "hire_date": Employee.hire_date,
}

MAX_PAGE_SIZE = 100


@dataclass
class EmployeeFilters:
    q: str | None = None
    country: str | None = None
    department: str | None = None
    job_title: str | None = None
    status: str | None = None


def _apply_filters(stmt: Select, f: EmployeeFilters) -> Select:
    if f.q:
        like = f"%{f.q.strip().lower()}%"
        stmt = stmt.where(
            or_(func.lower(Employee.full_name).like(like), func.lower(Employee.email).like(like))
        )
    if f.country:
        stmt = stmt.where(Employee.country == f.country)
    if f.department:
        stmt = stmt.where(Employee.department == f.department)
    if f.job_title:
        stmt = stmt.where(Employee.job_title == f.job_title)
    if f.status:
        stmt = stmt.where(Employee.status == f.status)
    return stmt


def _ordered(stmt: Select, sort_by: str, order: str) -> Select:
    col = _salary_usd_expr() if sort_by == "salary_usd" else SORTABLE.get(sort_by, Employee.id)
    primary = col.desc() if order == "desc" else col.asc()
    # Employee.id as a tiebreaker keeps pagination stable.
    return stmt.order_by(primary, Employee.id.asc())


def list_employees(
    db: Session,
    filters: EmployeeFilters,
    sort_by: str = "id",
    order: str = "asc",
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[Employee], int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    total = db.scalar(_apply_filters(select(func.count(Employee.id)), filters)) or 0
    stmt = _ordered(_apply_filters(select(Employee), filters), sort_by, order)
    items = db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)).all()
    return list(items), total


def all_employees(db: Session, filters: EmployeeFilters, sort_by="id", order="asc") -> list[Employee]:
    """Unpaginated, used by CSV export."""
    stmt = _ordered(_apply_filters(select(Employee), filters), sort_by, order)
    return list(db.scalars(stmt).all())


def get_employee(db: Session, employee_id: int) -> Employee:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise NotFoundError(f"Employee {employee_id} not found")
    return emp


def _email_taken(db: Session, email: str, exclude_id: int | None = None) -> bool:
    stmt = select(Employee.id).where(Employee.email == email)
    if exclude_id is not None:
        stmt = stmt.where(Employee.id != exclude_id)
    return db.scalar(stmt) is not None


def create_employee(db: Session, data: EmployeeCreate) -> Employee:
    if _email_taken(db, data.email):
        raise DuplicateEmailError(data.email)

    emp = Employee(
        full_name=data.full_name,
        email=data.email,
        country=data.country,
        currency=currency_for_country(data.country),
        department=data.department,
        job_title=data.job_title,
        salary=data.salary,
        hire_date=data.hire_date,
        status="active",
    )
    emp.history.append(SalaryHistory(old_salary=None, new_salary=data.salary, reason="Initial salary"))
    db.add(emp)
    try:
        db.commit()
    except IntegrityError:  # lost a race with a concurrent insert
        db.rollback()
        raise DuplicateEmailError(data.email) from None
    return emp


def update_employee(db: Session, employee_id: int, data: EmployeeUpdate) -> Employee:
    emp = get_employee(db, employee_id)
    changes = data.model_dump(exclude_unset=True, exclude={"reason", "salary"})

    if "email" in changes and changes["email"] is not None and _email_taken(db, changes["email"], employee_id):
        raise DuplicateEmailError(changes["email"])

    for field, value in changes.items():
        if value is not None:
            setattr(emp, field, value)

    # Currency always follows the country (and is re-derived if country changed).
    emp.currency = currency_for_country(emp.country)

    if data.salary is not None and data.salary != emp.salary:
        emp.history.append(
            SalaryHistory(old_salary=emp.salary, new_salary=data.salary, reason=data.reason)
        )
        emp.salary = data.salary

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateEmailError(str(changes.get("email"))) from None
    return emp


def deactivate_employee(db: Session, employee_id: int) -> Employee:
    """Soft delete: keeps history and keeps past insights explainable."""
    emp = get_employee(db, employee_id)
    emp.status = "terminated"
    db.commit()
    return emp


def salary_history(db: Session, employee_id: int) -> list[SalaryHistory]:
    """Newest change first. Queried explicitly: an already-loaded relationship
    collection keeps insertion order and would not honour its own order_by."""
    get_employee(db, employee_id)  # 404 if missing
    stmt = (
        select(SalaryHistory)
        .where(SalaryHistory.employee_id == employee_id)
        .order_by(SalaryHistory.id.desc())
    )
    return list(db.scalars(stmt).all())


def distinct_values(db: Session) -> dict[str, list[str]]:
    def col(c):
        return list(db.scalars(select(c).distinct().order_by(c)).all())

    return {
        "countries": col(Employee.country),
        "departments": col(Employee.department),
        "job_titles": col(Employee.job_title),
    }
