import { useEffect, useState } from "react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { IconArrow } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatMoney, formatUsdCompact } from "../format";
import type { Dashboard } from "../types";

export function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setD).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!d) {
    return (
      <div role="status" aria-label="Loading dashboard">
        <div className="skel mb-3" style={{ height: 120, borderRadius: 14 }} />
        <div className="skel" style={{ height: 300, borderRadius: 14 }} />
      </div>
    );
  }

  const s = d.summary;
  const maxCountry = Math.max(1, ...d.headcount_by_country.map((c) => c.headcount));
  const link = (hash: string) => () => { window.location.hash = hash; };

  return (
    <div>
      <PageHeader eyebrow="Overview" title="Good to see you" subtitle="Where your payroll stands today, and what needs a look." />

      <div className="kpis">
        <Kpi label="Employees" value={s.headcount.toLocaleString()} sub={`${d.hires_last_12_months.toLocaleString()} joined in the last year`} />
        <Kpi label="Annual payroll" value={formatUsdCompact(s.total)} sub="active salaries, in USD" />
        <Kpi label="Median salary" value={formatUsdCompact(s.median)} sub={`average ${formatUsdCompact(s.avg)}`} />
        <Kpi label="Paid below peers" value={d.equity.below.toLocaleString()}
          sub={`${d.equity.below_pct}% of ${d.equity.rated.toLocaleString()} benchmarked`} warn={d.equity.below > 0} />
      </div>

      <div className="dash-grid">
        <section className="panel attention" aria-labelledby="h-attn">
          <h2 className="chart-title" id="h-attn">Needs attention</h2>
          <p className="chart-sub">People paid under 85% of their peer median (same job title, same country).</p>
          {d.equity.below === 0 ? (
            <div className="text-secondary">No one is paid below their peers.</div>
          ) : (
            <>
              <div className="attn-count">{d.equity.below.toLocaleString()}<span> people</span></div>
              <ul className="list-unstyled mb-3">
                {d.equity.below_by_department.map((x) => (
                  <li key={x.department} className="d-flex justify-content-between py-1 border-bottom">
                    <span>{x.department}</span><strong>{x.count.toLocaleString()}</strong>
                  </li>
                ))}
              </ul>
              <button className="btn btn-primary" onClick={link("#/equity")}>Review pay equity <IconArrow /></button>
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="h-geo">
          <h2 className="chart-title" id="h-geo">Headcount by country</h2>
          <p className="chart-sub">Active employees.</p>
          <div className="d-grid gap-2">
            {d.headcount_by_country.map((c) => (
              <div key={c.country} className="hbar">
                <span className="hbar-label">{c.name}</span>
                <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(c.headcount / maxCountry) * 100}%` }} /></span>
                <span className="hbar-val">{c.headcount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="h-hires">
          <h2 className="chart-title" id="h-hires">Latest hires</h2>
          <p className="chart-sub">Most recent start dates.</p>
          <ul className="feed">
            {d.recent_hires.map((h) => (
              <li key={h.id}>
                <a href={`#/employee/${h.id}`} className="feed-link">
                  <Avatar name={h.full_name} size={34} />
                  <span className="flex-grow-1">
                    <span className="person-name d-block">{h.full_name}</span>
                    <span className="person-mail">{h.job_title} · {h.country_name}</span>
                  </span>
                  <span className="small text-secondary text-nowrap">{formatDate(h.hire_date)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="h-chg">
          <h2 className="chart-title" id="h-chg">Recent salary changes</h2>
          <p className="chart-sub">The latest raises and adjustments.</p>
          {d.recent_changes.length === 0 ? (
            <div className="text-secondary">No salary changes yet. Edit someone's salary on their profile and it appears here.</div>
          ) : (
            <ul className="feed">
              {d.recent_changes.map((c, i) => (
                <li key={i}>
                  <a href={`#/employee/${c.employee_id}`} className="feed-link">
                    <Avatar name={c.full_name} size={34} />
                    <span className="flex-grow-1">
                      <span className="person-name d-block">{c.full_name}</span>
                      <span className="person-mail">
                        {formatMoney(c.old_salary, c.currency)} → {formatMoney(c.new_salary, c.currency)}
                        {c.reason ? ` · ${c.reason}` : ""}
                      </span>
                    </span>
                    <span className={`delta ${c.change_pct >= 0 ? "up" : "down"}`}>
                      {c.change_pct >= 0 ? "+" : ""}{c.change_pct}%
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`kpi${warn ? " kpi-warn" : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
