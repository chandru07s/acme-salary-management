# Salary Management – Requirements (one-pager)

**Persona:** HR Manager at ACME (10,000 employees, multiple countries).
**Problem:** Salary data lives in Excel sheets. It is tedious to maintain, error-prone, and hard to answer "how do we pay people?" quickly.

## Goal
Replace the spreadsheets with a web app where the HR Manager can (1) maintain employee salary records and (2) get instant answers about how the org pays, without pivot tables.

## Scope & Features (v1)

| # | Feature | Why it matters |
|---|---------|----------------|
| 1 | **Employee directory** – paginated, sortable table with server-side search (name/email) and filters (country, department, job title, status) | 10k rows must stay fast; HR finds a person in seconds |
| 2 | **Add / edit / delete employee** with validation (unique email, salary > 0, valid currency/country) | Replaces editing cells in Excel |
| 3 | **Salary history** – every salary change is recorded (old → new, date, reason) | Auditability; answers "when did this person last get a raise?" |
| 4 | **Insights dashboard** – headcount & total payroll; min / avg / median / max salary per country, department, job title; salary distribution bands; pay spread within a job title | The "how does the org pay people" questions |
| 5 | **Multi-currency aware** – each employee stores salary in local currency; insights show values normalised to a single reporting currency (USD) using a configurable static rate table | Multiple countries means mixed currencies; comparing raw numbers would be wrong |
| 6 | **Seed script** – 10,000 deterministic, realistic employees across 8 countries | Demo + load test |
| 7 | **CSV export** of the filtered employee list | HR still shares data in Excel-shaped form |
| 8 | **Ask the data** – plain-English questions answered by an AI analyst that writes *read-only SQL* over a privacy-trimmed view and shows the SQL it used | Insights dashboards answer the questions we predicted; HR will ask ones we did not. Showing the SQL keeps answers checkable |

## Deliberately Left Out (and why)

- **Authentication / roles** – single persona (HR Manager). Auth adds weight without showing salary-domain judgment. *Next step:* SSO + RBAC, since salary data is highly sensitive.
- **Payroll runs, tax, deductions, payslips** – this is *salary management*, not payroll. Different domain with country-specific compliance.
- **Live FX rates** – a static, editable rate table keeps tests deterministic and removes an external dependency. *Next step:* daily rate sync.
- **Bulk Excel import UI** – the seed script covers initial load; an importer needs column-mapping and error-reporting UX that deserves its own iteration.
- **Bonuses / equity / allowances** – v1 models a single base salary. Total compensation can be layered on later without changing the core model.
- **Org chart / managers / approvals workflow** – out of scope for a single-user tool.
- **Soft multi-tenancy, i18n** – one org, English only.
- **AI that changes data** – the agent can only read. Salary changes stay a deliberate human action with a recorded reason.
- **AI access to emails or raw tables** – the agent sees one view (`employee_pay`: no emails) and nothing else. Salary data is sensitive, so the exposure is minimal by design.
- **Chat memory / multi-turn context** – each question is answered independently; simpler to reason about and cheaper.

## Key Assumptions (to confirm with stakeholders)
1. One current base salary per employee, stored as an **annual** amount in the employee's local currency.
2. Reporting currency is USD; rates are approximate and admin-editable in config.
3. "Median" matters as much as "average" for pay questions, so both are shown.
4. Deleting an employee is a **soft delete** (status = terminated) so history and insights stay consistent; hard delete is not offered in the UI.
5. The AI feature is optional: with no `OPENAI_API_KEY` the rest of the app works and the Ask page explains why it is off.
6. Sending query results (names, titles, salaries; never emails) to a third-party LLM is acceptable for this demo. Production would need a data-processing agreement or a self-hosted model.
7. Scale target: 10k employees today, comfortable up to ~100k on SQLite/Postgres with indexed filters and server-side aggregation.

## Success Criteria
- Directory search/filter responds in < 200 ms on 10k rows.
- Insights endpoints respond in < 500 ms on 10k rows.
- Core business logic covered by fast, deterministic unit tests (the LLM is faked in tests, so no network or cost).
- The AI cannot write, cannot read outside `employee_pay`, and cannot run for more than 2 seconds per query.
- AI answers are structured and evidence-backed (no data answer without a successful query), and a small evaluation suite checks them against ground truth computed from the database.
