import { formatUsdCompact, niceAxisMax, pct } from "../format";
import type { GroupStats } from "../types";

interface Props {
  rows: GroupStats[];
  /** Human label for the first column, e.g. a country name for a country code. */
  labelFor?: (key: string) => string;
}

/**
 * One row per group on a shared USD axis. The tinted bar spans min to max,
 * the amber tick is the median and the dark dot is the average. When the dot sits
 * well to the right of the tick, a few high salaries are pulling the average up.
 */
export function RangeStrip({ rows, labelFor = (k) => k }: Props) {
  const axisMax = niceAxisMax(Math.max(0, ...rows.map((r) => r.max)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * axisMax);

  return (
    <div role="table" aria-label="Pay range by group">
      <div role="row" className="rs-grid rs-head">
        <span>Group</span>
        <div className="rs-axis-labels" aria-hidden>
          {ticks.map((t, i) => (
            <span key={t} style={{ left: `${pct(t, axisMax)}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : "translateX(-50%)" }}>
              {formatUsdCompact(t)}
            </span>
          ))}
        </div>
        <span className="rs-num">People</span>
        <span className="rs-num">Median</span>
        <span className="rs-num">Spread</span>
      </div>

      {rows.map((r) => {
        const label = labelFor(r.key);
        return (
          <div role="row" key={r.key} className="rs-grid rs-row">
            <div className="rs-label fw-medium text-truncate" title={label}>{label}</div>

            <div
              className="rs-track"
              role="img"
              aria-label={`${label}: minimum ${formatUsdCompact(r.min)}, median ${formatUsdCompact(r.median)}, average ${formatUsdCompact(r.avg)}, maximum ${formatUsdCompact(r.max)}`}
            >
              <div className="rs-line" />
              <div className="rs-range" style={{ left: `${pct(r.min, axisMax)}%`, width: `${Math.max(0.6, pct(r.max, axisMax) - pct(r.min, axisMax))}%` }} />
              <div className="rs-median" style={{ left: `${pct(r.median, axisMax)}%` }} />
              <div className="rs-avg" style={{ left: `${pct(r.avg, axisMax)}%` }} />
            </div>

            <div className="rs-num rs-n">{r.headcount.toLocaleString()}</div>
            <div className="rs-num rs-med fw-medium">{formatUsdCompact(r.median)}</div>
            <div className="rs-num rs-spread text-secondary" title="Max minus min, as a percentage of the median">
              {Math.round(r.spread_pct)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
