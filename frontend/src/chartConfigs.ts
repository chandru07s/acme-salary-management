/** Chart.js configuration builders. Plain functions (no React, no DOM), so they can be rendered anywhere. */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
  type TooltipItem,
} from "chart.js";
import { INK, SERIES, fitsLabel, formatPct, textOn, type Share } from "./chartData";
import { formatUsdCompact } from "./format";
import type { Band, GroupStats } from "./types";

export type Animation = ChartOptions<"bar">["animation"];

export interface BarChartConfig {
  data: ChartData<"bar">;
  options: ChartOptions<"bar">;
  plugins: Plugin<"bar">[];
  /** Container height in px, including the axis band so labels are never clipped. */
  height: number;
  /** Plain-language description for assistive tech. */
  label: string;
}

const FONT = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export function registerChartDefaults(): void {
  ChartJS.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);
  ChartJS.defaults.font.family = FONT;
  ChartJS.defaults.font.size = 12;
  ChartJS.defaults.color = INK.secondary;
}

const tooltipBase = {
  backgroundColor: INK.surface,
  titleColor: INK.primary,
  bodyColor: INK.secondary,
  borderColor: INK.baseline,
  borderWidth: 1,
  padding: 10,
  cornerRadius: 6,
  boxPadding: 4,
  titleFont: { weight: 600 as const },
  caretSize: 5,
};

const AXIS_BAND = 44; // room for the value-axis labels
const ROW_HEIGHT = 34;

/** Value labels just past the end of each bar. Always outside the mark, so nothing is clipped. */
function endLabels(format: (index: number) => string, horizontal: boolean): Plugin<"bar"> {
  return {
    id: "endLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = INK.primary;
      ctx.font = `500 12px ${FONT}`;
      chart.getDatasetMeta(0).data.forEach((el, i) => {
        const { x, y } = (el as BarElement).getProps(["x", "y"], true);
        if (x == null || y == null) return; // not laid out yet
        const text = format(i);
        if (horizontal) {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(text, x + 8, y);
        } else {
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(text, x, y - 6);
        }
      });
      ctx.restore();
    },
  };
}

/** A segment label is drawn only when it fits with padding; otherwise the legend + tooltip carry it. */
function segmentLabels(shares: Share[]): Plugin<"bar"> {
  return {
    id: "segmentLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = `600 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      shares.forEach((s, i) => {
        const el = chart.getDatasetMeta(i).data[0] as BarElement | undefined;
        if (!el) return;
        const { x, y, base } = el.getProps(["x", "y", "base"], true);
        if (x == null || y == null || base == null) return; // not laid out yet
        const text = formatPct(s.pct);
        if (!fitsLabel(ctx.measureText(text).width, Math.abs(x - base))) return;
        ctx.fillStyle = textOn(s.color);
        ctx.fillText(text, (x + base) / 2, y);
      });
      ctx.restore();
    },
  };
}

/* ---------- Median salary by group: one series, one colour, horizontal bars ---------- */

export function medianBarsConfig(
  rows: GroupStats[],
  labelFor: (key: string) => string,
  animation: Animation,
): BarChartConfig {
  return {
    data: {
      labels: rows.map((r) => labelFor(r.key)),
      datasets: [
        {
          data: rows.map((r) => r.median),
          backgroundColor: SERIES[0],
          borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 },
          borderSkipped: false,
          maxBarThickness: 24,
          categoryPercentage: 0.8,
          barPercentage: 0.8,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation,
      layout: { padding: { left: 4, right: 56 } },
      interaction: { mode: "nearest", axis: "y", intersect: false },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: INK.grid, lineWidth: 1 },
          border: { display: false },
          ticks: { color: INK.muted, maxTicksLimit: 6, callback: (v) => formatUsdCompact(Number(v)) },
        },
        y: {
          grid: { display: false },
          border: { color: INK.baseline },
          ticks: { color: INK.secondary, autoSkip: false },
        },
      },
      plugins: {
        legend: { display: false }, // one series: the card title says what is plotted
        tooltip: {
          ...tooltipBase,
          displayColors: false,
          callbacks: {
            label: (ctx: TooltipItem<"bar">) => `Median ${formatUsdCompact(rows[ctx.dataIndex].median)}`,
            afterLabel: (ctx: TooltipItem<"bar">) => {
              const r = rows[ctx.dataIndex];
              return [
                `${r.headcount.toLocaleString()} people`,
                `Average ${formatUsdCompact(r.avg)}`,
                `Range ${formatUsdCompact(r.min)} to ${formatUsdCompact(r.max)}`,
              ];
            },
          },
        },
      },
    },
    plugins: [endLabels((i) => formatUsdCompact(rows[i].median), true)],
    height: rows.length * ROW_HEIGHT + AXIS_BAND,
    label: `Bar chart of median salary in USD for ${rows.length} groups. The table below has the same numbers.`,
  };
}

