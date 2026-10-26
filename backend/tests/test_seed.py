from sqlalchemy import func, select

from app.config import COUNTRY_CURRENCY
from app.models import Employee, SalaryHistory
from app.seed import generate_rows, seed


def test_generation_is_deterministic():
    assert generate_rows(200, rng_seed=7) == generate_rows(200, rng_seed=7)


def test_different_rng_seed_gives_different_data():
    assert generate_rows(50, rng_seed=1)[0] != generate_rows(50, rng_seed=2)[0]


def test_rows_are_valid_and_consistent():
    employees, history = generate_rows(500)
    assert len(employees) == 500
    assert len({e["email"] for e in employees}) == 500, "emails must be unique"
    for e in employees:
        assert e["country"] in COUNTRY_CURRENCY
        assert e["currency"] == COUNTRY_CURRENCY[e["country"]]
        assert e["salary"] > 0
    assert {h["employee_id"] for h in history} == {e["id"] for e in employees}


def test_current_salary_matches_latest_history_entry():
    employees, history = generate_rows(300)
    latest = {}
    for h in history:  # rows are emitted in chronological order per employee
        latest[h["employee_id"]] = h["new_salary"]
    assert all(latest[e["id"]] == e["salary"] for e in employees)


def test_seed_inserts_into_database(db):
    assert seed(db, count=150) == 150
    assert db.scalar(select(func.count(Employee.id))) == 150
    assert db.scalar(select(func.count(SalaryHistory.id))) >= 150


def test_seed_appends_without_id_collisions(db):
    seed(db, count=20, rng_seed=1)
    seed(db, count=20, rng_seed=2)
    assert db.scalar(select(func.count(Employee.id))) == 40


def test_reset_replaces_existing_data(db):
    seed(db, count=30)
    seed(db, count=10, reset=True)
    assert db.scalar(select(func.count(Employee.id))) == 10
