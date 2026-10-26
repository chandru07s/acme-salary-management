import { describe, expect, it } from "vitest";
import {
  OTHER_COLOR,
  SERIES,
  colorForKey,
  fitsLabel,
  formatPct,
  payrollShares,
  textOn,
  topByMedian,
} from "./chartData";
import type { GroupStats } from "./types";

const row = (key: string, total: number, median = total): GroupStats => ({
  key, total, median, headcount: 1, min: median, avg: median, max: median, spread_pct: 0,
});

describe("colorForKey", () => {
  const keys = ["US", "IN", "GB", "DE"];

  it("assigns slots by sorted key, not by the order given", () => {
    expect(colorForKey("DE", keys)).toBe(SERIES[0]);
    expect(colorForKey("US", keys)).toBe(SERIES[3]);
    expect(colorForKey("US", [...keys].reverse())).toBe(SERIES[3]);
  });

  it("keeps an entity's colour when another entity is added after it alphabetically", () => {
    expect(colorForKey("DE", [...keys, "ZZ"])).toBe(colorForKey("DE", keys));
  });

  it("has no colour beyond the 8th slot (never generates a 9th hue)", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `K${i}`);
    expect(colorForKey("K8", nine)).toBeNull();
    expect(colorForKey("K7", nine)).toBe(SERIES[7]);
  });

  it("returns null for an unknown key", () => {
    expect(colorForKey("??", keys)).toBeNull();
  });
});

describe("payrollShares", () => {
  it("sums to 100% and sorts largest first", () => {
    const shares = payrollShares([row("A", 10), row("B", 30), row("C", 60)]);
    expect(shares.map((s) => s.key)).toEqual(["C", "B", "A"]);
    expect(shares.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
  });

  it("folds entities without a colour slot into a neutral Other", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`K${i}`, 10 + i));
    const shares = payrollShares(rows);
    expect(shares).toHaveLength(9); // 8 coloured + Other
    const other = shares[shares.length - 1];
    expect(other.key).toBe("Other");
    expect(other.color).toBe(OTHER_COLOR);
    expect(other.total).toBe(10 + 8 + (10 + 9)); // K8 + K9
    expect(shares.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
  });

  it("is empty when there is no payroll", () => {
    expect(payrollShares([])).toEqual([]);
    expect(payrollShares([row("A", 0)])).toEqual([]);
  });
});

describe("topByMedian", () => {
  it("returns the highest medians and counts what was hidden", () => {
    const { shown, hidden } = topByMedian([row("a", 1, 10), row("b", 1, 30), row("c", 1, 20)], 2);
    expect(shown.map((r) => r.key)).toEqual(["b", "c"]);
    expect(hidden).toBe(1);
  });
});

describe("label helpers", () => {
  it("only fits a label when there is padding on both sides", () => {
    expect(fitsLabel(30, 46)).toBe(true);
    expect(fitsLabel(30, 45)).toBe(false);
  });

  it("uses dark text on yellow and white elsewhere", () => {
    expect(textOn(SERIES[3])).toBe("#0b0b0b");
    expect(textOn(SERIES[0])).toBe("#ffffff");
  });

  it("formats small shares without showing a misleading 0%", () => {
    expect(formatPct(0.4)).toBe("<1%");
    expect(formatPct(12.6)).toBe("13%");
    expect(formatPct(0)).toBe("0%");
  });
});
