import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { IconDownload } from "../components/Icons";
import { RunStatusPill } from "../components/RunStatus";
import { formatMoney, formatMonth, formatUsdCompact } from "../format";
import type { PayrollRunDetail, PayslipPage } from "../types";

const PAGE_SIZE = 25;
const STEPS = [
  { key: "draft", label: "Prepared" },
  { key: "pending_approval", label: "Sent for approval" },
  { key: "approved", label: "Approved" },
] as const;
const ACTION_LABEL: Record<string, string> = {
  created: "Prepared", regenerated: "Rebuilt", submitted: "Sent for approval", approved: "Approved", rejected: "Sent back",
};

export function PayrollRunPage({ id }: { id: number }) {
  const { user } = useAuth();
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [slips, setSlips] = useState<PayslipPage | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const loadRun = useCallback(() => api.run(id).then(setRun).catch((e: Error) => setError(e.message)), [id]);
  const loadSlips = useCallback(
    () => api.runPayslips(id, { q: q.trim() || undefined, page, page_size: PAGE_SIZE }).then(setSlips).catch((e: Error) => setError(e.message)),
    [id, q, page],
  );
  useEffect(() => { void loadRun(); }, [loadRun]);
  useEffect(() => { void loadSlips(); }, [loadSlips]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      await Promise.all([loadRun(), loadSlips()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const back = <a href="#/payroll" className="back-link">← All payroll runs</a>;
  if (!run) return <div>{back}{error ? <div className="alert alert-danger" role="alert">{error}</div> : <div className="skel" style={{ height: 240, borderRadius: 14 }} />}</div>;

  const draft = run.status === "draft";
  const canPrepare = can.preparePayroll(user.role);
  const canApprove = can.approvePayroll(user.role);
  const stepIndex = STEPS.findIndex((s) => s.key === run.status);
  const total = slips?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {back}
      <header className="page-header">
        <div>
          <div className="eyebrow">Payroll run</div>
          <h1 className="page-title">{formatMonth(run.month)}</h1>
          <div className="page-sub d-flex align-items-center gap-2 flex-wrap"><RunStatusPill status={run.status} /> prepared by {run.created_by}</div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          {canPrepare && draft && (
            <>
              <button className="btn btn-light-line" disabled={busy} onClick={() => act(() => api.runAction(id, "regenerate"))}>Rebuild from current data</button>
              <button className="btn btn-light-line text-danger" disabled={busy}
                onClick={() => { if (window.confirm(`Delete the ${formatMonth(run.month)} draft?`)) void act(() => api.deleteRun(id), () => { window.location.hash = "#/payroll"; }); }}>Delete draft</button>
              <button className="btn btn-primary" disabled={busy || run.headcount === 0} onClick={() => act(() => api.runAction(id, "submit"))}>Send for approval</button>
            </>
          )}
          {canApprove && run.status === "pending_approval" && !rejecting && (
            <>
              <button className="btn btn-light-line" disabled={busy} onClick={() => setRejecting(true)}>Send back</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api.runAction(id, "approve"))}>Approve payroll</button>
            </>
          )}
        </div>
      </header>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {run.reject_note && draft && (
        <div className="callout warn mb-3" role="status"><div><strong>Sent back by the owner:</strong> {run.reject_note}</div></div>
      )}
      {rejecting && (
        <form className="card composer mb-3" onSubmit={(e) => { e.preventDefault(); void act(() => api.rejectRun(id, note), () => { setRejecting(false); setNote(""); }); }}>
          <label htmlFor="rj" className="field-label">Why is this being sent back?</label>
          <div className="composer-box">
            <input id="rj" className="form-control" value={note} maxLength={300} autoFocus onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || !note.trim()}>Send back</button>
            <button type="button" className="btn btn-light-line" onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        </form>
      )}

      <ol className="stepper" aria-label="Approval progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i < stepIndex || run.status === "approved" ? "done" : i === stepIndex ? "now" : ""}>
            <span className="dot" aria-hidden>{i < stepIndex || run.status === "approved" ? "✓" : i + 1}</span>{s.label}
          </li>
        ))}
      </ol>

      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Employees paid</div><div className="kpi-value">{run.headcount.toLocaleString()}</div></div>
        <div className="kpi"><div className="kpi-label">Gross pay</div><div className="kpi-value">{formatUsdCompact(run.gross_usd)}</div><div className="kpi-sub">in USD</div></div>
        <div className="kpi"><div className="kpi-label">Deductions</div><div className="kpi-value">{formatUsdCompact(run.deductions_usd)}</div><div className="kpi-sub">retirement and tax, net of reimbursements</div></div>
        <div className="kpi"><div className="kpi-label">Net pay</div><div className="kpi-value">{formatUsdCompact(run.net_usd)}</div><div className="kpi-sub">to be paid out</div></div>
      </div>

      <div className="card overflow-hidden mb-3">
        <div className="filters filters-1">
          <div>
            <label htmlFor="ps-q" className="field-label">Find a payslip</label>
            <input id="ps-q" className="form-control" placeholder="Name, job title or department" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="table-responsive">
          <table className="table data-table align-middle">
            <thead>
              <tr>
                <th scope="col">Employee</th><th scope="col" className="text-end">Basic</th><th scope="col" className="text-end">HRA</th>
                <th scope="col" className="text-end">Special</th><th scope="col" className="text-end">Gross</th>
                <th scope="col" className="text-end">Deductions</th><th scope="col" className="text-end">Net pay</th><th scope="col"><span className="visually-hidden">PDF</span></th>
              </tr>
            </thead>
            <tbody>
              {!slips && Array.from({ length: 6 }, (_, i) => <tr key={i}>{Array.from({ length: 8 }, (_, j) => <td key={j}><div className="skel" style={{ width: "60%" }} /></td>)}</tr>)}
              {slips?.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a href={`#/employee/${p.employee_id}`} className="person-name text-reset text-decoration-none">{p.full_name}</a>
                    <div className="person-mail">{p.job_title}{p.proration < 1 ? ` · prorated ${Math.round(p.proration * 100)}%` : ""}</div>
                  </td>
                  <td className="text-end">{formatMoney(p.basic, p.currency)}</td>
                  <td className="text-end">{formatMoney(p.hra, p.currency)}</td>
                  <td className="text-end">{formatMoney(p.special, p.currency)}</td>
                  <td className="text-end">{formatMoney(p.gross, p.currency)}</td>
                  <td className="text-end text-secondary">{formatMoney(p.retirement + p.tax, p.currency)}</td>
                  <td className="text-end salary">{formatMoney(p.net, p.currency)}</td>
                  <td className="text-end">
                    <button className="btn btn-light-line btn-sm" aria-label={`Download payslip for ${p.full_name}`}
                      onClick={() => act(() => api.downloadPayslip(p.id))}><IconDownload /> PDF</button>
                  </td>
                </tr>
              ))}
              {slips && slips.items.length === 0 && <tr><td colSpan={8}><div className="empty"><h2>No payslips</h2>Nothing matches that search.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span className="small text-secondary">{total.toLocaleString()} payslips · page {page} of {lastPage}</span>
          <div className="pager d-flex" role="group" aria-label="Pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
            <button disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
          </div>
        </div>
      </div>

      <section className="panel" aria-labelledby="h-audit">
        <h2 className="chart-title" id="h-audit">Audit trail</h2>
        <p className="chart-sub">Who did what, newest first.</p>
        <ol className="timeline">
          {run.events.map((e, i) => (
            <li key={i}>
              <div className="d-flex justify-content-between gap-3 flex-wrap">
                <strong>{ACTION_LABEL[e.action] ?? e.action}</strong>
                <span className="text-secondary small">{new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <div className="small text-secondary">{e.actor}{e.note ? ` · ${e.note}` : ""}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
