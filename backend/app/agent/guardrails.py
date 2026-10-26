"""Guardrails around the agent. Two layers, both deterministic (no extra LLM call, so free and testable).

Input guardrail  - runs BEFORE the model is called. Refuses prompt-injection attempts, requests for personal
                   contact details or secrets, and requests to change data. Saves cost and gives a clear message.
Output guardrail - runs on the model's final answer. Blocks contact details leaking into the answer, and
                   refuses to accept a data answer that is not backed by at least one successful query.

Honest limits: keyword/regex rules are easy to word around. They are the cheap first layer and a UX layer.
The security boundary is the database itself (see sql_runner.py): even if a request slips past these rules,
the model can only SELECT from `employee_pay`, which has no email column.
"""
import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class Verdict:
    allowed: bool
    reason: str | None = None  # machine-readable code, shown in logs and evals
    message: str | None = None  # safe to show to the user (input/hard blocks) or to the model (retryable)
    retryable: bool = False  # output only: ask the model to fix it instead of failing


ALLOWED = Verdict(True)

MSG_INJECTION = (
    "I can only answer questions about ACME's salary data. I can't change or share my instructions."
)
MSG_CONTACT = (
    "I don't have access to emails, phone numbers, addresses or other personal details. "
    "Ask about pay, headcount or departments instead."
)
MSG_WRITE = "I can only read salary data. To add or change people, use the Directory page."
MSG_LEAK = "The answer contained personal contact details, so it was withheld."

_FLAGS = re.IGNORECASE

# (reason, pattern, message). First match wins. Patterns use [^.?!] so a rule cannot span sentences.
_INPUT_RULES: list[tuple[str, re.Pattern[str], str]] = [
    (
        "prompt_injection",
        re.compile(
            r"\b(ignore|disregard|forget|override|bypass|disable)\b[^.?!]{0,40}"
            r"\b(instructions?|rules?|prompts?|guidelines?|restrictions?|guardrails?|polic(?:y|ies)|safety)\b",
            _FLAGS,
        ),
        MSG_INJECTION,
    ),
    (
        "prompt_injection",
        re.compile(
            r"\b(reveal|show|print|repeat|display|leak|output|tell me)\b[^.?!]{0,30}"
            r"\b(system|hidden|initial|original|secret)\b[^.?!]{0,15}\b(prompts?|instructions?|messages?)\b",
            _FLAGS,
        ),
        MSG_INJECTION,
    ),
    ("prompt_injection", re.compile(r"\bsystem prompt\b", _FLAGS), MSG_INJECTION),
    (
        "prompt_injection",
        re.compile(r"\b(jailbreak|developer mode|dan mode|do anything now)\b|\byou are now\b", _FLAGS),
        MSG_INJECTION,
    ),
    ("contact_details", re.compile(r"\be-?mails?\b", _FLAGS), MSG_CONTACT),
    (
        "contact_details",
        re.compile(r"\b(phone|mobile|telephone|cell)\b[^.?!]{0,12}\b(numbers?|no\.?)\b", _FLAGS),
        MSG_CONTACT,
    ),
    (
        "contact_details",
        re.compile(r"\b(home|street|postal|mailing|residential)\s+address(es)?\b", _FLAGS),
        MSG_CONTACT,
    ),
    ("contact_details", re.compile(r"\bcontact\s+(details?|info(rmation)?)\b", _FLAGS), MSG_CONTACT),
    (
        "secrets",
        re.compile(
            r"\b(passwords?|credentials?|api[\s_-]?keys?|secret keys?|ssn|social security|aadhaar|passport number)\b",
            _FLAGS,
        ),
        MSG_CONTACT,
    ),
    (
        "write_request",
        re.compile(
            r"\b(delete|remove|drop|truncate|erase|wipe|purge)\b[^.?!]{0,30}"
            r"\b(employees?|tables?|records?|data|database|everyone|everybody|all|rows?|history)\b",
            _FLAGS,
        ),
        MSG_WRITE,
    ),
    (
        "write_request",
        re.compile(
            r"\b(insert|update|alter|modify|edit)\b[^.?!]{0,20}"
            r"\b(tables?|database|records?|rows?|salary|salaries|employees?)\b",
            _FLAGS,
        ),
        MSG_WRITE,
    ),
]

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _normalise(text: str) -> str:
    """Fold look-alike characters (full-width letters etc.) and collapse whitespace before matching."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()


def check_input(question: str) -> Verdict:
    text = _normalise(question)
    for reason, pattern, message in _INPUT_RULES:
        if pattern.search(text):
            return Verdict(False, reason, message)
    return ALLOWED


def check_output(text: str, *, answerable: bool, has_evidence: bool) -> Verdict:
    """`text` is the answer plus any assumptions. `has_evidence` = at least one query succeeded."""
    if _EMAIL.search(text):
        return Verdict(False, "contact_details_in_answer", MSG_LEAK)
    if answerable and not has_evidence:
        return Verdict(
            False,
            "no_evidence",
            "An answer must be backed by data. Run a successful run_sql query first, "
            "or call final_answer with answerable=false if the data cannot answer this.",
            retryable=True,
        )
    return ALLOWED
