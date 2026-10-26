/** Pure chart helpers: palette, colour-by-entity, shares, label fitting. No DOM, so they are unit-tested. */
import type { GroupStats } from "./types";

/**
 * Categorical slots in FIXED order (never cycled, never generated past 8). This order was run through
 * the palette validator: every adjacent pair passes the CVD and normal-vision separation gates.
 * Three light slots (aqua, yellow, magenta) are under 3:1 contrast on white, so every chart ships a
 * legend, tooltips and a table view as the relief.
 */
export const SERIES = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#6250d6", // violet
  "#e34948", // red
] as const;

/** The folded tail ("Other"): a neutral, never a ninth hue. */
export const OTHER_COLOR = "#898781";

export const INK = {
  primary: "#14213d",
  secondary: "#5b677a",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  surface: "#ffffff",
} as const;

const YELLOW = SERIES[3];

/** White text on a fill, except near-black on yellow (the palette's rule). */
export function textOn(fill: string): string {
  return fill === YELLOW ? "#0b0b0b" : "#ffffff";
}

/**
 * Colour follows the ENTITY, not its rank: a key always gets the slot matching its position in the
 * alphabetically sorted list of all keys, so sorting or re-ordering a chart never repaints anything.
 * Keys past the 8th slot have no colour (they fold into "Other").
 */
export function colorForKey(key: string, allKeys: string[]): string | null {
  const slot = [...allKeys].sort().indexOf(key);
  return slot >= 0 && slot < SERIES.length ? SERIES[slot] : null;
}

export interface Share {
  key: string;
  total: number;
  pct: number;
  color: string;
}

/** Part-to-whole shares of payroll, largest first; entities without a slot are folded into "Other". */
export function payrollShares(rows: GroupStats[]): Share[] {
  const grand = rows.reduce((sum, r) => sum + r.total, 0);
  if (grand <= 0) return [];
  const keys = rows.map((r) => r.key);

  const shares: Share[] = [];
  let otherTotal = 0;
  for (const r of [...rows].sort((a, b) => b.total - a.total)) {
    const color = colorForKey(r.key, keys);
    if (color) shares.push({ key: r.key, total: r.total, pct: (r.total / grand) * 100, color });
    else otherTotal += r.total;
  }
  if (otherTotal > 0) {
    shares.push({ key: "Other", total: otherTotal, pct: (otherTotal / grand) * 100, color: OTHER_COLOR });
  }
  return shares;
}

/** Keep the strongest `n` rows for a bar chart; the rest stay reachable in the table. */
export function topByMedian(rows: GroupStats[], n: number): { shown: GroupStats[]; hidden: number } {
  const sorted = [...rows].sort((a, b) => b.median - a.median);
  return { shown: sorted.slice(0, n), hidden: Math.max(0, sorted.length - n) };
}

/** A label goes inside a mark only if it fits with padding on both sides; otherwise it is dropped. */
export function fitsLabel(textWidth: number, markWidth: number, padding = 8): boolean {
  return textWidth + padding * 2 <= markWidth;
}

export function formatPct(pct: number): string {
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}
