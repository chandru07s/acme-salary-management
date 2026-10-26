"""Deterministic seed data.

    python -m app.seed                 # 10,000 employees, RNG seed 42
    python -m app.seed --count 500 --reset

Same RNG seed => identical data, so demos and tests are reproducible. Uses bulk
inserts (executemany) so 10k employees load in about a second.
"""
import argparse
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.config import COUNTRY_CURRENCY, FX_TO_USD
from app.currency import currency_for_country
from app.database import SessionLocal, engine
from app.db_setup import init_db
from app.models import Employee, SalaryHistory

# Fixed "today" for the data set so output does not drift with the wall clock.
REFERENCE_DATE = date(2026, 10, 1)
EARLIEST_HIRE = date(2012, 1, 1)

# weight (relative headcount share) per country and a cost-of-labour factor vs US.
COUNTRIES = {
    "US": (30, 1.00), "IN": (25, 0.30), "GB": (10, 0.80), "DE": (10, 0.85),
    "CA": (7, 0.85), "AU": (6, 0.90), "SG": (6, 0.90), "JP": (6, 0.70),
}

# department -> (weight, [(job title, usd_min, usd_max), ...]) at US pay levels
DEPARTMENTS = {
    "Engineering": (35, [
        ("Software Engineer", 70_000, 130_000), ("Senior Software Engineer", 110_000, 180_000),
        ("Staff Engineer", 150_000, 230_000), ("QA Engineer", 55_000, 100_000),
        ("DevOps Engineer", 80_000, 140_000), ("Engineering Manager", 140_000, 220_000)]),
    "Sales": (15, [
        ("Sales Representative", 45_000, 90_000), ("Account Executive", 70_000, 140_000),
        ("Sales Manager", 100_000, 170_000)]),
    "Marketing": (8, [
        ("Marketing Specialist", 45_000, 85_000), ("Content Strategist", 50_000, 90_000),
        ("Marketing Manager", 85_000, 150_000)]),
    "Finance": (8, [
        ("Accountant", 50_000, 90_000), ("Financial Analyst", 60_000, 110_000),
        ("Finance Manager", 100_000, 170_000)]),
    "HR": (4, [
        ("HR Generalist", 45_000, 80_000), ("Recruiter", 45_000, 85_000), ("HR Manager", 80_000, 140_000)]),
    "Operations": (12, [
        ("Operations Analyst", 45_000, 85_000), ("Operations Manager", 85_000, 150_000),
        ("Logistics Coordinator", 35_000, 65_000)]),
    "Customer Support": (12, [("Support Agent", 30_000, 55_000), ("Support Lead", 50_000, 85_000)]),
    "Product": (6, [
        ("Product Manager", 100_000, 170_000), ("Product Designer", 70_000, 130_000),
        ("Data Analyst", 65_000, 115_000)]),
}

FIRST_NAMES = [
    "Aarav", "Priya", "Liam", "Olivia", "Noah", "Emma", "Wei", "Mei", "Hiroshi", "Yuki", "Sofia", "Lucas",
    "Amelia", "Arjun", "Ananya", "Mohammed", "Fatima", "Chloe", "Ethan", "Isabella", "Kenji", "Sakura",
    "Ravi", "Neha", "Oliver", "Charlotte", "Jack", "Grace", "Hans", "Greta", "Pierre", "Camille",
    "Daniel", "Sarah", "Rohan", "Kavya", "Tom", "Hannah", "Marcus", "Zoe",
]
LAST_NAMES = [
    "Sharma", "Patel", "Smith", "Johnson", "Brown", "Williams", "Chen", "Wang", "Tanaka", "Sato", "Garcia",
    "Müller", "Schmidt", "Kumar", "Singh", "Khan", "Ali", "Taylor", "Wilson", "Anderson", "Nakamura",
    "Suzuki", "Reddy", "Iyer", "Thomas", "Moore", "Martin", "Clark", "Weber", "Fischer", "Dubois", "Laurent",
    "Lee", "Walker", "Gupta", "Nair", "Evans", "Hughes", "Cooper", "Murphy",
]

# Round local-currency salaries to a "human" step so the data looks plausible.
ROUNDING = {"INR": 10_000, "JPY": 100_000, "USD": 1_000, "GBP": 1_000, "EUR": 1_000,
            "CAD": 1_000, "AUD": 1_000, "SGD": 1_000}


