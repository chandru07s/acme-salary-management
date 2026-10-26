# ACME Salary Management

Web software for an HR Manager to manage salaries for 10,000 employees across 8 countries and answer
"how do we pay people?" without Excel.

- **Requirements (one page):** [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- **Architecture & trade-offs:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **How AI was used:** [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md)

## Features
- **Directory:** server-side search, filters (country, department, job title, status), sortable columns,
  pagination, add / edit / terminate / reactivate, CSV export of the filtered list.
- **Salary history:** every salary change is recorded with a reason.
- **Insights:** headcount, payroll, median and average; pay range (min / median / average / max) by country,
  department and job title on a shared USD axis; salary bands.
- **Ask the data (AI):** ask questions in plain English; an AI analyst writes read-only SQL over a privacy-trimmed
  view, runs it and answers, and the UI shows the SQL it used.
- Multi-currency: salaries are stored in local currency and normalised to USD for comparison.

## Stack
Python · FastAPI · SQLAlchemy 2 · SQLite (plain SQL view + window functions) · React 19 · TypeScript · Vite · Bootstrap 5 · OpenAI tool calling

## Run locally
```bash
# 1. API + seed
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m app.seed --reset          # 10,000 employees in ~1s (deterministic)
# optional: switch on the AI assistant (PowerShell: $env:OPENAI_API_KEY="sk-..."  ;  bash: export OPENAI_API_KEY=sk-...)
uvicorn app.main:app --reload       # http://127.0.0.1:8000  (docs at /docs)

# 2. UI (dev server proxies /api to :8000)
cd ../frontend
npm install
npm run dev                         # http://localhost:5173
```
To serve everything from one port, run `npm run build` in `frontend/` and open http://127.0.0.1:8000.

## Tests
```bash
cd backend  && python -m pytest     # 111 tests, ~1s, in-memory SQLite, LLM faked (no network, no key needed)
cd frontend && npm test             # 12 formatting / API-helper unit tests
```

## Deploy
Set these environment variables on the host (never commit the key):

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | enables "Ask the data" | unset = feature off, app still works |
| `OPENAI_MODEL` | model used by the agent | `gpt-4o-mini` |
| `AGENT_MAX_REQUESTS_PER_HOUR` | cost/abuse guard | `60` |
| `AUTO_SEED` | seed 10k employees when the DB is empty | `1` in Docker |

Also set a monthly spend limit in the OpenAI dashboard, since the demo URL is public.

A `Dockerfile` builds the UI and serves it with the API from one container; `AUTO_SEED=1` seeds an empty
database on first boot. `render.yaml` is a ready Render blueprint (also works on Fly.io / Railway / any Docker host):
```bash
docker build -t acme-salary . && docker run -p 8000:8000 acme-salary
```

## API summary
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/employees` | list: `q, country, department, job_title, status, sort_by, order, page, page_size` |
| GET | `/api/employees/export.csv` | CSV of the filtered list |
| POST / PATCH / DELETE | `/api/employees[/{id}]` | create / partial update / soft delete |
| GET | `/api/employees/{id}/history` | salary history, newest first |
| GET | `/api/insights` | summary, by country/department/job title, distribution |
| GET | `/api/meta` | countries (with currency), departments, job titles |
| GET | `/api/agent/status` | `{enabled}`: is an OpenAI key configured |
| POST | `/api/agent/ask` | `{question}` -> `{answer, steps:[{sql, columns, rows, error}]}` (rate limited) |
