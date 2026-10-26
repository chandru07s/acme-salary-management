import { useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import type { FxRate } from "../types";

export function SettingsPage({ onDataChanged }: { onDataChanged: () => void }) {
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
        actions={<button className="btn btn-light-line" onClick={reset} disabled={busy !== null}>Reset to defaults</button>} />

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
                    {r.editable ? (
                      <input aria-label={`${r.currency} to USD`} className="form-control form-control-sm text-end ms-auto" style={{ width: 120 }}
                        inputMode="decimal" value={draft ?? String(r.to_usd)}
                        onChange={(e) => setDrafts({ ...drafts, [r.currency]: e.target.value })} />
                    ) : <span className="text-secondary">1 (fixed)</span>}
                  </td>
                  <td className="text-end text-secondary">{r.default}</td>
                  <td className="text-end">
                    {r.editable && <button className="btn btn-primary btn-sm" disabled={!changed || busy !== null} onClick={() => save(r)}>
                      {busy === r.currency ? "Saving…" : "Save"}
                    </button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small text-secondary mt-3">
        Rates are fixed reference values, not live market data. Changing one re-prices every salary in that currency in USD; local salaries never change.
      </p>
    </div>
  );
}
