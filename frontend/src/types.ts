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
