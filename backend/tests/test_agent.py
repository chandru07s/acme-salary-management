import json

from app.agent import agent
from app.agent.rate_limit import RateLimiter
from tests.fakes import FakeClient, reply, tool_call


def ask(db, client, question="How much do we pay?", **kw):
    return agent.ask(client, db.get_bind(), question, model="test-model", **kw)


def test_answers_directly_without_tools(db):
    client = FakeClient([reply("We have no data yet.")])
    result = ask(db, client)
    assert result.answer == "We have no data yet."
    assert result.steps == []


def test_runs_sql_then_answers_from_the_result(db, add):
    add(country="GB", salary=100_000)
    client = FakeClient([
        reply(calls=[tool_call("c1", "SELECT AVG(salary_usd) AS avg_usd FROM employee_pay")]),
        reply("The average salary is about $127,000."),
    ])

    result = ask(db, client)

    assert result.answer == "The average salary is about $127,000."
    assert len(result.steps) == 1
    assert result.steps[0].rows == [[127_000.0]]
    # the model was shown the real query result, not something invented
    assert client.last_tool_result()["rows"] == [[127_000.0]]


def test_model_sees_system_prompt_tools_and_question(db):
    client = FakeClient([reply("ok")])
    ask(db, client, question="Who earns most?")
    request = client.requests[0]
    assert request["model"] == "test-model"
    assert request["messages"][0]["role"] == "system" and "employee_pay" in request["messages"][0]["content"]
    assert request["messages"][1] == {"role": "user", "content": "Who earns most?"}
    assert request["tools"][0]["function"]["name"] == "run_sql"


def test_sql_error_is_fed_back_so_the_model_can_retry(db, add):
    add(country="US", salary=90_000)
    client = FakeClient([
        reply(calls=[tool_call("c1", "SELECT email FROM employees")]),
        reply(calls=[tool_call("c2", "SELECT COUNT(*) FROM employee_pay")]),
        reply("There is 1 employee."),
    ])

    result = ask(db, client)

    assert result.steps[0].error is not None and result.steps[0].rows == []
    assert result.steps[1].error is None and result.steps[1].rows == [[1]]
    assert result.answer == "There is 1 employee."


def test_stops_after_max_steps(db):
    client = FakeClient([reply(calls=[tool_call(f"c{i}", "SELECT 1")]) for i in range(3)])
    result = ask(db, client, max_steps=3)
    assert result.answer == agent.GIVE_UP
    assert len(result.steps) == 3


def test_malformed_tool_arguments_do_not_crash(db):
    client = FakeClient([
        reply(calls=[tool_call("c1", "", raw_arguments="{not json")]),
        reply("Sorry, let me stop."),
    ])
    result = ask(db, client)
    assert result.steps[0].error and "JSON" in result.steps[0].error


def test_unknown_tool_is_reported_not_executed(db):
    client = FakeClient([reply(calls=[tool_call("c1", "x", name="delete_everything")]), reply("done")])
    result = ask(db, client)
    assert "Unknown tool" in result.steps[0].error


def test_agent_cannot_be_talked_into_writing(db, add):
    emp = add(salary=100_000)
    client = FakeClient([
        reply(calls=[tool_call("c1", "WITH x AS (SELECT 1) UPDATE fx_rates SET to_usd = 99")]),
        reply("I could not do that."),
    ])
    ask(db, client)
    from sqlalchemy import text
    assert db.execute(text("SELECT to_usd FROM fx_rates WHERE currency='GBP'")).scalar() == 1.27
    assert emp.salary == 100_000


def test_tool_results_are_json_the_model_can_parse(db, add):
    add()
    client = FakeClient([reply(calls=[tool_call("c1", "SELECT hire_date FROM employee_pay")]), reply("ok")])
    ask(db, client)
    parsed = client.last_tool_result()
    assert parsed["columns"] == ["hire_date"] and parsed["row_count"] == 1
    json.dumps(parsed)


class TestRateLimiter:
    def test_allows_up_to_the_limit_then_blocks(self):
        limiter = RateLimiter(max_calls=2, per_seconds=60, clock=lambda: 0.0)
        assert [limiter.allow() for _ in range(3)] == [True, True, False]

    def test_window_slides(self):
        now = {"t": 0.0}
        limiter = RateLimiter(max_calls=1, per_seconds=60, clock=lambda: now["t"])
        assert limiter.allow() is True
        now["t"] = 30
        assert limiter.allow() is False
        now["t"] = 61
        assert limiter.allow() is True
