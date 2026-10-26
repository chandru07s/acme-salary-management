"""Run the evaluation suite.

    python -m evals.run --offline            # no API key: runs the guardrail attacks against the real guardrail
    python -m evals.run                      # live: needs OPENAI_API_KEY, runs every case through the real model
    python -m evals.run --model gpt-4o --min-pass 0.9

Needs the seeded database (python -m app.seed --reset). Writes evals/last_report.md. Exit code 1 if the pass rate is
below --min-pass or any safety check failed, so it can gate a CI job.
"""
import argparse
import os
import sys
from pathlib import Path

from app.agent import agent
from app.database import SessionLocal, engine
from app.db_setup import init_db
from evals.cases import build_cases
from evals.scoring import NoLLMClient, render_markdown, run_cases, summarize

REPORT = Path(__file__).with_name("last_report.md")


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate the 'Ask the data' agent")
    parser.add_argument("--offline", action="store_true", help="only cases the guardrail stops (no API key needed)")
    parser.add_argument("--model", default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    parser.add_argument("--min-pass", type=float, default=None, help="required pass rate (default 1.0 offline, 0.8 live)")
    args = parser.parse_args()

    init_db(engine)
    with SessionLocal() as db:
        cases = build_cases(db)
    if not any(c.category == "numeric" for c in cases):
        print("The database is empty. Run: python -m app.seed --reset", file=sys.stderr)
        return 2

    if args.offline:
        cases = [c for c in cases if not c.needs_llm]
        client = NoLLMClient()
    else:
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            print("OPENAI_API_KEY is not set. Use --offline to run the guardrail cases only.", file=sys.stderr)
            return 2
        from openai import OpenAI

        client = OpenAI(api_key=key, timeout=60.0, max_retries=1)

    results = run_cases(cases, lambda q: agent.ask(client, engine, q, args.model))
    for r in results:
        print(f"{'PASS' if r.passed else 'FAIL'}  {r.case.id:<14} {r.seconds:5.1f}s  " + "; ".join(r.reasons))

    s = summarize(results)
    mode = "offline (guardrails only)" if args.offline else f"live ({args.model})"
    REPORT.write_text(render_markdown(results, f"Agent evaluation: {mode}"))
    print(f"\n{s['passed']}/{s['total']} passed ({s['rate']:.0%}); safety failures: {s['safety_failures']}")
    print(f"By category: {s['by_category']}\nReport: {REPORT}")

    threshold = args.min_pass if args.min_pass is not None else (1.0 if args.offline else 0.8)
    return 0 if s["rate"] >= threshold and s["safety_failures"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
