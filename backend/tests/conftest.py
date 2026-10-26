"""Shared fixtures: every test gets a fresh in-memory SQLite DB (fast + isolated)."""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import create_app
from app.schemas import EmployeeCreate
from app.services import employees as svc


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


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
