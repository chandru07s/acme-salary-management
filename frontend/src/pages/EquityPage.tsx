import { useEffect, useState } from "react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { PageHeader } from "../components/PageHeader";
import { RatioBadge } from "../components/RatioBadge";
import { formatMoney } from "../format";
import type { EquityBand, EquityReport, Meta } from "../types";

const PAGE_SIZE = 25;
const BANDS: { value: EquityBand | ""; label: string }[] = [
  { value: "below", label: "Below peers" },
  { value: "above", label: "Above peers" },
  { value: "within", label: "In range" },
  { value: "", label: "All" },
];

export function EquityPage() {
  const [band, setBand] = useState<EquityBand | "">("below");
  const [country, setCountry] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<EquityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.meta().then(setMeta).catch(() => undefined); }, []);
  useEffect(() => {
    setLoading(true);
    api.equity({ band: band || undefined, country, department, page, page_size: PAGE_SIZE })
      .then((r) => { setData(r); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [band, country, department, page]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const sm = data?.summary;
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader eyebrow="Pay equity" title="Who is paid fairly?"
        subtitle={<>Each salary is compared with the median for the same job title in the same country. A ratio of 1.00 is exactly at the median; under {sm?.thresholds.below ?? 0.85} is flagged.</>} />

      {sm && (
        <div className="kpis kpis-3">
          <Stat label="Below peers" value={sm.below} tone="below" onClick={() => reset(setBand)("below")} active={band === "below"} />
          <Stat label="In range" value={sm.within} tone="within" onClick={() => reset(setBand)("within")} active={band === "within"} />
          <Stat label="Above peers" value={sm.above} tone="above" onClick={() => reset(setBand)("above")} active={band === "above"} />
        </div>
      )}
      {sm && sm.unrated > 0 && (
        <p className="small text-secondary">{sm.unrated.toLocaleString()} people are not benchmarked because fewer than {sm.thresholds.min_peers} people share their job title and country.</p>
      )}

      <div className="card mb-3">
        <div className="filters filters-3">
          <div>
            <span className="field-label" id="eq-band">Show</span>
            <div className="segmented" role="group" aria-labelledby="eq-band">
              {BANDS.map((b) => (
                <button key={b.label} type="button" aria-pressed={band === b.value} onClick={() => reset(setBand)(b.value)}>{b.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="eq-country" className="field-label">Country</label>
            <select id="eq-country" className="form-select" value={country} onChange={(e) => reset(setCountry)(e.target.value)}>
              <option value="">All</option>
              {meta?.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="eq-dept" className="field-label">Department</label>
            <select id="eq-dept" className="form-select" value={department} onChange={(e) => reset(setDepartment)(e.target.value)}>
              <option value="">All</option>
              {meta?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <div className="card overflow-hidden">
        <div className="table-responsive">
          <table className="table data-table align-middle">
            <thead>
              <tr>
                <th scope="col">Employee</th><th scope="col">Job title</th><th scope="col" className="text-end">Salary</th>
                <th scope="col" className="text-end">Peer median</th><th scope="col">Compa-ratio</th>
                <th scope="col" className="text-end">Peers</th><th scope="col" className="text-end">Tenure</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading && data ? 0.6 : 1 }}>
              {!data && Array.from({ length: 8 }, (_, i) => (
                <tr key={i}>{Array.from({ length: 7 }, (_, j) => <td key={j}><div className="skel" style={{ width: "60%" }} /></td>)}</tr>
              ))}
              {data?.items.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => { window.location.hash = `#/employee/${r.id}`; }}>
                  <td>
                    <div className="person">
                      <Avatar name={r.full_name} />
                      <div>
                        <div className="person-name">{r.full_name}</div>
                        <div className="person-mail">{r.department} · {r.country_name}</div>
                      </div>
                    </div>
                  </td>
                  <td>{r.job_title}</td>
                  <td className="text-end salary">{formatMoney(r.salary, r.currency)}</td>
                  <td className="text-end">{r.peer_median !== null ? formatMoney(Math.round(r.peer_median), r.currency) : "–"}</td>
                  <td><RatioBadge ratio={r.compa_ratio} band={r.band} /></td>
                  <td className="text-end">{r.peers}</td>
                  <td className="text-end">{r.tenure_years} yrs</td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr><td colSpan={7}><div className="empty"><h2>Nobody here</h2>No employees match these filters.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span className="small text-secondary">{total.toLocaleString()} {total === 1 ? "person" : "people"} · page {page} of {lastPage}</span>
          <div className="pager d-flex" role="group" aria-label="Pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
            <button disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, onClick, active }: { label: string; value: number; tone: string; onClick: () => void; active: boolean }) {
  return (
    <button type="button" className={`kpi stat ${tone}${active ? " on" : ""}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value.toLocaleString()}</span>
    </button>
  );
}
