import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { EmployeeDialog } from "../components/EmployeeDialog";
import { RatioBadge, bandLabel } from "../components/RatioBadge";
import { formatDate, formatMoney, formatUsdCompact } from "../format";
import type { Employee, Meta, Position, SalaryChange } from "../types";

export function EmployeePage({ id, onDataChanged }: { id: number; onDataChanged: () => void }) {
  const [emp, setEmp] = useState<Employee | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const [history, setHistory] = useState<SalaryChange[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api.employee(id).then((e) => { setEmp(e); setError(null); }).catch((e: Error) => setError(e.message));
    api.position(id).then(setPos).catch(() => setPos(null));
    api.history(id).then(setHistory).catch(() => setHistory([]));
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => { api.meta().then(setMeta).catch(() => undefined); }, []);

  const back = (
    <a href="#/employees" className="back-link">← All employees</a>
  );

  if (error) return <div>{back}<div className="alert alert-danger mt-3" role="alert">{error}</div></div>;
  if (!emp) return <div role="status" aria-label="Loading employee"><div className="skel" style={{ height: 260, borderRadius: 14 }} /></div>;

  const gap = pos?.peer_median ? emp.salary - pos.peer_median : null;

  return (
    <div>
      {back}
      <header className="profile-head">
        <Avatar name={emp.full_name} size={72} />
        <div className="flex-grow-1">
          <h1 className="page-title">{emp.full_name}</h1>
          <div className="page-sub">{emp.job_title} · {emp.department}</div>
          <div className="person-mail mt-1">{emp.email}</div>
        </div>
        <div className="d-flex gap-2 align-items-start">
          <span className={`status ${emp.status}`}>{emp.status === "active" ? "Active" : "Terminated"}</span>
          <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Annual salary</div>
          <div className="kpi-value">{formatMoney(emp.salary, emp.currency)}</div>
          <div className="kpi-sub">{emp.currency === "USD" ? "paid in USD" : `≈ ${formatUsdCompact(emp.salary_usd)} USD`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Compa-ratio</div>
          <div className="mt-2"><RatioBadge ratio={pos?.compa_ratio ?? null} band={pos?.band ?? null} /></div>
          <div className="kpi-sub mt-1">{pos?.band ? bandLabel(pos.band) : "Needs 3+ peers"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Peer median</div>
          <div className="kpi-value">{pos?.peer_median ? formatMoney(Math.round(pos.peer_median), emp.currency) : "–"}</div>
          <div className="kpi-sub">
            {pos ? `${pos.peers} ${emp.job_title} in this country` : ""}
            {gap !== null && ` · you are ${gap >= 0 ? "+" : "−"}${formatMoney(Math.abs(Math.round(gap)), emp.currency)}`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tenure</div>
          <div className="kpi-value">{pos ? `${pos.tenure_years} yrs` : "–"}</div>
          <div className="kpi-sub">hired {formatDate(emp.hire_date)}</div>
        </div>
      </div>

      <section className="panel" aria-labelledby="h-hist">
        <h2 className="chart-title" id="h-hist">Salary history</h2>
        <p className="chart-sub">Every change is recorded with its reason.</p>
        {history.length > 1 && <HistoryLine history={history} currency={emp.currency} />}
        <ol className="timeline">
          {history.map((h) => (
            <li key={h.id}>
              <div className="d-flex justify-content-between gap-3 flex-wrap">
                <strong>
                  {h.old_salary !== null && <><span className="text-secondary fw-normal">{formatMoney(h.old_salary, emp.currency)} → </span></>}
                  {formatMoney(h.new_salary, emp.currency)}
                </strong>
                <span className="text-secondary small">{formatDate(h.changed_at.slice(0, 10))}</span>
              </div>
              <div className="small text-secondary">{h.reason ?? (h.old_salary === null ? "Initial salary" : "No reason recorded")}</div>
            </li>
          ))}
        </ol>
      </section>

      {editing && meta && (
        <EmployeeDialog employee={emp} meta={meta} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); onDataChanged(); }} />
      )}
    </div>
  );
}

function HistoryLine({ history, currency }: { history: SalaryChange[]; currency: string }) {
  const pts = [...history].reverse().map((h) => h.new_salary);
  const w = 640, h = 120, pad = 14;
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const span = hi - lo || 1;
  const xy = pts.map((v, i) => [pad + (i / (pts.length - 1)) * (w - 2 * pad), h - pad - ((v - lo) / span) * (h - 2 * pad)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="history-line" role="img"
      aria-label={`Salary moved from ${formatMoney(pts[0], currency)} to ${formatMoney(pts[pts.length - 1], currency)} over ${pts.length} entries`}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 5 : 3.5} fill="#fff" stroke="var(--accent)" strokeWidth="2" />)}
    </svg>
  );
}
