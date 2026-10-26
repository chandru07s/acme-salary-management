import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import COUNTRY_CURRENCY
from app.currency import to_usd

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
STATUSES = ("active", "terminated")


def _clean_text(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("must not be blank")
    return v


def _check_country(v: str) -> str:
    v = v.strip().upper()
    if v not in COUNTRY_CURRENCY:
        raise ValueError(f"unsupported country; choose one of {sorted(COUNTRY_CURRENCY)}")
    return v


def _check_email(v: str) -> str:
    v = v.strip().lower()
    if not EMAIL_RE.match(v):
        raise ValueError("invalid email address")
    return v


def _check_hire_date(v: date) -> date:
    if v > date.today():
        raise ValueError("hire_date cannot be in the future")
    return v


def _check_status(v: str) -> str:
    if v not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}")
    return v


class EmployeeCreate(BaseModel):
    full_name: str = Field(max_length=120)
    email: str = Field(max_length=160)
    country: str
    department: str = Field(max_length=60)
    job_title: str = Field(max_length=80)
    salary: int = Field(gt=0, le=1_000_000_000, description="Annual, in local currency")
    hire_date: date

    _name = field_validator("full_name", "department", "job_title")(_clean_text)
    _email = field_validator("email")(_check_email)
    _country = field_validator("country")(_check_country)
    _hire = field_validator("hire_date")(_check_hire_date)


class EmployeeUpdate(BaseModel):
    """Partial update. Changing `salary` writes a salary-history row."""

    full_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=160)
    country: str | None = None
    department: str | None = Field(default=None, max_length=60)
    job_title: str | None = Field(default=None, max_length=80)
    salary: int | None = Field(default=None, gt=0, le=1_000_000_000)
    hire_date: date | None = None
    status: str | None = None
    reason: str | None = Field(default=None, max_length=200, description="Why the salary changed")

    @field_validator("full_name", "department", "job_title")
    @classmethod
    def _name(cls, v):
        return None if v is None else _clean_text(v)

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        return None if v is None else _check_email(v)

    @field_validator("country")
    @classmethod
    def _country(cls, v):
        return None if v is None else _check_country(v)

    @field_validator("hire_date")
    @classmethod
    def _hire(cls, v):
        return None if v is None else _check_hire_date(v)

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        return None if v is None else _check_status(v)


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    country: str
    currency: str
    department: str
    job_title: str
    salary: int
    salary_usd: float = 0.0
    hire_date: date
    status: str

    @classmethod
    def from_employee(cls, e) -> "EmployeeOut":
        out = cls.model_validate(e)
        out.salary_usd = to_usd(e.salary, e.currency)
        return out


class EmployeePage(BaseModel):
    items: list[EmployeeOut]
    total: int
    page: int
    page_size: int


class SalaryHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    old_salary: int | None
    new_salary: int
    reason: str | None
    changed_at: datetime