/* ---------- Share of payroll: one 100% stacked bar, at most 8 coloured parts + Other ---------- */

export function payrollShareConfig(
  shares: Share[],
  labelFor: (key: string) => string,
  animation: Animation,
): BarChartConfig {
  const summary = shares
    .slice(0, 3)
    .map((s) => `${labelFor(s.key)} ${formatPct(s.pct)}`)
    .join(", ");

  return {
    data: {
      labels: ["Share of payroll"],
      datasets: shares.map((s) => ({
        label: labelFor(s.key),
        data: [s.pct],
        backgroundColor: s.color,
        borderColor: INK.surface, // the 2px surface gap between touching segments
        borderWidth: 2,
        borderSkipped: false as const,
        barThickness: 24,
      })),
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation,
      layout: { padding: { left: 4, right: 4 } },
      interaction: { mode: "nearest", intersect: true },
      scales: {
        x: { stacked: true, min: 0, max: 100, display: false },
        y: { stacked: true, display: false },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "rectRounded",
            boxWidth: 10,
            boxHeight: 10,
            padding: 16,
            color: INK.secondary,
          },
        },
        tooltip: {
          ...tooltipBase,
          callbacks: {
            title: () => "",
            label: (ctx: TooltipItem<"bar">) => {
              const s = shares[ctx.datasetIndex];
              return `${labelFor(s.key)}: ${formatPct(s.pct)} of payroll (${formatUsdCompact(s.total)})`;
            },
          },
        },
      },
    },
    plugins: [segmentLabels(shares)],
    height: 96,
    label: `Stacked bar of each group's share of annual payroll. Largest: ${summary}. The table below has all values.`,
  };
}

/* ---------- Salary bands: ordered buckets, one colour, columns ---------- */

export function bandColumnsConfig(bands: Band[], headcount: number, animation: Animation): BarChartConfig {
  const pctOf = (count: number) => (headcount ? (count / headcount) * 100 : 0);

  return {
    data: {
      labels: bands.map((b) => b.label),
      datasets: [
        {
          data: bands.map((b) => b.count),
          backgroundColor: SERIES[0],
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false,
          maxBarThickness: 24,
          categoryPercentage: 0.8,
          barPercentage: 0.8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation,
      layout: { padding: { top: 22 } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, border: { color: INK.baseline }, ticks: { color: INK.secondary } },
        y: {
          beginAtZero: true,
          grid: { color: INK.grid, lineWidth: 1 },
          border: { display: false },
          ticks: { color: INK.muted, maxTicksLimit: 5, callback: (v) => Number(v).toLocaleString() },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase,
          displayColors: false,
          callbacks: {
            title: (items) => `${items[0].label} (USD)`,
            label: (ctx: TooltipItem<"bar">) =>
              `${Number(ctx.raw).toLocaleString()} people, ${formatPct(pctOf(Number(ctx.raw)))} of employees`,
          },
        },
      },
    },
    plugins: [endLabels((i) => bands[i].count.toLocaleString(), false)],
    height: 260,
    label: "Column chart of employee counts in each annual salary band.",
  };
}
