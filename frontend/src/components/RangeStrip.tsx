import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { formatUsdCompact, niceAxisMax, pct } from "../format";
import { colors } from "../theme";
import type { GroupStats } from "../types";

interface Props {
  rows: GroupStats[];
  /** Human label for the first column, e.g. "Country". */
  labelFor?: (key: string) => string;
}

const GRID = "minmax(150px, 220px) 1fr 72px 72px 64px";

/**
 * One row per group on a shared USD axis. The tinted bar spans min to max,
 * the amber tick is the median and the dark dot is the average. When the dot sits
 * well to the right of the tick, a few high salaries are pulling the average up.
 */
export function RangeStrip({ rows, labelFor = (k) => k }: Props) {
  const axisMax = niceAxisMax(Math.max(0, ...rows.map((r) => r.max)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * axisMax);

  return (
    <Box role="table" aria-label="Pay range by group">
      <Box role="row" sx={{ display: "grid", gridTemplateColumns: GRID, gap: 2, pb: 1, alignItems: "end" }}>
        <Typography variant="caption" color="text.secondary">Group</Typography>
        <Box sx={{ position: "relative", height: 16 }} aria-hidden>
          {ticks.map((t, i) => (
            <Typography key={t} variant="caption" color="text.secondary"
              sx={{ position: "absolute", left: `${pct(t, axisMax)}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : "translateX(-50%)" }}>
              {formatUsdCompact(t)}
            </Typography>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" align="right">People</Typography>
        <Typography variant="caption" color="text.secondary" align="right">Median</Typography>
        <Typography variant="caption" color="text.secondary" align="right">Spread</Typography>
      </Box>

      {rows.map((r) => (
        <Box
          role="row"
          key={r.key}
          sx={{ display: "grid", gridTemplateColumns: GRID, gap: 2, alignItems: "center", py: 1, borderTop: `1px solid ${colors.line}` }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap title={labelFor(r.key)}>
            {labelFor(r.key)}
          </Typography>

          <Box
            role="img"
            aria-label={`${labelFor(r.key)}: minimum ${formatUsdCompact(r.min)}, median ${formatUsdCompact(r.median)}, average ${formatUsdCompact(r.avg)}, maximum ${formatUsdCompact(r.max)}`}
            sx={{ position: "relative", height: 22 }}
          >
            {/* axis line */}
            <Box sx={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, bgcolor: colors.line }} />
            {/* min–max range */}
            <Box sx={{
              position: "absolute", top: 5, height: 12, borderRadius: 1, bgcolor: colors.rangeFill,
              left: `${pct(r.min, axisMax)}%`,
              width: `${Math.max(0.6, pct(r.max, axisMax) - pct(r.min, axisMax))}%`,
            }} />
            {/* median tick */}
            <Box sx={{ position: "absolute", top: 1, height: 20, width: 3, ml: "-1.5px", borderRadius: 1, bgcolor: colors.amber, left: `${pct(r.median, axisMax)}%` }} />
            {/* average dot */}
            <Box sx={{ position: "absolute", top: 6, width: 10, height: 10, ml: "-5px", borderRadius: "50%", bgcolor: colors.ink, border: "2px solid #fff", boxSizing: "content-box", left: `${pct(r.avg, axisMax)}%`, transform: "translate(-2px, -2px)" }} />
          </Box>

          <Typography variant="body2" align="right">{r.headcount.toLocaleString()}</Typography>
          <Typography variant="body2" align="right" sx={{ fontWeight: 500 }}>{formatUsdCompact(r.median)}</Typography>
          <Typography variant="body2" align="right" color="text.secondary" title="Max minus min, as a percentage of the median">
            {Math.round(r.spread_pct)}%
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
