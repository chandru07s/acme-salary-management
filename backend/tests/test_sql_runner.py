import pytest
from sqlalchemy import text

from app.agent import sql_runner
from app.agent.sql_runner import SqlRejected, run_readonly_sql, validate_sql
from app.seed import seed


def run(db, sql):
    return run_readonly_sql(db.get_bind(), sql)


class TestValidate:
    @pytest.mark.parametrize("sql", ["", "   ", ";"])
    def test_rejects_empty(self, sql):
        with pytest.raises(SqlRejected):
            validate_sql(sql)

    @pytest.mark.parametrize("sql", [
        "DELETE FROM employees",
        "drop table employees",
        "UPDATE employees SET salary = 1",
        "PRAGMA table_info(employees)",
    ])
    def test_rejects_non_select(self, sql):
        with pytest.raises(SqlRejected, match="Only SELECT"):
            validate_sql(sql)

    def test_rejects_multiple_statements(self):
        with pytest.raises(SqlRejected, match="one statement"):
            validate_sql("SELECT 1; DELETE FROM employees")

    def test_accepts_select_with_cte_and_trailing_semicolon(self):
        assert validate_sql("  WITH a AS (SELECT 1) SELECT * FROM a ; ").startswith("WITH")


class TestAllowedReads:
    def test_reads_pay_view_in_usd(self, db, add):
        add(country="GB", salary=100_000)
        out = run(db, "SELECT country, salary_local, salary_usd FROM employee_pay")
        assert out["columns"] == ["country", "salary_local", "salary_usd"]
        assert out["rows"] == [["GB", 100_000, 127_000.0]]
        assert out["truncated"] is False

    def test_aggregates_and_ctes_work(self, db, add):
        add(country="US", salary=100_000)
        add(country="US", salary=200_000)
        out = run(db, "WITH p AS (SELECT * FROM employee_pay) SELECT AVG(salary_usd) FROM p")
        assert out["rows"] == [[150_000.0]]

    def test_fx_rates_are_readable(self, db):
        out = run(db, "SELECT to_usd FROM fx_rates WHERE currency = 'GBP'")
        assert out["rows"] == [[1.27]]


class TestBlockedReads:
    """These are enforced by SQLite's authorizer, not by text matching."""

    @pytest.mark.parametrize("sql", [
        "SELECT email FROM employees",
        "SELECT * FROM employees",
        "SELECT * FROM salary_history",
        "SELECT name FROM sqlite_master",
        "SELECT (SELECT email FROM employees LIMIT 1)",
        "SELECT * FROM employee_pay, employees",
        "SELECT * FROM pragma_table_info('employees')",
    ])
    def test_cannot_read_outside_the_pay_view(self, db, add, sql):
        add()
        with pytest.raises(SqlRejected):
            run(db, sql)

    @pytest.mark.parametrize("sql", [
        # a CTE named like a real table must not unlock reads of that real table
        "WITH employees AS (SELECT 1 AS x) SELECT (SELECT email FROM main.employees LIMIT 1)",
        "WITH salary_history AS (SELECT 1) SELECT * FROM main.salary_history",
        "WITH sqlite_master AS (SELECT 1) SELECT * FROM main.sqlite_master",
    ])
    def test_cte_cannot_impersonate_a_real_table(self, db, add, sql):
        add()
        with pytest.raises(SqlRejected):
            run(db, sql)

    def test_email_is_not_exposed_by_the_view(self, db, add):
        add()
        with pytest.raises(SqlRejected, match="no such column"):
            run(db, "SELECT email FROM employee_pay")


class TestWritesAreImpossible:
    def test_write_hidden_inside_a_cte_is_denied(self, db):
        with pytest.raises(SqlRejected):
            run(db, "WITH x AS (SELECT 1) INSERT INTO fx_rates VALUES ('ZZZ', 1.0)")
        assert db.execute(text("SELECT COUNT(*) FROM fx_rates WHERE currency = 'ZZZ'")).scalar() == 0

    def test_guards_are_removed_afterwards(self, db, add):
        run(db, "SELECT 1")
        # the shared connection must be writable and unrestricted again for the app itself
        emp = add(country="US", salary=50_000)
        assert db.execute(text("SELECT email FROM employees WHERE id = :i"), {"i": emp.id}).scalar()

    def test_guards_are_removed_even_after_a_rejected_query(self, db, add):
        with pytest.raises(SqlRejected):
            run(db, "SELECT * FROM employees")
        add()  # would fail if query_only were still ON


class TestLimits:
    def test_rows_are_capped_and_flagged(self, db):
        seed(db, count=60)
        out = run(db, "SELECT id FROM employee_pay")
        assert len(out["rows"]) == sql_runner.MAX_ROWS
        assert out["truncated"] is True

    def test_runaway_query_is_stopped(self, db, monkeypatch):
        monkeypatch.setattr(sql_runner, "TIMEOUT_SECONDS", 0.05)
        endless = "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c"
        with pytest.raises(SqlRejected, match="longer than"):
            run(db, endless)

    def test_sql_errors_become_readable_messages(self, db):
        with pytest.raises(SqlRejected, match="SQL error"):
            run(db, "SELECT nonsense FROM employee_pay")


import pytest as _pytest

@_pytest.mark.parametrize("table", ["users", "payslips", "payroll_runs", "variable_pay", "app_config", "payroll_events", "employees"])
def test_agent_cannot_read_payroll_or_login_tables(db, table):
    from app.agent.sql_runner import SqlRejected, run_readonly_sql

    with _pytest.raises(SqlRejected):
        run_readonly_sql(db.get_bind(), f"SELECT * FROM {table}")
