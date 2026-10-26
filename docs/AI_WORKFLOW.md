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
