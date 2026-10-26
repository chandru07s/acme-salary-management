import { useEffect, useState, type ReactNode } from "react";
import { IconChart, IconGear, IconHome, IconPeople, IconScale, IconSpark, Logo } from "./components/Icons";
import { AskPage } from "./pages/AskPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeePage } from "./pages/EmployeePage";
import { EquityPage } from "./pages/EquityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { InsightsPage } from "./pages/InsightsPage";

type View = "dashboard" | "directory" | "equity" | "insights" | "ask" | "settings" | "employee";

interface Route { view: View; id?: number }

const TABS: { view: View; label: string; hash: string; icon: ReactNode }[] = [
  { view: "dashboard", label: "Dashboard", hash: "#/", icon: <IconHome /> },
  { view: "directory", label: "Directory", hash: "#/employees", icon: <IconPeople /> },
  { view: "equity", label: "Pay equity", hash: "#/equity", icon: <IconScale /> },
  { view: "insights", label: "Insights", hash: "#/insights", icon: <IconChart /> },
  { view: "ask", label: "Ask the data", hash: "#/ask", icon: <IconSpark /> },
];
const SETTINGS_TAB = { view: "settings" as View, label: "Settings", hash: "#/settings", icon: <IconGear /> };

export function parseHash(hash: string): Route {
  const profile = /^#\/employee\/(\d+)$/.exec(hash);
  if (profile) return { view: "employee", id: Number(profile[1]) };
  const hit = [...TABS, SETTINGS_TAB].find((t) => t.hash === hash);
  return { view: hit?.view ?? "dashboard" };
}

function viewFromHash(): Route {
  return parseHash(window.location.hash);
}

export default function App() {
  const [route, setRoute] = useState<Route>(viewFromHash);
  const view = route.view;
  // Bumped whenever data changes so Insights re-fetches instead of showing stale numbers.
  const [dataVersion, setDataVersion] = useState(0);

  const bump = () => setDataVersion((v) => v + 1);

  useEffect(() => {
    const onHash = () => setRoute(viewFromHash());
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
          {[...TABS, SETTINGS_TAB].map((t) => {
            const on = view === t.view || (view === "employee" && t.view === "directory");
            return (
              <a key={t.view} href={t.hash} className={`side-link${on ? " active" : ""}${t.view === "settings" ? " push" : ""}`}
                aria-current={on ? "page" : undefined}>
                {t.icon}
                <span>{t.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="side-foot-title">HR workspace</div>
          Salary data for 8 countries, converted to USD at fixed reference rates.
        </div>
      </aside>

      <main className="content">
        {view === "dashboard" && <DashboardPage key={dataVersion} />}
        {view === "directory" && <DirectoryPage onDataChanged={bump} />}
        {view === "employee" && route.id !== undefined && <EmployeePage key={route.id} id={route.id} onDataChanged={bump} />}
        {view === "equity" && <EquityPage key={dataVersion} />}
        {view === "insights" && <InsightsPage key={dataVersion} />}
        {view === "ask" && <AskPage />}
        {view === "settings" && <SettingsPage onDataChanged={bump} />}
      </main>
    </div>
  );
}
