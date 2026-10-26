"""A scripted stand-in for the OpenAI client: no network, fully deterministic."""
import copy
import json
from types import SimpleNamespace


def tool_call(call_id: str, sql: str, name: str = "run_sql", raw_arguments: str | None = None):
    args = raw_arguments if raw_arguments is not None else json.dumps({"query": sql})
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=args))


def reply(content: str | None = None, calls: list | None = None):
    return SimpleNamespace(content=content, tool_calls=calls)


def final(answer: str, assumptions: list[str] | None = None, answerable: bool = True, call_id: str = "f1"):
    """A model reply that finishes with the structured final_answer tool."""
    args = json.dumps({"answer": answer, "assumptions": assumptions or [], "answerable": answerable})
    return reply(calls=[tool_call(call_id, "", name="final_answer", raw_arguments=args)])


class FakeClient:
    """Returns the scripted replies in order and records what the agent sent."""

    def __init__(self, replies: list):
        self._replies = list(replies)
        self.requests: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.requests.append(copy.deepcopy(kwargs))
        if not self._replies:
            raise AssertionError("agent asked the model more times than the test scripted")
        return SimpleNamespace(choices=[SimpleNamespace(message=self._replies.pop(0))])

    def last_tool_result(self) -> dict:
        """The most recent tool message the model was shown (parsed JSON)."""
        tools = [m for m in self.requests[-1]["messages"] if m["role"] == "tool"]
        return json.loads(tools[-1]["content"])
