from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), index=True)
    email: Mapped[str] = mapped_column(String(160), unique=True)
    country: Mapped[str] = mapped_column(String(2), index=True)
    currency: Mapped[str] = mapped_column(String(3))
    department: Mapped[str] = mapped_column(String(60), index=True)
    job_title: Mapped[str] = mapped_column(String(80), index=True)
    # Annual base salary in whole units of `currency` (integers avoid float drift).
    salary: Mapped[int] = mapped_column(Integer)
    hire_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(12), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    history: Mapped[list["SalaryHistory"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan", order_by="SalaryHistory.id.desc()"
    )


class SalaryHistory(Base):
    __tablename__ = "salary_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    old_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_salary: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    employee: Mapped[Employee] = relationship(back_populates="history")


class FxRate(Base):
    """Reference rates (local currency -> USD). Seeded from app.config on startup."""

    __tablename__ = "fx_rates"

    currency: Mapped[str] = mapped_column(String(3), primary_key=True)
    to_usd: Mapped[float] = mapped_column(Float)


class User(Base):
    """A person who can sign in. Passwords are stored only as salted scrypt hashes."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(12))  # hr | owner | viewer
    password_hash: Mapped[str] = mapped_column(String(200))


class AppConfig(Base):
    """Small key/value table for editable settings (pay structure and deduction rates)."""

    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[float] = mapped_column(Float)


class VariablePay(Base):
    __tablename__ = "variable_pay"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    kind: Mapped[str] = mapped_column(String(14))  # bonus | incentive | reimbursement
    amount: Mapped[int] = mapped_column(Integer)  # whole units of the employee's currency
    month: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM it is paid in
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_by: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    month: Mapped[str] = mapped_column(String(7), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft | pending_approval | approved
    created_by: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_note: Mapped[str | None] = mapped_column(String(300), nullable=True)


class Payslip(Base):
    """A frozen snapshot: later edits to salary, config or FX never change a generated payslip."""

    __tablename__ = "payslips"
    __table_args__ = (UniqueConstraint("run_id", "employee_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    currency: Mapped[str] = mapped_column(String(3))
    proration: Mapped[float] = mapped_column(Float, default=1.0)
    basic: Mapped[float] = mapped_column(Float)
    hra: Mapped[float] = mapped_column(Float)
    special: Mapped[float] = mapped_column(Float)
    variable: Mapped[float] = mapped_column(Float, default=0.0)  # taxable bonuses and incentives
    gross: Mapped[float] = mapped_column(Float)
    retirement: Mapped[float] = mapped_column(Float)
    tax: Mapped[float] = mapped_column(Float)
    reimbursement: Mapped[float] = mapped_column(Float, default=0.0)  # paid on top, not taxed
    net: Mapped[float] = mapped_column(Float)
    fx_to_usd: Mapped[float] = mapped_column(Float)
    gross_usd: Mapped[float] = mapped_column(Float)
    net_usd: Mapped[float] = mapped_column(Float)
    retirement_pct: Mapped[float] = mapped_column(Float)
    tax_pct: Mapped[float] = mapped_column(Float)


class PayrollEvent(Base):
    """Audit trail of who did what to a run."""

    __tablename__ = "payroll_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id"), index=True)
    actor: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(24))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
