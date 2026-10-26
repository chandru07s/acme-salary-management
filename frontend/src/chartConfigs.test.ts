import type { TooltipItem } from "chart.js";
import { describe, expect, it } from "vitest";
import { INK, SERIES, payrollShares } from "./chartData";
import { bandColumnsConfig, medianBarsConfig, payrollShareConfig } from "./chartConfigs";
import type { Band, GroupStats } from "./types";

const stat = (key: string, median: number, extra: Partial<GroupStats> = {}): GroupStats => ({
  key, median, total: median * 10, headcount: 10, min: median - 5000, avg: median + 1000, max: median + 9000,
  spread_pct: 10, ...extra,
});
const item = (dataIndex: number, extra: object = {}) => ({ dataIndex, datasetIndex: dataIndex, ...extra }) as unknown as TooltipItem<"bar">;
const same = (k: string) => k;

describe("medianBarsConfig", () => {
  const rows = [stat("A", 90_000), stat("B", 60_000)];
  const cfg = medianBarsConfig(rows, (k) => `Group ${k}`, false);

  it("plots one series in a single colour, with no legend box", () => {
    expect(cfg.data.datasets).toHaveLength(1);
    expect(cfg.data.datasets[0].backgroundColor).toBe(SERIES[0]);
    expect(cfg.options.plugins?.legend?.display).toBe(false);
  });

  it("uses the display label for each bar", () => {
    expect(cfg.data.labels).toEqual(["Group A", "Group B"]);
  });

  it("caps bar thickness and starts the axis at zero (honest bar lengths)", () => {
    expect(cfg.data.datasets[0].maxBarThickness).toBeLessThanOrEqual(24);
    expect((cfg.options.scales as any).x.beginAtZero).toBe(true);
  });

  it("grows the container with the number of bars so the axis labels are never clipped", () => {
    const taller = medianBarsConfig([...rows, stat("C", 1000)], same, false);
    expect(taller.height).toBeGreaterThan(cfg.height);
    expect(cfg.height).toBeGreaterThan(rows.length * 24);
  });

  it("the tooltip carries headcount, average and range, so nothing is colour-only", () => {
    const cb = cfg.options.plugins!.tooltip!.callbacks as any;
    expect(cb.label(item(0))).toBe("Median $90k");
    expect(cb.afterLabel(item(0)).join(" | ")).toContain("10 people");
    expect(cb.afterLabel(item(0)).join(" | ")).toContain("Average $91k");
    expect(cb.afterLabel(item(0)).join(" | ")).toContain("Range $85k to $99k");
  });

  it("describes itself for assistive tech and points at the table", () => {
    expect(cfg.label).toMatch(/2 groups/);
    expect(cfg.label).toMatch(/table/);
  });
});

describe("payrollShareConfig", () => {
  const shares = payrollShares([stat("A", 100, { total: 300 }), stat("B", 100, { total: 100 })]);
  const cfg = payrollShareConfig(shares, same, false);

  it("makes one stacked segment per share, in the share's own colour, separated by a surface-coloured gap", () => {
    expect(cfg.data.datasets).toHaveLength(2);
    expect(cfg.data.datasets.map((d) => d.backgroundColor)).toEqual(shares.map((s) => s.color));
    expect(cfg.data.datasets.every((d) => d.borderColor === INK.surface && d.borderWidth === 2)).toBe(true);
  });

  it("stacks on a fixed 0 to 100 scale", () => {
    const x = (cfg.options.scales as any).x;
    expect([x.stacked, x.min, x.max]).toEqual([true, 0, 100]);
  });

  it("keeps a legend (two or more series) and describes the largest shares", () => {
    expect(cfg.options.plugins?.legend?.display).not.toBe(false);
    expect(cfg.label).toContain("A 75%");
  });

  it("tooltip names the group, its share and its amount", () => {
    const cb = cfg.options.plugins!.tooltip!.callbacks as any;
    expect(cb.label(item(0))).toBe("A: 75% of payroll ($300)");
  });
});

describe("bandColumnsConfig", () => {
  const bands: Band[] = [
    { min: 0, max: 50_000, label: "< 50k", count: 30 },
    { min: 50_000, max: null, label: "50k+", count: 70 },
  ];
  const cfg = bandColumnsConfig(bands, 100, false);

  it("keeps band order, a single colour and a zero baseline", () => {
    expect(cfg.data.labels).toEqual(["< 50k", "50k+"]);
    expect(cfg.data.datasets[0].backgroundColor).toBe(SERIES[0]);
    expect((cfg.options.scales as any).y.beginAtZero).toBe(true);
  });

  it("tooltip shows the count and its share of all employees", () => {
    const cb = cfg.options.plugins!.tooltip!.callbacks as any;
    expect(cb.label(item(1, { raw: 70 }))).toBe("70 people, 70% of employees");
    expect(cb.title([{ label: "50k+" }])).toBe("50k+ (USD)");
  });

  it("does not divide by zero when there are no employees", () => {
    const empty = bandColumnsConfig(bands.map((b) => ({ ...b, count: 0 })), 0, false);
    const cb = empty.options.plugins!.tooltip!.callbacks as any;
    expect(cb.label(item(0, { raw: 0 }))).toBe("0 people, 0% of employees");
  });
});
