export interface Employee {
  id: number;
  full_name: string;
  email: string;
  country: string;
  currency: string;
  department: string;
  job_title: string;
  salary: number;
  salary_usd: number;
  hire_date: string;
  status: "active" | "terminated";
}

export interface EmployeePage {
  items: Employee[];
  total: number;
  page: number;
  page_size: number;
}

export interface EmployeeInput {
  full_name: string;
  email: string;
  country: string;
  department: string;
  job_title: string;
  salary: number;
  hire_date: string;
}

export interface EmployeeUpdate extends Partial<EmployeeInput> {
  status?: "active" | "terminated";
  reason?: string;
}

export interface SalaryChange {
  id: number;
  old_salary: number | null;
  new_salary: number;
  reason: string | null;
  changed_at: string;
}

export interface CountryOption {
  code: string;
  name: string;
  currency: string;
}

export interface Meta {
  countries: CountryOption[];
  departments: string[];
  job_titles: string[];
}

export interface Stats {
  headcount: number;
  total: number;
  min: number;
  avg: number;
  median: number;
  max: number;
}

export interface GroupStats extends Stats {
  key: string;
  spread_pct: number;
}

export interface Band {
  min: number;
  max: number | null;
  label: string;
  count: number;
}

export interface Insights {
  summary: Stats & { currency: string };
  by_country: GroupStats[];
  by_department: GroupStats[];
  by_job_title: GroupStats[];
  distribution: Band[];
}

export type SortField =
  | "id"
  | "full_name"
  | "country"
  | "department"
  | "job_title"
  | "hire_date"
  | "salary_usd";

export interface ListQuery {
  q?: string;
  country?: string;
  department?: string;
  job_title?: string;
  status?: string;
  sort_by: SortField;
  order: "asc" | "desc";
  page: number;
  page_size: number;
}

export interface AgentStep {
  sql: string;
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  error: string | null;
}

export interface AgentAnswer {
  answer: string;
  /** False when the data cannot answer the question or the request is out of scope. */
  answerable: boolean;
  assumptions: string[];
  /** Set when a guardrail produced this answer instead of the model. */
  guardrail: "input" | "output" | null;
  steps: AgentStep[];
}

export type EquityBand = "below" | "within" | "above";

export interface EquityRow {
  id: number;
  full_name: string;
  country: string;
  country_name: string;
  department: string;
  job_title: string;
  currency: string;
  salary: number;
  salary_usd: number;
  peer_median: number | null;
  peers: number;
  compa_ratio: number | null;
  band: EquityBand | null;
  tenure_years: number;
}

export interface EquityReport {
  summary: {
    below: number; within: number; above: number; rated: number; unrated: number; below_pct: number;
    thresholds: { below: number; above: number; min_peers: number };
  };
  below_by_department: { department: string; count: number }[];
  items: EquityRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface Position {
  peer_median: number | null;
  peers: number;
  compa_ratio: number | null;
  band: EquityBand | null;
  tenure_years: number;
}

export interface Dashboard {
  summary: Stats;
  hires_last_12_months: number;
  headcount_by_country: { country: string; name: string; headcount: number }[];
  recent_hires: { id: number; full_name: string; job_title: string; department: string; country_name: string; hire_date: string }[];
  recent_changes: {
    employee_id: number; full_name: string; currency: string; old_salary: number; new_salary: number;
    change_pct: number; reason: string | null; changed_at: string;
  }[];
  equity: { below: number; below_pct: number; rated: number; below_by_department: { department: string; count: number }[] };
}

export interface FxRate {
  currency: string;
  to_usd: number;
  default: number;
  countries: string[];
  editable: boolean;
}
