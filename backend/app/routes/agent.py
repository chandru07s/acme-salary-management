import logging
import os
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agent import agent as agent_svc
from app.agent.rate_limit import RateLimiter
from app.database import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agent", tags=["agent"])

DEFAULT_MODEL = "gpt-4o-mini"


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class StepOut(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list]
    truncated: bool
    error: str | None


class AskResponse(BaseModel):
    answer: str
    answerable: bool
    assumptions: list[str]
    guardrail: str | None  # "input" / "output" when a guardrail produced the answer
    steps: list[StepOut]


@lru_cache(maxsize=1)
def _client_for(api_key: str) -> OpenAI:
    return OpenAI(api_key=api_key, timeout=30.0, max_retries=1)


def get_llm_client():
    """None when OPENAI_API_KEY is not set: the app still works, the agent is just disabled."""
    key = os.getenv("OPENAI_API_KEY")
    return _client_for(key) if key else None


_limiter = RateLimiter(max_calls=int(os.getenv("AGENT_MAX_REQUESTS_PER_HOUR", "60")), per_seconds=3600)


def get_limiter() -> RateLimiter:
    return _limiter


def get_model() -> str:
    return os.getenv("OPENAI_MODEL", DEFAULT_MODEL)


@router.get("/status")
def status(client=Depends(get_llm_client)):
    return {"enabled": client is not None}


@router.post("/ask", response_model=AskResponse)
def ask(
    payload: AskRequest,
    db: Session = Depends(get_db),
    client=Depends(get_llm_client),
    limiter: RateLimiter = Depends(get_limiter),
    model: str = Depends(get_model),
):
    if client is None:
        raise HTTPException(503, "The AI assistant is not configured. Set OPENAI_API_KEY on the server.")
    if not limiter.allow():
        raise HTTPException(429, "Too many questions right now. Try again later.")
    try:
        result = agent_svc.ask(client, db.get_bind(), payload.question, model)
    except OpenAIError:
        log.exception("OpenAI call failed")
        raise HTTPException(502, "The AI service returned an error. Check the API key, model name and quota.") from None
    return AskResponse(
        answer=result.answer,
        answerable=result.answerable,
        assumptions=result.assumptions,
        guardrail=result.guardrail,
        steps=[StepOut(**s.__dict__) for s in result.steps],
    )
