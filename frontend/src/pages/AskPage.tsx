import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { formatCell } from "../format";
import type { AgentAnswer, AgentStep } from "../types";

const EXAMPLES = [
  "Which country has the highest median salary?",
  "How many people work in each department?",
  "Which job titles have the widest pay gap between lowest and highest?",
  "What is the average salary of engineers in India versus the United States?",
];

interface Turn {
  id: number;
  question: string;
  result?: AgentAnswer;
  error?: string;
}

const PREVIEW_ROWS = 10;

export function AskPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);

  useEffect(() => {
    api.agentStatus().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(false));
  }, []);

  const ask = async (text: string) => {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    const id = nextId.current++;
    setTurns((t) => [{ id, question: q }, ...t]);
    setQuestion("");
    setBusy(true);
    try {
      const result = await api.askAgent(q);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, result } : x)));
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <div className="d-grid gap-3" style={{ maxWidth: 900 }}>
      <div>
        <h1 className="page-title">Ask the data</h1>
        <div className="text-secondary">
          Ask a question in plain English. An AI analyst writes read-only SQL against the pay data, runs it and answers.
          You can always see the SQL it used.
        </div>
      </div>

      {enabled === false && (
        <div className="alert alert-warning mb-0" role="status">
          The AI assistant is not switched on for this server. Set the <code>OPENAI_API_KEY</code> environment variable and restart.
          The rest of the app works without it.
        </div>
      )}

      <form onSubmit={onSubmit} className="card">
        <div className="card-body d-grid gap-3">
          <div>
            <label htmlFor="ask-q" className="form-label fw-medium">Your question</label>
            <div className="input-group">
              <input id="ask-q" className="form-control" maxLength={500} value={question} disabled={enabled === false}
                placeholder="For example: which department has the highest average salary?"
                onChange={(e) => setQuestion(e.target.value)} />
              <button className="btn btn-primary" type="submit" disabled={busy || enabled === false || question.trim().length < 3}>
                {busy ? "Thinking…" : "Ask"}
              </button>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2" aria-label="Example questions">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || enabled === false}
                onClick={() => void ask(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      </form>

      {turns.map((t) => (
        <section key={t.id} className="card" aria-label={`Answer to: ${t.question}`}>
          <div className="card-body d-grid gap-3">
            <div className="fw-semibold">{t.question}</div>
            {!t.result && !t.error && (
              <div className="d-flex align-items-center gap-2 text-secondary">
                <span className="spinner-border spinner-border-sm" aria-hidden /> Querying the data…
              </div>
            )}
            {t.error && <div className="alert alert-danger mb-0" role="alert">{t.error}</div>}
            {t.result && (
              <>
                <div className="answer-text">{t.result.answer}</div>
                {t.result.steps.length > 0 && (
                  <details>
                    <summary className="text-secondary">
                      How this was worked out ({t.result.steps.length} {t.result.steps.length === 1 ? "query" : "queries"})
                    </summary>
                    <div className="d-grid gap-3 mt-2">
                      {t.result.steps.map((s, i) => <StepView key={i} step={s} />)}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function StepView({ step }: { step: AgentStep }) {
  return (
    <div className="d-grid gap-2">
      <pre className="sql-block">{step.sql || "(no query)"}</pre>
      {step.error && <div className="alert alert-warning py-2 mb-0 small">{step.error}</div>}
      {step.columns.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <thead>
              <tr>{step.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {step.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{formatCell(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {(step.rows.length > PREVIEW_ROWS || step.truncated) && (
            <div className="small text-secondary">
              Showing the first {Math.min(PREVIEW_ROWS, step.rows.length)} of {step.truncated ? `${step.rows.length}+` : step.rows.length} rows.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
