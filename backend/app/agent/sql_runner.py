"""Run model-written SQL safely.

Defence in depth, strongest first:
  1. SQLite *authorizer*: the engine itself refuses any statement other than SELECT, and refuses
     reads of anything except the `employee_pay` view (and `fx_rates`). The view may read its own
     base tables, but a top-level query cannot touch `employees.email`, `salary_history`,
     `sqlite_master`, and so on. This is enforced inside SQLite, so tricks like comments, casing or
     sub-selects cannot bypass it.
  2. `PRAGMA query_only = ON` for the duration of the query.
  3. A wall-clock timeout (progress handler) and a hard cap on returned rows.
  4. A cheap text pre-check that gives the model a clear message about one-statement SELECTs.
"""
import re
import sqlite3
import time

ALLOWED_RELATIONS = {"employee_pay", "fx_rates"}
VIEW_NAME = "employee_pay"
MAX_ROWS = 50
TIMEOUT_SECONDS = 2.0


class SqlRejected(ValueError):
    """The query was refused or failed; the message is safe to show to the model and the user."""


def validate_sql(sql: str) -> str:
    cleaned = (sql or "").strip().rstrip(";").strip()
    if not cleaned:
        raise SqlRejected("Empty query.")
    if ";" in cleaned:
        raise SqlRejected("Only one statement is allowed.")
    if not re.match(r"(?is)^(select|with)\b", cleaned):
        raise SqlRejected("Only SELECT queries are allowed.")
    return cleaned


_CTE_NAME = re.compile(
    r"(?is)\b([a-z_][a-z0-9_]*)\s*(?:\([^()]*\))?\s*as\s*(?:(?:not\s+)?materialized\s*)?\("
)


def _cte_names(sql: str, real_relations: set[str]) -> set[str]:
    """Names the query itself defines with WITH ... AS (...).

    SQLite reports a read of a CTE as a read of a "table" named after it, so those names must be
    allowed. A CTE that reuses the name of a REAL table or view is never allowed: otherwise
    `WITH employees AS (...) SELECT ... FROM main.employees` could smuggle in a real read.
    """
    return {n.lower() for n in _CTE_NAME.findall(sql)} - real_relations


def _make_authorizer(cte_names: set[str]):
    def authorizer(action, arg1, arg2, db_name, source):
        if action in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE):
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ:
            if source == VIEW_NAME:  # the view reading its own base tables
                return sqlite3.SQLITE_OK
            # `source` is None for top-level SQL, or the name of the CTE responsible for the read.
            if source is None or (source or "").lower() in cte_names:
                name = (arg1 or "").lower()
                if name in ALLOWED_RELATIONS or name in cte_names:
                    return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY

    return authorizer


def _real_relations(cur) -> set[str]:
    rows = cur.execute(
        "SELECT name FROM sqlite_master UNION SELECT name FROM sqlite_temp_master"
    ).fetchall()
    return {r[0].lower() for r in rows} | {"sqlite_master", "sqlite_schema", "sqlite_temp_master", "sqlite_temp_schema"}


def run_readonly_sql(engine, sql: str) -> dict:
    """Returns {"columns": [...], "rows": [[...]], "truncated": bool}. Raises SqlRejected."""
    cleaned = validate_sql(sql)
    raw = engine.raw_connection()
    conn = raw.driver_connection
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA query_only = ON")
        ctes = _cte_names(cleaned, _real_relations(cur))
        conn.set_authorizer(_make_authorizer(ctes))
        deadline = time.monotonic() + TIMEOUT_SECONDS
        conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
        try:
            cur.execute(cleaned)
            columns = [d[0] for d in cur.description or []]
            fetched = cur.fetchmany(MAX_ROWS + 1)
        except sqlite3.Error as exc:
            raise SqlRejected(_explain(exc)) from None
        truncated = len(fetched) > MAX_ROWS
        return {"columns": columns, "rows": [list(r) for r in fetched[:MAX_ROWS]], "truncated": truncated}
    finally:
        conn.set_authorizer(None)
        conn.set_progress_handler(None, 0)
        conn.cursor().execute("PRAGMA query_only = OFF")
        raw.close()


def _explain(exc: sqlite3.Error) -> str:
    msg = str(exc)
    if "not authorized" in msg or "prohibited" in msg:
        return f"Not allowed: you may only SELECT from {sorted(ALLOWED_RELATIONS)}."
    if "interrupted" in msg:
        return f"Query took longer than {TIMEOUT_SECONDS:.0f}s and was stopped. Simplify it."
    return f"SQL error: {msg}"
