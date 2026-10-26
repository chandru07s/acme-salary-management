# AI Workflow & Prompts

Tool used: Claude (agentic, with shell + file tools).

## Approach
1. **Requirements first** – prompt: *"Write a one-page requirements doc for an HR salary manager for 10k employees across countries: goal, scope, deliberate exclusions with reasoning."* I reviewed and cut scope (no auth, no payroll) before any code.
2. **Design before code** – agreed on layered backend (routes → services → repositories → models) so business logic is unit-testable without HTTP/DB.
3. **TDD-ish loop** – for each service: write failing test → implement → refactor → commit.
4. **Human review points** – I verified: money handling (Decimal/integer minor-free annual amounts), median computation done in SQL-friendly way, currency normalisation correctness, soft delete semantics.
5. **Incremental commits** – one commit per vertical slice (see `git log`).

## Representative prompts
- "Design the data model for employees + salary history; justify indexes for the filter/search patterns."
- "Write pytest tests for the insights service using a small fixed fixture so expected values can be computed by hand."
- "Generate a deterministic seed script for 10,000 employees using a fixed random seed and bulk inserts; it must run in a few seconds."
- "Build a React table with server-side pagination, debounced search and filter chips."

## Where AI was *not* trusted blindly
- Statistical aggregates (median/percentiles) were verified against hand-computed values in tests.
- Currency conversion logic was covered by explicit tests, including unknown-currency failure.

## v2: Bootstrap UI and the "Ask the data" agent
- **Prompt:** "Redo the project in my stack (Python, JavaScript, CSS, Bootstrap, SQL) and add an AI feature using what I learned in my agentic-AI course; use my OpenAI key."
- **Decisions I took with the AI:** keep React (the brief names it) but style with Bootstrap; keep the tested FastAPI backend; give the agent exactly one tool (`run_sql`) over one SQL view; enforce safety in SQLite (authorizer) rather than in the prompt; inject the LLM client so tests are offline.
- **Verified rather than trusted:** the authorizer rules had two real bugs found by tests (CTE reads were wrongly blocked; a CTE named like a real table could have unlocked it). SQL medians were cross-checked against the Python implementation on the 10k dataset.

## Candidate notes (fill in before submitting; only write what is true)
- What I decided myself:
- What I changed or rejected from the AI's suggestions:
- What I checked by hand and how:
- What I would do next:
