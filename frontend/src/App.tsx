import { useEffect, useState } from "react";
import { AskPage } from "./pages/AskPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { InsightsPage } from "./pages/InsightsPage";

type View = "directory" | "insights" | "ask";

const TABS: { view: View; label: string; hash: string }[] = [
  { view: "directory", label: "Directory", hash: "#/" },
  { view: "insights", label: "Insights", hash: "#/insights" },
  { view: "ask", label: "Ask the data", hash: "#/ask" },
];

function viewFromHash(): View {
  return TABS.find((t) => t.hash === window.location.hash)?.view ?? "directory";
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

  return (
    <>
      <header className="app-header">
        <div className="container-xl d-flex align-items-center gap-4">
          <span className="brand">ACME Pay</span>
          <nav className="nav" aria-label="Main views">
            {TABS.map((t) => (
              <a
                key={t.view}
                href={t.hash}
                className={`nav-link${view === t.view ? " active" : ""}`}
                aria-current={view === t.view ? "page" : undefined}
              >
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="container-xl py-4">
        {view === "directory" && <DirectoryPage onDataChanged={() => setDataVersion((v) => v + 1)} />}
        {view === "insights" && <InsightsPage key={dataVersion} />}
        {view === "ask" && <AskPage />}
      </main>
    </>
  );
}
