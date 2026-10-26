import { Bar } from "react-chartjs-2";
import type { Share } from "../chartData";
import {
  bandColumnsConfig,
  medianBarsConfig,
  payrollShareConfig,
  registerChartDefaults,
  type Animation,
  type BarChartConfig,
} from "../chartConfigs";
import type { Band, GroupStats } from "../types";

registerChartDefaults();

const reduceMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const animation: Animation = reduceMotion ? false : { duration: 300 };

function BarChart({ config }: { config: BarChartConfig }) {
  return (
    <div role="img" aria-label={config.label} style={{ position: "relative", height: config.height }}>
      <Bar data={config.data} options={config.options} plugins={config.plugins} />
    </div>
  );
}

export function MedianBars({ rows, labelFor }: { rows: GroupStats[]; labelFor: (key: string) => string }) {
  return <BarChart config={medianBarsConfig(rows, labelFor, animation)} />;
}

export function PayrollShareBar({ shares, labelFor }: { shares: Share[]; labelFor: (key: string) => string }) {
  return <BarChart config={payrollShareConfig(shares, labelFor, animation)} />;
}

export function BandColumns({ bands, headcount }: { bands: Band[]; headcount: number }) {
  return <BarChart config={bandColumnsConfig(bands, headcount, animation)} />;
}
