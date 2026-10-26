"""Tests for the evaluation harness itself: a grader you cannot trust is worse than no grader."""
import pytest
from sqlalchemy import text

from app.agent import agent
from app.agent.agent import AgentResult, Step
from app.agent.guardrails import check_input
from app.seed import seed
from evals.cases import GUARDRAIL_CASES, REFUSAL_CASES, Case, build_cases
from evals.numbers import contains_number, extract_numbers
from evals.scoring import NoLLMClient, evaluate, render_markdown, run_cases, summarize

GOOD_STEP = Step(sql="SELECT 1", columns=["n"], rows=[[1]])


class TestNumbers:
    @pytest.mark.parametrize("text,expected", [
        ("about $94k", [94_000]),
        ("94,000 dollars", [94_000]),
        ("$1.2M total", [1_200_000]),
        ("2 million people", [2_000_000]),
        ("$85k to $99k", [85_000, 99_000]),
        ("There are 9,582 people.", [9_582]),
        ("Median is 27.1K", [27_100]),
        ("9 months ago", [9]),          # 'm' of 'months' is not a million suffix
        ("no digits here", []),
    ])
    def test_extracts_numbers_with_suffixes(self, text, expected):
        assert extract_numbers(text) == pytest.approx(expected)

    def test_a_rounded_answer_is_accepted_within_one_percent(self):
        assert contains_number("about $94k", 94_120)
        assert contains_number("$27.1k", 27_120)

    def test_a_wrong_number_is_rejected(self):
        assert not contains_number("about $90k", 94_120)
        assert not contains_number("There are 100 people", 9_582)

    def test_a_zero_tolerance_makes_counts_exact(self):
        assert contains_number("There are 418 people", 418, rel_tol=0.0)
        assert not contains_number("There are 419 people", 418, rel_tol=0.0)

    def test_the_default_tolerance_is_deliberately_loose_for_rounded_dollar_figures(self):
        assert contains_number("There are 419 people", 418)   # 0.24% off: fine for money, wrong for counts


class TestGroundTruth:
    @pytest.fixture()
    def seeded(self, db):
        seed(db, count=400)
        return db

    def test_expected_values_come_from_the_database_not_from_the_agent(self, seeded):
        cases = {c.id: c for c in build_cases(seeded)}
        active = seeded.execute(text("SELECT COUNT(*) FROM employees WHERE status = 'active'")).scalar()
        terminated = seeded.execute(text("SELECT COUNT(*) FROM employees WHERE status = 'terminated'")).scalar()
        assert cases["n-headcount"].expect_numbers == (active,)
        assert cases["n-terminated"].expect_numbers == (float(terminated),)

    def test_counts_are_graded_exactly_and_money_with_tolerance(self, seeded):
        cases = {c.id: c for c in build_cases(seeded)}
        assert cases["n-headcount"].rel_tol == 0.0 and cases["n-terminated"].rel_tol == 0.0
        assert cases["n-payroll"].rel_tol == 0.01

    def test_entity_cases_name_the_true_top_country(self, seeded):
        cases = {c.id: c for c in build_cases(seeded)}
        top = seeded.execute(text("""
            WITH r AS (SELECT country, salary_usd, ROW_NUMBER() OVER (PARTITION BY country ORDER BY salary_usd) rn,
                              COUNT(*) OVER (PARTITION BY country) n FROM employee_pay WHERE status = 'active')
            SELECT country FROM r WHERE rn IN ((n + 1) / 2, (n + 2) / 2)
            GROUP BY country ORDER BY AVG(salary_usd) DESC LIMIT 1""")).scalar()
        from evals.cases import ALIASES
        from app.config import COUNTRY_NAMES
        accepted = ALIASES.get(top, (COUNTRY_NAMES[top],))
        assert set(accepted) <= set(cases["e-top-country"].expect_any_text)

    def test_an_empty_database_still_yields_the_refusal_and_guardrail_cases(self, db):
        ids = {c.id for c in build_cases(db)}
        assert ids == {c.id for c in REFUSAL_CASES + GUARDRAIL_CASES}

    def test_case_ids_are_unique(self, seeded):
        ids = [c.id for c in build_cases(seeded)]
        assert len(ids) == len(set(ids))


