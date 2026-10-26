import type { EquityBand } from "../types";

const LABEL: Record<EquityBand, string> = { below: "Below peers", within: "In range", above: "Above peers" };

/** Compa-ratio as a number plus a small gauge: the tick is the peer median, the dot is this person. */
export function RatioBadge({ ratio, band }: { ratio: number | null; band: EquityBand | null }) {
  if (ratio === null || band === null) return <span className="text-secondary small">Not enough peers</span>;
  const pos = Math.min(1.4, Math.max(0.6, ratio));
  const left = ((pos - 0.6) / 0.8) * 100;
  return (
    <div className="compa" title={`${LABEL[band]}: ${(ratio * 100).toFixed(0)}% of the peer median`}>
      <span className={`compa-num ${band}`}>{ratio.toFixed(2)}</span>
      <span className="gauge" aria-hidden>
        <span className="gauge-mid" />
        <span className={`gauge-dot ${band}`} style={{ left: `${left}%` }} />
      </span>
      <span className="visually-hidden">{LABEL[band]}</span>
    </div>
  );
}

export const bandLabel = (b: EquityBand) => LABEL[b];
