"""Authentication and role-based access control (standard library only).

- Passwords: salted scrypt hashes, compared in constant time.
- Sessions: a signed, expiring token (HMAC-SHA256) sent as `Authorization: Bearer ...`.
- Roles: hr (prepares payroll, edits data), owner (approves payroll), viewer (read-only).
Set SECRET_KEY in production; without it a random key is made per process, so restarting signs everyone out.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import ROLES
from app.database import get_db
from app.models import User

TOKEN_TTL_SECONDS = 12 * 3600
_SECRET = (os.getenv("SECRET_KEY") or secrets.token_hex(32)).encode()


@dataclass(frozen=True)
class Principal:
    email: str
    name: str
    role: str


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return hmac.compare_digest(digest, bytes.fromhex(digest_hex))
    except ValueError:
        return False


def _sign(payload: bytes) -> str:
    return base64.urlsafe_b64encode(hmac.new(_SECRET, payload, hashlib.sha256).digest()).decode().rstrip("=")


def make_token(user: User, now: float | None = None) -> str:
    body = json.dumps({"e": user.email, "exp": int((time.time() if now is None else now) + TOKEN_TTL_SECONDS)}).encode()
    return base64.urlsafe_b64encode(body).decode().rstrip("=") + "." + _sign(body)


def read_token(token: str, now: float | None = None) -> str | None:
    """The email inside a valid, unexpired token, else None."""
    try:
        body_b64, sig = token.split(".")
        body = base64.urlsafe_b64decode(body_b64 + "=" * (-len(body_b64) % 4))
        if not hmac.compare_digest(sig, _sign(body)):
            return None
        data = json.loads(body)
        return data["e"] if data["exp"] > (time.time() if now is None else now) else None
    except (ValueError, KeyError, TypeError):
        return None


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    # Always run one scrypt so "unknown email" and "wrong password" take the same time.
    stored = user.password_hash if user else hash_password("not-a-real-password")
    ok = verify_password(password, stored)
    return user if (user and ok) else None


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in to continue.")
    email = read_token(authorization[7:].strip())
    user = db.scalar(select(User).where(User.email == email)) if email else None
    if user is None:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    return Principal(email=user.email, name=user.name, role=user.role)


def require_roles(*roles: str):
    assert set(roles) <= set(ROLES)

    def dependency(user: Principal = Depends(current_user)) -> Principal:
        if user.role not in roles:
            raise HTTPException(403, "Your role is not allowed to do this.")
        return user

    return dependency


DEMO_USERS = [
    ("hr@acme.test", "Hana Rao", "hr"),
    ("owner@acme.test", "Omar Shah", "owner"),
    ("viewer@acme.test", "Vera Iyer", "viewer"),
]


def seed_demo_users(db: Session) -> None:
    """Create the three demo accounts when there are no users yet. DEMO_PASSWORD overrides the default."""
    if db.scalar(select(User.id).limit(1)) is not None:
        return
    password = os.getenv("DEMO_PASSWORD", "demo1234")
    for email, name, role in DEMO_USERS:
        db.add(User(email=email, name=name, role=role, password_hash=hash_password(password)))
    db.commit()
