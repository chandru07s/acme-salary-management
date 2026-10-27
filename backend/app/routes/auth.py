from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(max_length=160)
    password: str = Field(max_length=200)


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = auth.authenticate(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(401, "Wrong email or password.")
    return {"token": auth.make_token(user), "user": {"email": user.email, "name": user.name, "role": user.role}}


@router.get("/me")
def me(user: auth.Principal = Depends(auth.current_user)):
    return {"email": user.email, "name": user.name, "role": user.role}
