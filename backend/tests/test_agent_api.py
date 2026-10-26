import pytest
from openai import OpenAIError

from app.agent.rate_limit import RateLimiter
from app.routes import agent as agent_route
from tests.fakes import FakeClient, reply, tool_call
from tests.conftest import make_payload


@pytest.fixture()
def use_client(client):
    """Install a fake LLM client (or None) and a roomy rate limiter on the app."""

    def _use(llm, limiter=None):
        app = client.app
        app.dependency_overrides[agent_route.get_llm_client] = lambda: llm
        app.dependency_overrides[agent_route.get_limiter] = lambda: limiter or RateLimiter(100, 60)
        return client

    return _use


def test_status_reports_disabled_without_a_key(use_client):
    assert use_client(None).get("/api/agent/status").json() == {"enabled": False}


def test_status_reports_enabled_with_a_client(use_client):
    assert use_client(FakeClient([])).get("/api/agent/status").json() == {"enabled": True}


def test_ask_without_a_key_is_503_with_a_clear_message(use_client):
    r = use_client(None).post("/api/agent/ask", json={"question": "How much do we pay?"})
    assert r.status_code == 503
    assert "OPENAI_API_KEY" in r.json()["detail"]


def test_ask_returns_answer_and_the_sql_it_ran(use_client):
    c = use_client(FakeClient([
        reply(calls=[tool_call("c1", "SELECT COUNT(*) AS n FROM employee_pay")]),
        reply("You have 1 employee."),
    ]))
    c.post("/api/employees", json=make_payload())

    body = c.post("/api/agent/ask", json={"question": "How many employees?"}).json()

    assert body["answer"] == "You have 1 employee."
    step = body["steps"][0]
    assert step["sql"] == "SELECT COUNT(*) AS n FROM employee_pay"
    assert step["columns"] == ["n"] and step["rows"] == [[1]] and step["error"] is None


def test_rejects_too_short_or_too_long_questions(use_client):
    c = use_client(FakeClient([]))
    assert c.post("/api/agent/ask", json={"question": "hi"}).status_code == 422
    assert c.post("/api/agent/ask", json={"question": "x" * 501}).status_code == 422


def test_rate_limit_returns_429(use_client):
    c = use_client(FakeClient([reply("one"), reply("two")]), RateLimiter(1, 60))
    assert c.post("/api/agent/ask", json={"question": "first question"}).status_code == 200
    assert c.post("/api/agent/ask", json={"question": "second question"}).status_code == 429


def test_upstream_failure_is_502_without_leaking_details(use_client):
    class Exploding:
        class chat:  # noqa: N801
            class completions:  # noqa: N801
                @staticmethod
                def create(**_):
                    raise OpenAIError("sk-secret-key rejected")

    r = use_client(Exploding()).post("/api/agent/ask", json={"question": "How much do we pay?"})
    assert r.status_code == 502
    assert "sk-secret" not in r.text