def _round_local(amount: float, currency: str) -> int:
    step = ROUNDING[currency]
    return max(step, int(round(amount / step)) * step)


def _ascii(s: str) -> str:
    return s.lower().replace("ü", "u").replace("ö", "o").replace("ä", "a")


def generate_rows(count: int, rng_seed: int = 42, start_id: int = 1) -> tuple[list[dict], list[dict]]:
    """Pure generator (no DB). Returns (employee rows, salary-history rows)."""
    rng = random.Random(rng_seed)

    country_codes = list(COUNTRIES)
    country_weights = [COUNTRIES[c][0] for c in country_codes]
    dept_names = list(DEPARTMENTS)
    dept_weights = [DEPARTMENTS[d][0] for d in dept_names]
    span_days = (REFERENCE_DATE - EARLIEST_HIRE).days

    employees: list[dict] = []
    history: list[dict] = []
    now = datetime(2026, 10, 1, tzinfo=timezone.utc)

    for i in range(count):
        emp_id = start_id + i
        country = rng.choices(country_codes, country_weights)[0]
        currency = currency_for_country(country)
        dept = rng.choices(dept_names, dept_weights)[0]
        title, lo, hi = rng.choice(DEPARTMENTS[dept][1])

        # Triangular distribution skewed toward the lower-middle of the band (realistic pay curve).
        usd = rng.triangular(lo, hi, lo + (hi - lo) * 0.35) * COUNTRIES[country][1]
        salary = _round_local(usd / FX_TO_USD[currency], currency)

        first, last = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
        hired = EARLIEST_HIRE + timedelta(days=rng.randrange(span_days))
        status = "terminated" if rng.random() < 0.04 else "active"

        employees.append({
            "id": emp_id,
            "full_name": f"{first} {last}",
            "email": f"{_ascii(first)}.{_ascii(last)}.{emp_id}@acme.com",
            "country": country,
            "currency": currency,
            "department": dept,
            "job_title": title,
            "salary": salary,
            "hire_date": hired,
            "status": status,
            "created_at": now,
            "updated_at": now,
        })

        hired_dt = datetime.combine(hired, datetime.min.time(), tzinfo=timezone.utc)
        # ~35% of people have had a raise: initial (lower) salary, then the current one.
        if rng.random() < 0.35 and (REFERENCE_DATE - hired).days > 400:
            initial = _round_local(salary / rng.uniform(1.06, 1.25), currency)
            raise_at = hired_dt + timedelta(days=rng.randrange(300, (REFERENCE_DATE - hired).days))
            history.append({"employee_id": emp_id, "old_salary": None, "new_salary": initial,
                            "reason": "Initial salary", "changed_at": hired_dt})
            history.append({"employee_id": emp_id, "old_salary": initial, "new_salary": salary,
                            "reason": rng.choice(["Annual review", "Promotion", "Market adjustment"]),
                            "changed_at": raise_at})
        else:
            history.append({"employee_id": emp_id, "old_salary": None, "new_salary": salary,
                            "reason": "Initial salary", "changed_at": hired_dt})
    return employees, history


def seed(db: Session, count: int = 10_000, rng_seed: int = 42, reset: bool = False) -> int:
    """Insert `count` employees. Returns how many were inserted."""
    if reset:
        db.execute(delete(SalaryHistory))
        db.execute(delete(Employee))
        db.commit()

    start_id = (db.scalar(select(func.max(Employee.id))) or 0) + 1
    employees, history = generate_rows(count, rng_seed, start_id)

    db.execute(insert(Employee), employees)
    db.execute(insert(SalaryHistory), history)
    db.commit()
    return len(employees)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the salary database")
    parser.add_argument("--count", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=42, help="RNG seed (same seed => same data)")
    parser.add_argument("--reset", action="store_true", help="delete existing employees first")
    args = parser.parse_args()

    init_db(engine)
    with SessionLocal() as db:
        n = seed(db, args.count, args.seed, args.reset)
    print(f"Seeded {n} employees across {len(COUNTRY_CURRENCY)} countries.")


if __name__ == "__main__":
    main()
