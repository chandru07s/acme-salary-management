import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import auth
from app.database import get_db
from app.main import create_app
from app.models import User


@pytest.fixture()
def real_client(db):
    """A client with NO auth override: requests need a real token."""
    db.query(User).delete()
    db.commit()
    auth.seed_demo_users(db)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def login(c, email="hr@acme.test", password="demo1234"):
    return c.post("/api/auth/login", json={"email": email, "password": password})


def test_password_hashes_are_salted_and_verify():
    a, b = auth.hash_password("secret"), auth.hash_password("secret")
    assert a != b and a.startswith("scrypt$")
    assert auth.verify_password("secret", a) and not auth.verify_password("Secret", a)
    assert not auth.verify_password("secret", "garbage")


def test_demo_users_are_seeded_once_with_hashed_passwords(db):
    db.query(User).delete()
    db.commit()
    auth.seed_demo_users(db)
    auth.seed_demo_users(db)
    users = db.scalars(select(User)).all()
    assert {u.role for u in users} == {"hr", "owner", "viewer"} and len(users) == 3
    assert all("demo1234" not in u.password_hash for u in users)


def test_login_and_me(real_client):
    r = login(real_client)
    assert r.status_code == 200 and r.json()["user"]["role"] == "hr"
    me = real_client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"})
    assert me.json() == {"email": "hr@acme.test", "name": "Hana Rao", "role": "hr"}


@pytest.mark.parametrize("email,password", [("hr@acme.test", "wrong"), ("nobody@acme.test", "demo1234"), ("", "")])
def test_bad_credentials_are_401_with_one_message(real_client, email, password):
    r = login(real_client, email, password)
    assert r.status_code == 401 and r.json()["detail"] == "Wrong email or password."


def test_login_is_case_insensitive_on_email(real_client):
    assert login(real_client, "HR@ACME.TEST").status_code == 200


@pytest.mark.parametrize("path", ["/api/employees", "/api/insights", "/api/dashboard", "/api/equity", "/api/meta",
                                  "/api/settings/fx", "/api/payroll/runs", "/api/agent/status", "/api/auth/me"])
def test_every_data_endpoint_needs_a_token(real_client, path):
    assert real_client.get(path).status_code == 401


def test_health_stays_public(real_client):
    assert real_client.get("/api/health").status_code == 200


def test_tampered_malformed_and_expired_tokens_are_rejected(real_client, db):
    user = db.scalar(select(User).where(User.email == "hr@acme.test"))
    good = auth.make_token(user)
    body, sig = good.split(".")
    for bad in (good + "x", body + ".AAAA", "nodot", "", body.replace(body[0], "Z") + "." + sig):
        r = real_client.get("/api/employees", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401, bad
    expired = auth.make_token(user, now=0)
    assert auth.read_token(expired) is None
    assert real_client.get("/api/employees", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    assert real_client.get("/api/employees", headers={"Authorization": f"Basic {good}"}).status_code == 401


def test_deleted_user_loses_access_immediately(real_client, db):
    token = login(real_client).json()["token"]
    db.query(User).filter(User.email == "hr@acme.test").delete()
    db.commit()
    assert real_client.get("/api/employees", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_viewer_token_cannot_write(real_client):
    token = login(real_client, "viewer@acme.test").json()["token"]
    r = real_client.post("/api/employees", json={}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
