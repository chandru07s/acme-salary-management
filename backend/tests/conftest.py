"""Shared fixtures: every test gets a fresh in-memory SQLite DB (fast + isolated)."""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import Principal, current_user
from app.database import get_db
from app.db_setup import init_db
from app.main import create_app
from app.schemas import EmployeeCreate
from app.services import employees as svc


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    init_db(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    # Most tests are about behaviour, not sign-in: act as an HR user. test_auth.py exercises real login.
    app.dependency_overrides[current_user] = lambda: Principal("hr@acme.test", "Hana Rao", "hr")
    return TestClient(app)


@pytest.fixture()
def act_as(client):
    """Switch the signed-in role mid-test: act_as("owner")."""

    def _switch(role: str, email: str | None = None):
        client.app.dependency_overrides[current_user] = lambda: Principal(email or f"{role}@acme.test", role.title(), role)

    return _switch


def make_payload(**overrides) -> dict:
    payload = {
        "full_name": "Ada Lovelace",
        "email": "ada@acme.com",
        "country": "GB",
        "department": "Engineering",
        "job_title": "Software Engineer",
        "salary": 100_000,
        "hire_date": "2020-01-15",
    }
    payload.update(overrides)
    return payload


@pytest.fixture()
def add(db):
    """Create an employee through the service layer; returns the ORM object."""
    counter = {"n": 0}

    def _add(**overrides):
        counter["n"] += 1
        data = make_payload(email=f"user{counter['n']}@acme.com", **overrides)
        data["hire_date"] = date.fromisoformat(data["hire_date"])
        return svc.create_employee(db, EmployeeCreate(**data))

    return _add
