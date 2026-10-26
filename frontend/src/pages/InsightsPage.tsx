import { useEffect, useState } from "react";
import { api } from "../api";
import { colorForKey, formatPct, payrollShares, topByMedian } from "../chartData";
import { BandColumns, MedianBars, PayrollShareBar } from "../components/Charts";
import { formatUsdCompact } from "../format";
import type { GroupStats, Insights } from "../types";

type Group = "country" | "department" | "job_title";

const GROUPS: { value: Group; label: string; noun: string }[] = [
  { value: "country", label: "Country", noun: "country" },
  { value: "department", label: "Department", noun: "department" },
  { value: "job_title", label: "Job title", noun: "job title" },
];

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", DE: "Germany", IN: "India",
  CA: "Canada", AU: "Australia", SG: "Singapore", JP: "Japan",
};

const MAX_BARS = 12;

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
  const noun = GROUPS.find((g) => g.value === group)!.noun;
  const labelFor = group === "country" ? (k: string) => COUNTRY_NAMES[k] ?? k : (k: string) => k;

  const s = data.summary;
  const skew = s.median > 0 ? (s.avg - s.median) / s.median : 0;
  const { shown, hidden } = topByMedian(rows, MAX_BARS);
  // Part-to-whole needs a small, stable set of parts; 24 job titles would just be noise.
  const showShare = group !== "job_title";
  const shares = showShare ? payrollShares(rows) : [];
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const allKeys = rows.map((r) => r.key);

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

      {/* One filter row above everything it scopes */}
      <div className="d-flex flex-wrap align-items-center gap-3">
        <span className="fw-medium" id="group-label">Group by</span>
        <div className="btn-group" role="group" aria-labelledby="group-label">
          {GROUPS.map((g) => (
            <button key={g.value} type="button" aria-pressed={group === g.value}
              className={`btn btn-sm ${group === g.value ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setGroup(g.value)}>
              {g.label}
            </button>
          ))}
        </div>
        <span className="small text-secondary">Applies to the charts and table below.</span>
      </div>

      {rows.length === 0 ? (
        <div className="card"><div className="card-body text-secondary">
          No active employees yet. Add people in the Directory to see pay insights.
        </div></div>
      ) : (
        <>
          <section className="card" aria-labelledby="h-median">
            <div className="card-body">
              <h2 className="chart-title" id="h-median">Median salary by {noun}</h2>
              <p className="chart-sub">Annual salary in USD. Hover a bar for headcount, average and range.</p>
              <MedianBars rows={shown} labelFor={labelFor} />
              {hidden > 0 && <p className="chart-sub mt-2 mb-0">Showing the top {MAX_BARS} of {rows.length}. All are in the table below.</p>}
            </div>
          </section>

          {showShare && shares.length > 0 && (
            <section className="card" aria-labelledby="h-share">
              <div className="card-body">
                <h2 className="chart-title" id="h-share">Share of annual payroll by {noun}</h2>
                <p className="chart-sub">Where the payroll budget goes. Hover a segment for the amount.</p>
                <PayrollShareBar shares={shares} labelFor={labelFor} />
              </div>
            </section>
          )}

          <section className="card" aria-labelledby="h-bands">
            <div className="card-body">
              <h2 className="chart-title" id="h-bands">How many people earn in each band</h2>
              <p className="chart-sub">Employees per annual salary band, in USD.</p>
              <BandColumns bands={data.distribution} headcount={s.headcount} />
            </div>
          </section>

          <section className="card" aria-labelledby="h-table">
            <div className="card-body">
              <h2 className="chart-title" id="h-table">Details by {noun}</h2>
              <p className="chart-sub">The exact numbers behind the charts, in USD.</p>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">{GROUPS.find((g) => g.value === group)!.label}</th>
                      <th scope="col" className="text-end">People</th>
                      <th scope="col" className="text-end">Median</th>
                      <th scope="col" className="text-end">Average</th>
                      <th scope="col" className="text-end">Lowest</th>
                      <th scope="col" className="text-end">Highest</th>
                      <th scope="col" className="text-end" title="Highest minus lowest, as a percentage of the median">Spread</th>
                      <th scope="col" className="text-end">Share of payroll</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].sort((a, b) => b.median - a.median).map((r) => {
                      const swatch = showShare ? colorForKey(r.key, allKeys) : null;
                      return (
                        <tr key={r.key}>
                          <th scope="row" className="fw-medium">
                            {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden />}
                            {labelFor(r.key)}
                          </th>
                          <td className="text-end">{r.headcount.toLocaleString()}</td>
                          <td className="text-end fw-medium">{formatUsdCompact(r.median)}</td>
                          <td className="text-end">{formatUsdCompact(r.avg)}</td>
                          <td className="text-end">{formatUsdCompact(r.min)}</td>
                          <td className="text-end">{formatUsdCompact(r.max)}</td>
                          <td className="text-end text-secondary">{Math.round(r.spread_pct)}%</td>
                          <td className="text-end">{grandTotal ? formatPct((r.total / grandTotal) * 100) : "0%"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
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