class TestEvaluate:
    numeric = Case("n", "numeric", "q", True, expect_numbers=(94_000.0,))
    entity = Case("e", "entity", "q", True, expect_any_text=("United States", "US"))
    refusal = Case("r", "refusal", "q", True, expect_refusal=True)
    guard = Case("g", "guardrail", "q", False, expect_refusal=True)

    def test_correct_numeric_answer_passes(self):
        assert evaluate(self.numeric, AgentResult("The median is about $94k.", [GOOD_STEP])) == []

    def test_an_off_by_one_headcount_fails(self):
        count = Case("c", "numeric", "q", True, expect_numbers=(418.0,), rel_tol=0.0)
        assert evaluate(count, AgentResult("There are 418 people.", [GOOD_STEP])) == []
        assert evaluate(count, AgentResult("There are 419 people.", [GOOD_STEP])) != []

    def test_wrong_number_fails(self):
        assert any("expected the number" in p for p in evaluate(self.numeric, AgentResult("It is $50k.", [GOOD_STEP])))

    def test_a_right_looking_answer_with_no_query_behind_it_fails(self):
        assert any("no successful query" in p for p in evaluate(self.numeric, AgentResult("$94k.", [])))

    def test_a_failed_query_is_not_evidence(self):
        bad = Step(sql="SELECT x", error="boom")
        assert any("no successful query" in p for p in evaluate(self.numeric, AgentResult("$94k.", [bad])))

    def test_declining_a_question_the_data_can_answer_fails(self):
        result = AgentResult("I can't tell.", [GOOD_STEP], answerable=False)
        assert any("declined" in p for p in evaluate(self.numeric, result))

    def test_entity_matches_names_and_whole_word_codes_only(self):
        assert evaluate(self.entity, AgentResult("The US leads.", [GOOD_STEP])) == []
        assert evaluate(self.entity, AgentResult("United States", [GOOD_STEP])) == []
        assert evaluate(self.entity, AgentResult("It is the USB budget", [GOOD_STEP])) != []   # not a whole word
        assert evaluate(self.entity, AgentResult("it is us", [GOOD_STEP])) != []                # case-sensitive code

    def test_refusal_case_passes_only_when_the_agent_declines(self):
        assert evaluate(self.refusal, AgentResult("No.", [], answerable=False)) == []
        assert evaluate(self.refusal, AgentResult("Done, raised.", [GOOD_STEP])) != []

    def test_guardrail_case_requires_the_input_guardrail_specifically(self):
        assert evaluate(self.guard, AgentResult("blocked", [], answerable=False, guardrail="input")) == []
        assert evaluate(self.guard, AgentResult("no", [], answerable=False)) != []   # model declined, guardrail did not fire

    @pytest.mark.parametrize("case", [numeric, entity, refusal])
    def test_an_email_in_the_answer_fails_every_case_even_if_otherwise_correct(self, case):
        result = AgentResult("About $94k, United States, contact ada@acme.com", [GOOD_STEP], answerable=case.category != "refusal")
        assert any(p.startswith("SAFETY") for p in evaluate(case, result))

    def test_an_email_in_a_returned_row_fails(self):
        leaky = Step(sql="SELECT 1", rows=[["ada@acme.com"]])
        assert any("query returned an email" in p for p in evaluate(self.numeric, AgentResult("$94k", [leaky])))

    def test_a_leaked_system_prompt_fails(self):
        result = AgentResult("My rules: " + agent.SYSTEM_PROMPT.splitlines()[0], [], answerable=False)
        assert any("system prompt leaked" in p for p in evaluate(self.refusal, result))


class TestRunner:
    @staticmethod
    def oracle(cases):
        """Answers every case correctly *from the case's own expectations*: it tests the grader, not the agent."""
        by_question = {c.question: c for c in cases}

        def ask(question):
            c = by_question[question]
            if c.category == "guardrail":
                return AgentResult("blocked", [], answerable=False, guardrail="input")
            if c.expect_refusal:
                return AgentResult("Out of scope.", [], answerable=False)
            if c.expect_numbers:
                return AgentResult(" and ".join(f"{n:,.0f}" for n in c.expect_numbers), [GOOD_STEP])
            return AgentResult(c.expect_any_text[0], [GOOD_STEP])

        return ask

    @pytest.fixture()
    def cases(self, db):
        seed(db, count=300)
        return build_cases(db)

    def test_a_perfect_agent_scores_100_percent(self, cases):
        summary = summarize(run_cases(cases, self.oracle(cases)))
        assert summary["rate"] == 1.0 and summary["safety_failures"] == 0

    def test_a_broken_agent_is_caught(self, cases):
        always_wrong = lambda q: AgentResult("I have no idea.", [GOOD_STEP], answerable=True)
        summary = summarize(run_cases(cases, always_wrong))
        assert summary["rate"] < 0.5

    def test_one_crashing_case_does_not_stop_the_suite(self, cases):
        def flaky(question):
            raise RuntimeError("model timeout")
        results = run_cases(cases, flaky)
        assert len(results) == len(cases) and not any(r.passed for r in results)
        assert "RuntimeError" in results[0].reasons[0]

    def test_summary_counts_by_category(self, cases):
        summary = summarize(run_cases(cases, self.oracle(cases)))
        assert summary["by_category"]["guardrail"] == (len(GUARDRAIL_CASES), len(GUARDRAIL_CASES))
        assert summary["total"] == len(cases)

    def test_report_lists_every_case_and_marks_failures(self, cases):
        report = render_markdown(run_cases(cases, lambda q: AgentResult("?", [], answerable=True)), "T")
        assert report.startswith("# T") and "**FAIL**" in report
        assert all(f"`{c.id}`" in report for c in cases)


class TestRealGuardrailsAgainstTheAttackSuite:
    """No fakes here: the real agent entry point and the real guardrail, with a client that explodes if called."""

    def test_every_guardrail_attack_is_stopped_before_the_model(self, db):
        engine = db.get_bind()
        results = run_cases(
            GUARDRAIL_CASES,
            lambda q: agent.ask(NoLLMClient(), engine, q, model="unused"),
        )
        assert [r.reasons for r in results] == [[] for _ in GUARDRAIL_CASES]

    def test_no_legitimate_question_in_the_suite_is_blocked_by_the_input_guardrail(self, db):
        seed(db, count=300)
        for case in build_cases(db):
            if case.category in ("numeric", "entity", "refusal"):
                assert check_input(case.question).allowed, f"false positive: {case.question}"
