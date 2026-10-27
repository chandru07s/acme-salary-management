import type {
  AgentAnswer,
  Dashboard,
  Employee,
  EmployeeInput,
  EmployeePage,
  EmployeeUpdate,
  EquityReport,
  FxRate,
  Insights,
  ListQuery,
  Meta,
  PayConfig,
  PayrollRun,
  PayrollRunDetail,
  PayslipPage,
  PayslipRow,
  Position,
  SalaryChange,
  Structure,
  User,
  VariableKind,
  VariablePayItem,
} from "./types";
import { AUTH_EXPIRED_EVENT, getToken, setToken } from "./auth";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** FastAPI returns `detail` as a string (404/409) or a list of field errors (422). */
export function describeError(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((p: string) => p !== "body").join(".") : "";
        const msg = String(d.msg ?? "invalid value").replace(/^Value error, /, "");
        return field ? `${field}: ${msg}` : msg;
      })
      .join("; ");
  }
  return "Something went wrong. Try again.";
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** An expired or invalid session sends the person back to the sign-in screen. */
function handleUnauthorized(path: string, status: number) {
  if (status === 401 && !path.startsWith("/api/auth/login")) {
    setToken(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(path, res.status);
    throw new ApiError(describeError(body.detail), res.status);
  }
  return body as T;
}

/** Download a protected file (the browser can't attach our token to a plain link). */
async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    handleUnauthorized(path, res.status);
    throw new ApiError(describeError(body.detail), res.status);
  }
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = match?.[1] ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toSearchParams(query: Partial<ListQuery>): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
  });
  return params;
}

export const api = {
  listEmployees: (query: ListQuery) =>
    request<EmployeePage>(`/api/employees?${toSearchParams(query)}`),
  exportUrl: (query: Omit<ListQuery, "page" | "page_size">) =>
    `/api/employees/export.csv?${toSearchParams(query)}`,
  createEmployee: (data: EmployeeInput) =>
    request<Employee>("/api/employees", { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: EmployeeUpdate) =>
    request<Employee>(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  terminateEmployee: (id: number) => request<void>(`/api/employees/${id}`, { method: "DELETE" }),
  history: (id: number) => request<SalaryChange[]>(`/api/employees/${id}/history`),
  meta: () => request<Meta>("/api/meta"),
  insights: () => request<Insights>("/api/insights"),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  equity: (q: { band?: string; country?: string; department?: string; page?: number; page_size?: number }) =>
    request<EquityReport>(`/api/equity?${toSearchParams(q as Partial<ListQuery>)}`),
  employee: (id: number) => request<Employee>(`/api/employees/${id}`),
  position: (id: number) => request<Position>(`/api/employees/${id}/position`),
  fxRates: () => request<FxRate[]>("/api/settings/fx"),
  setFxRate: (currency: string, to_usd: number) =>
    request<FxRate[]>(`/api/settings/fx/${currency}`, { method: "PUT", body: JSON.stringify({ to_usd }) }),
  resetFxRates: () => request<FxRate[]>("/api/settings/fx/reset", { method: "POST" }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<User>("/api/auth/me"),
  downloadCsv: (query: Omit<ListQuery, "page" | "page_size">) => download(api.exportUrl(query), "employees.csv"),
  downloadPayslip: (id: number) => download(`/api/payslips/${id}/pdf`, "payslip.pdf"),
  payConfig: () => request<PayConfig>("/api/settings/pay-config"),
  setPayConfig: (values: Partial<Omit<PayConfig, "limits">>) =>
    request<PayConfig>("/api/settings/pay-config", { method: "PUT", body: JSON.stringify(values) }),
  structure: (id: number) => request<Structure>(`/api/employees/${id}/structure`),
  variablePay: (id: number) => request<VariablePayItem[]>(`/api/employees/${id}/variable-pay`),
  addVariablePay: (id: number, data: { kind: VariableKind; amount: number; month: string; note?: string }) =>
    request<VariablePayItem>(`/api/employees/${id}/variable-pay`, { method: "POST", body: JSON.stringify(data) }),
  deleteVariablePay: (itemId: number) => request<void>(`/api/variable-pay/${itemId}`, { method: "DELETE" }),
  employeePayslips: (id: number) => request<PayslipRow[]>(`/api/employees/${id}/payslips`),
  runs: () => request<PayrollRun[]>("/api/payroll/runs"),
  run: (id: number) => request<PayrollRunDetail>(`/api/payroll/runs/${id}`),
  createRun: (month: string) => request<PayrollRun>("/api/payroll/runs", { method: "POST", body: JSON.stringify({ month }) }),
  runPayslips: (id: number, q: { q?: string; page?: number; page_size?: number }) =>
    request<PayslipPage>(`/api/payroll/runs/${id}/payslips?${toSearchParams(q as Partial<ListQuery>)}`),
  runAction: (id: number, action: "regenerate" | "submit" | "approve", body?: object) =>
    request<PayrollRun>(`/api/payroll/runs/${id}/${action}`, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  rejectRun: (id: number, note: string) =>
    request<PayrollRun>(`/api/payroll/runs/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
  deleteRun: (id: number) => request<void>(`/api/payroll/runs/${id}`, { method: "DELETE" }),
  agentStatus: () => request<{ enabled: boolean }>("/api/agent/status"),
  askAgent: (question: string) =>
    request<AgentAnswer>("/api/agent/ask", { method: "POST", body: JSON.stringify({ question }) }),
};
