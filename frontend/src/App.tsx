import { useEffect, useState, type ReactNode } from "react";
import { AUTH_EXPIRED_EVENT, AuthContext, ROLE_LABEL, can, getToken, setToken } from "./auth";
import { api } from "./api";
import type { User } from "./types";
import { LoginPage } from "./pages/LoginPage";
import { PayrollPage } from "./pages/PayrollPage";
import { PayrollRunPage } from "./pages/PayrollRunPage";
import { IconChart, IconCash, IconGear, IconHome, IconPeople, IconScale, IconSpark, Logo } from "./components/Icons";
import { AskPage } from "./pages/AskPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeePage } from "./pages/EmployeePage";
import { EquityPage } from "./pages/EquityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { InsightsPage } from "./pages/InsightsPage";

type View = "payroll" | "payrollRun" | "dashboard" | "directory" | "equity" | "insights" | "ask" | "settings" | "employee";

interface Route { view: View; id?: number }

const TABS: { view: View; label: string; hash: string; icon: ReactNode }[] = [
  { view: "dashboard", label: "Dashboard", hash: "#/", icon: <IconHome /> },
  { view: "directory", label: "Directory", hash: "#/employees", icon: <IconPeople /> },
  { view: "equity", label: "Pay equity", hash: "#/equity", icon: <IconScale /> },
  { view: "payroll", label: "Payroll", hash: "#/payroll", icon: <IconCash /> },
  { view: "insights", label: "Insights", hash: "#/insights", icon: <IconChart /> },
  { view: "ask", label: "Ask the data", hash: "#/ask", icon: <IconSpark /> },
];
const SETTINGS_TAB = { view: "settings" as View, label: "Settings", hash: "#/settings", icon: <IconGear /> };

export function parseHash(hash: string): Route {
  const profile = /^#\/employee\/(\d+)$/.exec(hash);
  if (profile) return { view: "employee", id: Number(profile[1]) };
  const run = /^#\/payroll\/(\d+)$/.exec(hash);
  if (run) return { view: "payrollRun", id: Number(run[1]) };
  const hit = [...TABS, SETTINGS_TAB].find((t) => t.hash === hash);
  return { view: hit?.view ?? "dashboard" };
}

function viewFromHash(): Route {
  return parseHash(window.location.hash);
}

function Shell({ user, signOut }: { user: User; signOut: () => void }) {
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
    <AuthContext.Provider value={{ user, signOut }}>
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <Logo />
          <span>ACME Pay</span>
        </a>
        <nav className="side-nav" aria-label="Main views">
          {[...TABS, SETTINGS_TAB].filter((t) => t.view !== "payroll" || can.readPayroll(user.role)).map((t) => {
            const on = view === t.view || (view === "employee" && t.view === "directory") || (view === "payrollRun" && t.view === "payroll");
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
          <div className="side-foot-title">{user.name}</div>
          <div className="mb-2">{ROLE_LABEL[user.role]}</div>
          <button className="btn btn-sm signout" onClick={signOut}>Sign out</button>
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
        {view === "payroll" && (can.readPayroll(user.role) ? <PayrollPage /> : <NoAccess />)}
        {view === "payrollRun" && route.id !== undefined && (can.readPayroll(user.role) ? <PayrollRunPage key={route.id} id={route.id} /> : <NoAccess />)}
      </main>
    </div>
    </AuthContext.Provider>
  );
}

function NoAccess() {
  return (
    <div className="panel empty">
      <h2>Not available for your role</h2>
      Payroll is limited to the HR manager and the owner.
    </div>
  );
}

export default function App() {
  // undefined = still checking a saved session, null = signed out
  const [user, setUser] = useState<User | null | undefined>(getToken() ? undefined : null);

  useEffect(() => {
    if (getToken()) api.me().then(setUser).catch(() => { setToken(null); setUser(null); });
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const signOut = () => { setToken(null); setUser(null); window.location.hash = "#/"; };

  if (user === undefined) return <div className="login-wrap" role="status" aria-label="Loading" />;
  if (user === null) return <LoginPage onSignedIn={setUser} />;
  return <Shell user={user} signOut={signOut} />;
}
