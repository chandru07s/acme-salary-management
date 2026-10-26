import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { DirectoryPage } from "./pages/DirectoryPage";
import { InsightsPage } from "./pages/InsightsPage";
import { colors } from "./theme";

type View = "directory" | "insights";

function viewFromHash(): View {
  return window.location.hash === "#/insights" ? "insights" : "directory";
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  // Bumped whenever data changes so Insights re-fetches instead of showing stale numbers.
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: View) => {
    window.location.hash = next === "insights" ? "#/insights" : "#/";
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box component="header" sx={{ bgcolor: colors.ink, color: "#fff" }}>
        <Container maxWidth="xl" sx={{ display: "flex", alignItems: "center", gap: 4, py: 0.5 }}>
          <Typography component="span" sx={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
            ACME Pay
          </Typography>
          <Tabs
            value={view}
            onChange={(_, v: View) => go(v)}
            textColor="inherit"
            slotProps={{ indicator: { style: { backgroundColor: "#5EEAD4" } } }}
            aria-label="Main views"
          >
            <Tab value="directory" label="Directory" />
            <Tab value="insights" label="Insights" />
          </Tabs>
        </Container>
      </Box>

      <Container maxWidth="xl" component="main" sx={{ py: 3 }}>
        {view === "directory" ? (
          <DirectoryPage onDataChanged={() => setDataVersion((v) => v + 1)} />
        ) : (
          <InsightsPage key={dataVersion} />
        )}
      </Container>
    </Box>
  );
}
