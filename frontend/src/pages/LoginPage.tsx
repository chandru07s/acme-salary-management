import { FormEvent, useState } from "react";
import { api } from "../api";
import { setToken } from "../auth";
import { Logo } from "../components/Icons";
import type { User } from "../types";

const DEMOS = [
  { email: "hr@acme.test", role: "HR manager", note: "Edits data, prepares payroll" },
  { email: "owner@acme.test", role: "Owner", note: "Approves payroll" },
  { email: "viewer@acme.test", role: "Viewer", note: "Read-only, no payroll" },
];

export function LoginPage({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      setToken(res.token);
      onSignedIn(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <section className="login-art" aria-hidden>
        <div className="brand"><Logo /><span>ACME Pay</span></div>
        <h2>Pay people fairly,<br />and prove it.</h2>
        <p>Salaries, pay equity and payroll for every country, with an approval step before money moves.</p>
      </section>
      <main className="login-panel">
        <form onSubmit={submit} className="login-form">
          <h1 className="page-title">Sign in</h1>
          <p className="page-sub mb-4">Use one of the demo accounts below. All data is synthetic.</p>
          <label htmlFor="l-email" className="field-label">Email</label>
          <input id="l-email" className="form-control mb-3" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="l-pass" className="field-label">Password</label>
          <input id="l-pass" className="form-control mb-3" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
          <button className="btn btn-primary w-100" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>

          <div className="demo-list">
            <div className="field-label">Demo accounts (password: demo1234)</div>
            {DEMOS.map((d) => (
              <button type="button" key={d.email} className="demo-row" onClick={() => { setEmail(d.email); setPassword("demo1234"); }}>
                <span><strong>{d.role}</strong><span className="d-block small text-secondary">{d.note}</span></span>
                <code>{d.email}</code>
              </button>
            ))}
          </div>
        </form>
      </main>
    </div>
  );
}
