"""Database initialisation: tables, FX reference data and the `employee_pay` SQL view.

`employee_pay` is the single, privacy-trimmed surface the AI agent may query: it exposes pay
facts in USD but not emails. Everything else (employees, salary_history) is off limits to it.
"""
from sqlalchemy import text

import app.models  # noqa: F401  (registers tables on Base.metadata)
from app.config import FX_TO_USD
from app.database import Base

EMPLOYEE_PAY_VIEW = """
CREATE VIEW IF NOT EXISTS employee_pay AS
SELECT e.id,
       e.full_name,
       e.country,
       e.department,
       e.job_title,
       e.hire_date,
       e.status,
       e.currency,
       e.salary                       AS salary_local,
       ROUND(e.salary * r.to_usd, 2)  AS salary_usd
FROM employees e
JOIN fx_rates r ON r.currency = e.currency
"""

UPSERT_RATE = text(
    "INSERT INTO fx_rates (currency, to_usd) VALUES (:currency, :to_usd) "
    "ON CONFLICT(currency) DO UPDATE SET to_usd = excluded.to_usd"
)


def init_db(engine) -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for currency, rate in FX_TO_USD.items():
            conn.execute(UPSERT_RATE, {"currency": currency, "to_usd": rate})
        conn.exec_driver_sql(EMPLOYEE_PAY_VIEW)
