/** Full amount in a given currency, e.g. "£100,000" or "₹1,200,000". */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Compact USD for dense places: $9k, $65k, $718.6M. */
export function formatUsdCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1e9) return `$${trim(amount / 1e9)}B`;
  if (abs >= 1e6) return `$${trim(amount / 1e6)}M`;
  if (abs >= 1e3) return `$${trim(amount / 1e3)}k`;
  return `$${Math.round(amount)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** Round a maximum up to a "nice" axis end (1, 2, 2.5, 5 × 10ⁿ). */
export function niceAxisMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s * base >= value) ?? 10;
  return step * base;
}

/** Position of a value on a 0..max axis, as a clamped percentage. */
export function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A value from an agent query result, shown in a table cell. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return String(value);
}

/** "2026-03" -> "March 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
