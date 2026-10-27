import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { IconPlus } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { RunStatusPill } from "../components/RunStatus";
import { formatMonth, formatUsdCompact } from "../format";
import type { PayrollRun } from "../types";

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PayrollPage() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<PayrollRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(lastMonth());
  const [busy, setBusy] = useState(false);

  const load = () => api.runs().then(setRuns).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const run = await api.createRun(month);
      window.location.hash = `#/payroll/${run.id}`;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pending = runs?.filter((r) => r.status === "pending_approval").length ?? 0;

  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Monthly payroll"
        subtitle="Each month is prepared by HR, then approved by the owner before it is final. Approved runs are locked." />

      {can.approvePayroll(user.role) && pending > 0 && (
        <div className="callout warn mb-3" role="status">
          <div><strong>{pending} {pending === 1 ? "run is" : "runs are"} waiting for your approval.</strong> Open it below to review the numbers.</div>
        </div>
      )}

      {can.preparePayroll(user.role) && (
        <form className="card composer mb-3" onSubmit={create}>
          <div className="d-flex flex-wrap align-items-end gap-3">
            <div>
              <label htmlFor="run-month" className="field-label">Month</label>
              <input id="run-month" type="month" className="form-control" value={month} required
                onChange={(e) => setMonth(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={busy || !month}><IconPlus /> {busy ? "Preparing…" : "Prepare payroll"}</button>
            <span className="small text-secondary">Builds a payslip for every active employee from current salaries, bonuses and rates.</span>
          </div>
        </form>
      )}

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <div className="card overflow-hidden">
        <div className="table-responsive">
          <table className="table data-table align-middle">
            <thead>
              <tr>
                <th scope="col">Month</th><th scope="col">Status</th><th scope="col" className="text-end">Employees</th>
                <th scope="col" className="text-end">Gross (USD)</th><th scope="col" className="text-end">Net (USD)</th>
                <th scope="col">Prepared by</th>
              </tr>
            </thead>
            <tbody>
              {!runs && Array.from({ length: 3 }, (_, i) => <tr key={i}>{Array.from({ length: 6 }, (_, j) => <td key={j}><div className="skel" style={{ width: "60%" }} /></td>)}</tr>)}
              {runs?.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => { window.location.hash = `#/payroll/${r.id}`; }}>
                  <th scope="row"><a href={`#/payroll/${r.id}`} className="text-reset text-decoration-none">{formatMonth(r.month)}</a></th>
                  <td><RunStatusPill status={r.status} /></td>
                  <td className="text-end">{r.headcount.toLocaleString()}</td>
                  <td className="text-end">{formatUsdCompact(r.gross_usd)}</td>
                  <td className="text-end salary">{formatUsdCompact(r.net_usd)}</td>
                  <td className="text-secondary">{r.created_by}</td>
                </tr>
              ))}
              {runs?.length === 0 && (
                <tr><td colSpan={6}><div className="empty"><h2>No payroll yet</h2>Prepare the first month above.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
