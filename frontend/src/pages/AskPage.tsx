import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { IconArrow, IconShield, IconSpark } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
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
    <div style={{ maxWidth: 920 }}>
      <PageHeader
        eyebrow="AI analyst"
        title="Ask the data"
        subtitle="Ask in plain English. The analyst writes read-only SQL on the pay data, runs it and answers. You can always see the SQL it used."
      />

      {enabled === false && (
        <div className="callout warn mb-3" role="status">
          <IconShield />
          <div>
            The AI assistant is not switched on for this server. Set the <code>OPENAI_API_KEY</code> environment variable and restart.
            The rest of the app works without it.
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="card composer mb-3">
        <label htmlFor="ask-q" className="field-label">Your question</label>
        <div className="composer-box">
          <input id="ask-q" className="form-control" maxLength={500} value={question} disabled={enabled === false}
            placeholder="Which department has the highest average salary?"
            onChange={(e) => setQuestion(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy || enabled === false || question.trim().length < 3}>
            {busy ? "Thinking…" : <>Ask <IconArrow /></>}
          </button>
        </div>
        <div className="suggest" aria-label="Example questions">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" disabled={busy || enabled === false} onClick={() => void ask(ex)}>
              <span>{ex}</span><IconArrow />
            </button>
          ))}
        </div>
      </form>

      <div className="d-grid gap-3">
        {turns.map((t) => (
          <section key={t.id} className="card turn" aria-label={`Answer to: ${t.question}`}>
            <div className="d-grid gap-3">
              <div className="turn-q">{t.question}</div>
              {!t.result && !t.error && (
                <div className="d-flex align-items-center gap-2 text-secondary">
                  <span className="spinner-border spinner-border-sm" aria-hidden /> Querying the data…
                </div>
              )}
              {t.error && <div className="alert alert-danger mb-0" role="alert">{t.error}</div>}
              {t.result && (
                <>
                  <AnswerView result={t.result} />
                  {t.result.steps.length > 0 && (
                    <details>
                      <summary>
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
    </div>
  );
}

function AnswerView({ result }: { result: AgentAnswer }) {
  if (result.guardrail) {
    return (
      <div className="callout warn" role="status">
        <IconShield />
        <div>
          <div className="fw-semibold mb-1">
            {result.guardrail === "input" ? "I can't help with that request" : "The answer was withheld"}
          </div>
          <div className="answer-text">{result.answer}</div>
        </div>
      </div>
    );
  }
  if (!result.answerable) {
    return (
      <div className="callout info" role="status">
        <IconSpark />
        <div>
          <div className="fw-semibold mb-1">This can't be answered from the pay data</div>
          <div className="answer-text">{result.answer}</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="answer-text">{result.answer}</div>
      {result.assumptions.length > 0 && (
        <div aria-label="Assumptions">
          {result.assumptions.map((a) => <span className="assume" key={a}>{a}</span>)}
        </div>
      )}
    </>
  );
}

function StepView({ step }: { step: AgentStep }) {
  return (
    <div className="d-grid gap-2">
      <pre className="sql-block">{step.sql || "(no query)"}</pre>
      {step.error && <div className="alert alert-warning py-2 mb-0 small">{step.error}</div>}
      {step.columns.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm mini-table mb-0">
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
