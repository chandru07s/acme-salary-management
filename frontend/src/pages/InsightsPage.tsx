import { useEffect, useState } from "react";
import { api } from "../api";
import { colorForKey, formatPct, payrollShares, topByMedian } from "../chartData";
import { PageHeader } from "../components/PageHeader";
import { BandColumns, MedianBars, PayrollShareBar } from "../components/Charts";
import { formatUsdCompact } from "../format";
import type { Band, GroupStats, Insights } from "../types";

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
      <div role="status" aria-label="Loading insights">
        <div className="skel mb-3" style={{ height: 220, borderRadius: 18 }} />
        <div className="skel" style={{ height: 320, borderRadius: 14 }} />
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

  const top = [...rows].sort((x, y) => y.median - x.median)[0];
  const medianBand = data.distribution.findIndex((b) => s.median >= b.min && (b.max === null || s.median < b.max));
  const maxCount = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="How ACME pays"
        subtitle="Active employees only. Local salaries are converted to USD at fixed reference rates."
      />

      <section className="hero" aria-label="Typical salary">
        <div>
          <div className="hero-label">Median annual salary</div>
          <div className="hero-value">{formatUsdCompact(s.median)}</div>
          <div className="hero-note">
            {s.headcount === 0
              ? "No active employees yet."
              : Math.abs(skew) < 0.05
                ? "The average and median are close, so pay is fairly evenly spread."
                : skew > 0
                  ? `The average is ${Math.round(skew * 100)}% above the median: a smaller group of high salaries pulls it up. Use the median for what a typical person earns.`
                  : `The average is ${Math.round(-skew * 100)}% below the median.`}
          </div>
        </div>
        <div aria-hidden>
          <div className="hero-bars">
            {data.distribution.map((b: Band, i: number) => (
              <div key={b.label} className={`col${i === medianBand ? " hot" : ""}`}
                style={{ height: `${Math.max(4, (b.count / maxCount) * 100)}%`, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <div className="hero-axis"><span>Lower pay</span><span>People per salary band</span><span>Higher pay</span></div>
        </div>
      </section>

      <div className="kpis">
        <Figure label="Employees" value={s.headcount.toLocaleString()} sub="active today" />
        <Figure label="Annual payroll" value={formatUsdCompact(s.total)} sub="all salaries, in USD" />
        <Figure label="Average salary" value={formatUsdCompact(s.avg)} sub={`median ${formatUsdCompact(s.median)}`} />
        <Figure label={`Highest median ${noun}`} value={top ? labelFor(top.key) : "–"} sub={top ? `${formatUsdCompact(top.median)} median` : ""} small />
      </div>

      <div className="toolbar">
        <span className="field-label mb-0" id="group-label">Group by</span>
        <div className="segmented" role="group" aria-labelledby="group-label">
          {GROUPS.map((g) => (
            <button key={g.value} type="button" aria-pressed={group === g.value} onClick={() => setGroup(g.value)}>
              {g.label}
            </button>
          ))}
        </div>
        <span className="small text-secondary">Applies to the charts and table below.</span>
      </div>

      {rows.length === 0 ? (
        <div className="panel empty">
          <h2>No active employees yet</h2>Add people in the Directory to see pay insights.
        </div>
      ) : (
        <div className="d-grid gap-3">
          <section className="panel" aria-labelledby="h-median">
            <div>
              <h2 className="chart-title" id="h-median">Median salary by {noun}</h2>
              <p className="chart-sub">Annual salary in USD. Hover a bar for headcount, average and range.</p>
              <MedianBars rows={shown} labelFor={labelFor} />
              {hidden > 0 && <p className="chart-sub mt-2 mb-0">Showing the top {MAX_BARS} of {rows.length}. All are in the table below.</p>}
            </div>
          </section>

          {showShare && shares.length > 0 && (
            <section className="panel" aria-labelledby="h-share">
              <div>
                <h2 className="chart-title" id="h-share">Share of annual payroll by {noun}</h2>
                <p className="chart-sub">Where the payroll budget goes. Hover a segment for the amount.</p>
                <PayrollShareBar shares={shares} labelFor={labelFor} />
              </div>
            </section>
          )}

          <section className="panel" aria-labelledby="h-bands">
            <div>
              <h2 className="chart-title" id="h-bands">How many people earn in each band</h2>
              <p className="chart-sub">Employees per annual salary band, in USD.</p>
              <BandColumns bands={data.distribution} headcount={s.headcount} />
            </div>
          </section>

          <section className="panel" aria-labelledby="h-table">
            <div>
              <h2 className="chart-title" id="h-table">Details by {noun}</h2>
              <p className="chart-sub">The exact numbers behind the charts, in USD.</p>
              <div className="table-responsive">
                <table className="table mini-table align-middle mb-0">
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
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={small ? { fontSize: "1.35rem", paddingTop: "0.25rem" } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
