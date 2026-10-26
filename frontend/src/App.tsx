import { useEffect, useState, type ReactNode } from "react";
import { IconChart, IconPeople, IconSpark, Logo } from "./components/Icons";
import { AskPage } from "./pages/AskPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { InsightsPage } from "./pages/InsightsPage";

type View = "directory" | "insights" | "ask";

const TABS: { view: View; label: string; hash: string; icon: ReactNode }[] = [
  { view: "directory", label: "Directory", hash: "#/", icon: <IconPeople /> },
  { view: "insights", label: "Insights", hash: "#/insights", icon: <IconChart /> },
  { view: "ask", label: "Ask the data", hash: "#/ask", icon: <IconSpark /> },
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
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <Logo />
          <span>ACME Pay</span>
        </a>
        <nav className="side-nav" aria-label="Main views">
          {TABS.map((t) => (
            <a key={t.view} href={t.hash} className={`side-link${view === t.view ? " active" : ""}`}
              aria-current={view === t.view ? "page" : undefined}>
              {t.icon}
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-foot-title">HR workspace</div>
          Salary data for 8 countries, converted to USD at fixed reference rates.
        </div>
      </aside>

      <main className="content">
        {view === "directory" && <DirectoryPage onDataChanged={() => setDataVersion((v) => v + 1)} />}
        {view === "insights" && <InsightsPage key={dataVersion} />}
        {view === "ask" && <AskPage />}
      </main>
    </div>
  );
}
