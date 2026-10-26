import { useEffect, useState } from "react";
import { api } from "../api";
import { RangeStrip } from "../components/RangeStrip";
import { formatUsdCompact } from "../format";
import type { GroupStats, Insights } from "../types";

type Group = "country" | "department" | "job_title";

const GROUPS: { value: Group; label: string }[] = [
  { value: "country", label: "Country" },
  { value: "department", label: "Department" },
  { value: "job_title", label: "Job title" },
];

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", DE: "Germany", IN: "India",
  CA: "Canada", AU: "Australia", SG: "Singapore", JP: "Japan",
};

export function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("country");

  useEffect(() => {
    api.insights().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!data) {
    return (
      <div className="progress" role="progressbar" aria-label="Loading insights">
        <div className="progress-bar progress-bar-striped progress-bar-animated w-100" />
      </div>
    );
  }

  const rows: GroupStats[] =
    group === "country" ? data.by_country : group === "department" ? data.by_department : data.by_job_title;
  const s = data.summary;
  const skew = s.median > 0 ? (s.avg - s.median) / s.median : 0;
  const maxBand = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <div className="d-grid gap-4">
      <div>
        <h1 className="page-title">How ACME pays</h1>
        <div className="text-secondary">Active employees only. Local salaries are converted to USD at fixed reference rates.</div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="row g-4">
            <Figure label="Employees" value={s.headcount.toLocaleString()} />
            <Figure label="Annual payroll" value={formatUsdCompact(s.total)} />
            <Figure label="Median salary" value={formatUsdCompact(s.median)} />
            <Figure label="Average salary" value={formatUsdCompact(s.avg)} />
          </div>
          {s.headcount > 0 && (
            <p className="text-secondary mt-3 mb-0">
              {Math.abs(skew) < 0.05
                ? "The average and median are close, so pay is fairly evenly spread."
                : skew > 0
                  ? `The average is ${Math.round(skew * 100)}% above the median: a smaller group of high salaries pulls it up. Use the median for what a typical person earns.`
                  : `The average is ${Math.round(-skew * 100)}% below the median.`}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
            <div>
              <h2 className="fs-5 fw-semibold mb-1">Pay range by group</h2>
              <Legend />
            </div>
            <div className="btn-group" role="group" aria-label="Group by">
              {GROUPS.map((g) => (
                <button key={g.value} type="button" aria-pressed={group === g.value}
                  className={`btn btn-sm ${group === g.value ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setGroup(g.value)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="text-secondary mb-0">No active employees yet. Add people in the Directory to see pay ranges.</p>
          ) : (
            <RangeStrip rows={rows} labelFor={group === "country" ? (k) => COUNTRY_NAMES[k] ?? k : undefined} />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="fs-5 fw-semibold mb-3">Salary bands (USD)</h2>
          <div className="d-grid gap-2">
            {data.distribution.map((b) => (
              <div key={b.label} className="row align-items-center g-2">
                <div className="col-3 col-md-2 small">{b.label}</div>
                <div className="col">
                  <div className="band-bar"><div style={{ width: `${(b.count / maxBand) * 100}%` }} /></div>
                </div>
                <div className="col-4 col-md-2 text-end small">
                  {b.count.toLocaleString()} ({s.headcount ? Math.round((b.count / s.headcount) * 100) : 0}%)
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-6 col-md-3">
      <div className="small text-secondary">{label}</div>
      <div className="figure-value">{value}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="d-flex flex-wrap gap-3 small text-secondary" aria-label="Legend">
      <span className="d-inline-flex align-items-center gap-1">
        <span className="legend-swatch rounded-1" style={{ width: 18, height: 10, background: "var(--range-fill)" }} /> Lowest to highest
      </span>
      <span className="d-inline-flex align-items-center gap-1">
        <span className="legend-swatch rounded-1" style={{ width: 3, height: 14, background: "var(--amber)" }} /> Median
      </span>
      <span className="d-inline-flex align-items-center gap-1">
        <span className="legend-swatch rounded-circle" style={{ width: 10, height: 10, background: "var(--ink)" }} /> Average
      </span>
    </div>
  );
}
