import { useEffect, useState } from "react";
import { api } from "../api";
import { can, useAuth } from "../auth";
import { PageHeader } from "../components/PageHeader";
import type { FxRate, PayConfig } from "../types";

export function SettingsPage({ onDataChanged }: { onDataChanged: () => void }) {
  const { user } = useAuth();
  const editable = can.editData(user.role);
  const [rates, setRates] = useState<FxRate[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.fxRates().then(setRates).catch((e: Error) => setError(e.message));
  }, []);

  const apply = (next: FxRate[], message: string) => {
    setRates(next);
    setDrafts({});
    setError(null);
    setNotice(message);
    onDataChanged();
  };

  const save = async (r: FxRate) => {
    const value = Number(drafts[r.currency]);
    if (!Number.isFinite(value) || value <= 0 || value > 1000) {
      setError(`${r.currency}: enter a number greater than 0 and at most 1000.`);
      return;
    }
    setBusy(r.currency);
    try {
      apply(await api.setFxRate(r.currency, value), `${r.currency} rate saved. Every USD figure now uses it.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      apply(await api.resetFxRates(), "All rates are back to the defaults.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader eyebrow="Settings" title="Exchange rates"
        subtitle="Salaries are stored in local currency. These rates convert them to USD for comparisons, insights and the AI analyst."
        actions={editable ? <button className="btn btn-light-line" onClick={reset} disabled={busy !== null}>Reset to defaults</button> : undefined} />

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && !error && <div className="callout info mb-3" role="status">{notice}</div>}

      <div className="card overflow-hidden">
        <table className="table data-table align-middle">
          <thead>
            <tr><th scope="col">Currency</th><th scope="col">Used by</th><th scope="col" className="text-end">1 unit = USD</th><th scope="col" className="text-end">Default</th><th scope="col" /></tr>
          </thead>
          <tbody>
            {!rates && Array.from({ length: 6 }, (_, i) => <tr key={i}>{Array.from({ length: 5 }, (_, j) => <td key={j}><div className="skel" style={{ width: "60%" }} /></td>)}</tr>)}
            {rates?.map((r) => {
              const draft = drafts[r.currency];
              const changed = draft !== undefined && Number(draft) !== r.to_usd;
              return (
                <tr key={r.currency}>
                  <th scope="row"><span className="fw-semibold">{r.currency}</span></th>
                  <td className="text-secondary">{r.countries.join(", ")}</td>
                  <td className="text-end">
                    {r.editable && editable ? (
                      <input aria-label={`${r.currency} to USD`} className="form-control form-control-sm text-end ms-auto" style={{ width: 120 }}
                        inputMode="decimal" value={draft ?? String(r.to_usd)}
                        onChange={(e) => setDrafts({ ...drafts, [r.currency]: e.target.value })} />
                    ) : <span className={r.editable ? "" : "text-secondary"}>{r.editable ? r.to_usd : "1 (fixed)"}</span>}
                  </td>
                  <td className="text-end text-secondary">{r.default}</td>
                  <td className="text-end">
                    {r.editable && editable && <button className="btn btn-primary btn-sm" disabled={!changed || busy !== null} onClick={() => save(r)}>
                      {busy === r.currency ? "Saving…" : "Save"}
                    </button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!editable && <p className="small text-secondary mt-2">Only an HR manager can change these.</p>}
      <p className="small text-secondary mt-3">
        Rates are fixed reference values, not live market data. Changing one re-prices every salary in that currency in USD; local salaries never change.
      </p>
      <PayConfigCard editable={editable} onDataChanged={onDataChanged} />
    </div>
  );
}

const CONFIG_FIELDS: { key: keyof Omit<PayConfig, "limits">; label: string; help: string }[] = [
  { key: "basic_pct", label: "Basic pay", help: "% of monthly gross" },
  { key: "hra_pct_of_basic", label: "House rent allowance (HRA)", help: "% of Basic pay" },
  { key: "retirement_pct", label: "Retirement contribution", help: "% of Basic pay, deducted" },
  { key: "tax_pct", label: "Income tax withholding", help: "% of gross, deducted" },
];

function PayConfigCard({ editable, onDataChanged }: { editable: boolean; onDataChanged: () => void }) {
  const [cfg, setCfg] = useState<PayConfig | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.payConfig().then(setCfg).catch((e: Error) => setError(e.message)); }, []);

  const save = async () => {
    const values: Record<string, number> = {};
    for (const f of CONFIG_FIELDS) {
      const raw = drafts[f.key];
      if (raw === undefined) continue;
      const n = Number(raw);
      const [lo, hi] = cfg!.limits[f.key];
      if (!Number.isFinite(n) || n < lo || n > hi) { setError(`${f.label}: enter a number from ${lo} to ${hi}.`); return; }
      values[f.key] = n;
    }
    setBusy(true);
    setError(null);
    try {
      setCfg(await api.setPayConfig(values));
      setDrafts({});
      setNotice("Saved. New payroll runs and pay breakdowns use these rates; approved runs never change.");
      onDataChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-4 overflow-hidden" aria-labelledby="h-cfg">
      <div className="panel border-0 shadow-none">
        <h2 className="chart-title" id="h-cfg">Pay structure and deductions</h2>
        <p className="chart-sub">These flat rates drive the pay breakdown and payroll. They are illustrative, not statutory EPF, ESI, PT or TDS rules.</p>
        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
        {notice && !error && <div className="callout info mb-3" role="status">{notice}</div>}
        <div className="cfg-grid">
          {CONFIG_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`cfg-${f.key}`} className="field-label">{f.label}</label>
              <div className="input-group">
                <input id={`cfg-${f.key}`} className="form-control" inputMode="decimal" disabled={!editable || !cfg}
                  value={drafts[f.key] ?? (cfg ? String(cfg[f.key]) : "")} onChange={(e) => setDrafts({ ...drafts, [f.key]: e.target.value })} />
                <span className="input-group-text">%</span>
              </div>
              <div className="form-text">{f.help}</div>
            </div>
          ))}
        </div>
        <p className="small text-secondary mt-3 mb-0">Special allowance is whatever remains of the gross after Basic and HRA.</p>
        {editable && <button className="btn btn-primary mt-3" disabled={busy || Object.keys(drafts).length === 0} onClick={save}>{busy ? "Saving…" : "Save rates"}</button>}
      </div>
    </section>
  );
}
