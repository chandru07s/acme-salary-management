import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { formatMoney, formatMonth } from "../format";
import type { PayslipRow, Structure, VariableKind, VariablePayItem } from "../types";
import { IconDownload } from "./Icons";
import { RunStatusPill } from "./RunStatus";

const KIND_LABEL: Record<VariableKind, string> = { bonus: "Bonus", incentive: "Incentive", reimbursement: "Reimbursement" };

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Basic / HRA / Special split of the salary, with a stacked bar. */
export function StructurePanel({ id, version }: { id: number; version: number }) {
  const [s, setS] = useState<Structure | null>(null);
  useEffect(() => { api.structure(id).then(setS).catch(() => setS(null)); }, [id, version]);
  if (!s) return null;
  const parts = [
    { key: "basic", label: "Basic pay", value: s.monthly.basic, color: "#256abf" },
    { key: "hra", label: "House rent allowance", value: s.monthly.hra, color: "#5b9ae0" },
    { key: "special", label: "Special allowance", value: s.monthly.special, color: "#a9c8ef" },
  ] as const;
  return (
    <section className="panel" aria-labelledby="h-struct">
      <h2 className="chart-title" id="h-struct">Pay structure</h2>
      <p className="chart-sub">How the monthly gross of {formatMoney(s.monthly.gross, s.currency)} is made up. Rates are set in Settings.</p>
      <div className="stack" role="img" aria-label={parts.map((p) => `${p.label} ${formatMoney(p.value, s.currency)}`).join(", ")}>
        {parts.map((p) => <span key={p.key} style={{ width: `${(p.value / s.monthly.gross) * 100}%`, background: p.color }} />)}
      </div>
      <table className="table mini-table mb-0 mt-2">
        <thead><tr><th scope="col">Component</th><th scope="col" className="text-end">Per month</th><th scope="col" className="text-end">Per year</th></tr></thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.key}>
              <th scope="row"><span className="swatch" style={{ background: p.color }} aria-hidden />{p.label}</th>
              <td className="text-end">{formatMoney(p.value, s.currency)}</td>
              <td className="text-end">{formatMoney(s.annual[p.key], s.currency)}</td>
            </tr>
          ))}
          <tr><th scope="row">Gross</th><td className="text-end fw-semibold">{formatMoney(s.monthly.gross, s.currency)}</td><td className="text-end fw-semibold">{formatMoney(s.annual.gross, s.currency)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

export function VariablePayPanel({ id, currency }: { id: number; currency: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<VariablePayItem[] | null>(null);
  const [kind, setKind] = useState<VariableKind>("bonus");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.variablePay(id).then(setItems).catch((e: Error) => setError(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) { setError("Enter a whole amount greater than 0."); return; }
    setBusy(true);
    setError(null);
    try {
      await api.addVariablePay(id, { kind, amount: n, month, note: note.trim() || undefined });
      setAmount(""); setNote("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (itemId: number) => {
    setError(null);
    try { await api.deleteVariablePay(itemId); await load(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <section className="panel" aria-labelledby="h-var">
      <h2 className="chart-title" id="h-var">Bonuses and reimbursements</h2>
      <p className="chart-sub">Bonuses and incentives are taxed and added to gross. Reimbursements are paid on top, untaxed. Items land on the payslip for their month.</p>
      {can.editData(user.role) && (
        <form className="var-form" onSubmit={add}>
          <div><label htmlFor="v-kind" className="field-label">Type</label>
            <select id="v-kind" className="form-select" value={kind} onChange={(e) => setKind(e.target.value as VariableKind)}>
              {(Object.keys(KIND_LABEL) as VariableKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select></div>
          <div><label htmlFor="v-amt" className="field-label">Amount ({currency})</label>
            <input id="v-amt" className="form-control" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label htmlFor="v-month" className="field-label">Paid in</label>
            <input id="v-month" type="month" className="form-control" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          <div className="var-note"><label htmlFor="v-note" className="field-label">Note</label>
            <input id="v-note" className="form-control" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={busy}>Add</button>
        </form>
      )}
      {error && <div className="alert alert-danger py-2 mt-2 mb-0" role="alert">{error}</div>}
      {items && items.length === 0 && <div className="text-secondary mt-2">Nothing added yet.</div>}
      {items && items.length > 0 && (
        <ul className="feed mt-2">
          {items.map((v) => (
            <li key={v.id} className="feed-link">
              <span className="flex-grow-1">
                <span className="person-name d-block">{KIND_LABEL[v.kind]} · {formatMoney(v.amount, currency)}</span>
                <span className="person-mail">{formatMonth(v.month)}{v.note ? ` · ${v.note}` : ""} · added by {v.created_by}</span>
              </span>
              {can.editData(user.role) && <button className="btn btn-light-line btn-sm" onClick={() => remove(v.id)} aria-label={`Remove ${KIND_LABEL[v.kind]} ${v.month}`}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PayslipsPanel({ id }: { id: number }) {
  const [rows, setRows] = useState<PayslipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.employeePayslips(id).then(setRows).catch((e: Error) => setError(e.message)); }, [id]);
  return (
    <section className="panel" aria-labelledby="h-slips">
      <h2 className="chart-title" id="h-slips">Payslips</h2>
      <p className="chart-sub">One per payroll run. Download a PDF for any month.</p>
      {error && <div className="alert alert-danger py-2 mb-0" role="alert">{error}</div>}
      {rows && rows.length === 0 && <div className="text-secondary">No payslips yet. They appear when HR prepares a payroll run.</div>}
      {rows && rows.length > 0 && (
        <ul className="feed">
          {rows.map((r) => (
            <li key={r.id} className="feed-link">
              <span className="flex-grow-1">
                <span className="person-name d-block">{formatMonth(r.month ?? "")}</span>
                <span className="person-mail">Net {formatMoney(r.net, r.currency)}</span>
              </span>
              {r.status && <RunStatusPill status={r.status} />}
              <button className="btn btn-light-line btn-sm" onClick={() => api.downloadPayslip(r.id).catch((e: Error) => setError(e.message))}><IconDownload /> PDF</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
