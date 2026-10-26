import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { api } from "../api";
import { RangeStrip } from "../components/RangeStrip";
import { formatUsdCompact } from "../format";
import { colors } from "../theme";
import type { GroupStats, Insights } from "../types";

type Group = "country" | "department" | "job_title";

const GROUPS: { value: Group; label: string }[] = [
  { value: "country", label: "Country" },
  { value: "department", label: "Department" },
  { value: "job_title", label: "Job title" },
];

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", DE: "Germany", IN: "India",
  CA: "Canada", AU: "Australia", SG: "Singapore", JP: "Japan",
};

export function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("country");

  useEffect(() => {
    api.insights().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <LinearProgress aria-label="Loading insights" />;

  const rows: GroupStats[] =
    group === "country" ? data.by_country : group === "department" ? data.by_department : data.by_job_title;
  const s = data.summary;
  const skew = s.median > 0 ? (s.avg - s.median) / s.median : 0;
  const maxBand = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <Box sx={{ display: "grid", gap: 2.5 }}>
      <Box>
        <Typography variant="h1">How ACME pays</Typography>
        <Typography variant="subtitle2">
          Active employees only. Local salaries are converted to USD at fixed reference rates.
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 3 }}>
        <Figure label="Employees" value={s.headcount.toLocaleString()} />
        <Figure label="Annual payroll" value={formatUsdCompact(s.total)} />
        <Figure label="Median salary" value={formatUsdCompact(s.median)} />
        <Figure label="Average salary" value={formatUsdCompact(s.avg)} />
        {s.headcount > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ gridColumn: "1 / -1" }}>
            {Math.abs(skew) < 0.05
              ? "The average and median are close, so pay is fairly evenly spread."
              : skew > 0
                ? `The average is ${Math.round(skew * 100)}% above the median: a smaller group of high salaries pulls it up. Use the median for what a typical person earns.`
                : `The average is ${Math.round(-skew * 100)}% below the median.`}
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="h2">Pay range by group</Typography>
            <Legend />
          </Box>
          <ToggleButtonGroup exclusive size="small" value={group} aria-label="Group by"
            onChange={(_, v: Group | null) => v && setGroup(v)}>
            {GROUPS.map((g) => (
              <ToggleButton key={g.value} value={g.value} sx={{ px: 2 }}>{g.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {rows.length === 0 ? (
          <Typography color="text.secondary">No active employees yet. Add people in the Directory to see pay ranges.</Typography>
        ) : (
          <RangeStrip rows={rows} labelFor={group === "country" ? (k) => COUNTRY_NAMES[k] ?? k : undefined} />
        )}
      </Paper>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>Salary bands (USD)</Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
          {data.distribution.map((b) => (
            <Box key={b.label} sx={{ display: "grid", gridTemplateColumns: "100px 1fr 120px", gap: 2, alignItems: "center" }}>
              <Typography variant="body2">{b.label}</Typography>
              <Box sx={{ height: 14, bgcolor: "#F1F4F7", borderRadius: 1 }}>
                <Box sx={{ height: "100%", width: `${(b.count / maxBand) * 100}%`, bgcolor: colors.teal, borderRadius: 1 }} />
              </Box>
              <Typography variant="body2" align="right">
                {b.count.toLocaleString()} ({s.headcount ? Math.round((b.count / s.headcount) * 100) : 0}%)
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

function Legend() {
  return (
    <Box sx={{ display: "flex", gap: 2, mt: 0.5, flexWrap: "wrap" }} aria-label="Legend">
      <LegendItem swatch={<Box sx={{ width: 18, height: 10, borderRadius: 1, bgcolor: colors.rangeFill }} />} text="Lowest to highest" />
      <LegendItem swatch={<Box sx={{ width: 3, height: 14, borderRadius: 1, bgcolor: colors.amber }} />} text="Median" />
      <LegendItem swatch={<Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: colors.ink }} />} text="Average" />
    </Box>
  );
}

function LegendItem({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      {swatch}
      <Typography variant="caption" color="text.secondary">{text}</Typography>
    </Box>
  );
}
