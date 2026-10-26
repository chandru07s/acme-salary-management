import type {
  AgentAnswer,
  Employee,
  EmployeeInput,
  EmployeePage,
  EmployeeUpdate,
  Insights,
  ListQuery,
  Meta,
  SalaryChange,
} from "./types";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(describeError(body.detail), res.status);
  return body as T;
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
  agentStatus: () => request<{ enabled: boolean }>("/api/agent/status"),
  askAgent: (question: string) =>
    request<AgentAnswer>("/api/agent/ask", { method: "POST", body: JSON.stringify({ question }) }),
};
