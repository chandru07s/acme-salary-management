import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { EmployeeDialog } from "../components/EmployeeDialog";
import { formatDate, formatMoney, formatUsdCompact } from "../format";
import type { Employee, EmployeePage, ListQuery, Meta, SortField } from "../types";
import { useDebounce } from "../useDebounce";

interface Column {
  field: SortField;
  label: string;
  align?: "end";
}

const COLUMNS: Column[] = [
  { field: "full_name", label: "Name" },
  { field: "country", label: "Country" },
  { field: "department", label: "Department" },
  { field: "job_title", label: "Job title" },
  { field: "hire_date", label: "Hired" },
  { field: "salary_usd", label: "Annual salary", align: "end" },
];

const PAGE_SIZES = [25, 50, 100];

interface Props {
  onDataChanged: () => void;
}

export function DirectoryPage({ onDataChanged }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<EmployeePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [country, setCountry] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [status, setStatus] = useState("active");
  const [sortBy, setSortBy] = useState<SortField>("full_name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // `null` = closed, "new" = add form, Employee = edit form.
  const [editing, setEditing] = useState<Employee | "new" | null>(null);

  const filterQuery = useMemo(
    () => ({
      q: debouncedSearch.trim() || undefined,
      country: country || undefined,
      department: department || undefined,
      job_title: jobTitle || undefined,
      status: status || undefined,
      sort_by: sortBy,
      order,
    }),
    [debouncedSearch, country, department, jobTitle, status, sortBy, order],
  );

  const loadMeta = useCallback(() => {
    api.meta().then(setMeta).catch((e: Error) => setError(e.message));
  }, []);

  const loadPage = useCallback(() => {
    const query: ListQuery = { ...filterQuery, page: page + 1, page_size: pageSize };
    setLoading(true);
    api
      .listEmployees(query)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filterQuery, page, pageSize]);

  useEffect(loadMeta, [loadMeta]);
  useEffect(loadPage, [loadPage]);
  // Any filter change returns to page 1.
  useEffect(() => setPage(0), [filterQuery]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setOrder(field === "salary_usd" ? "desc" : "asc");
    }
  };

  const handleSaved = () => {
    setEditing(null);
    loadPage();
    loadMeta();
    onDataChanged();
  };

  const hasFilters = Boolean(search || country || department || jobTitle || status !== "active");
  const clearFilters = () => {
    setSearch("");
    setCountry("");
    setDepartment("");
    setJobTitle("");
    setStatus("active");
  };

  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="d-grid gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2">
        <div>
          <h1 className="page-title">Employees</h1>
          <div className="text-secondary">
            {data ? `${total.toLocaleString()} ${total === 1 ? "person" : "people"}` : "Loading…"}
            {" · salaries shown in local currency, with USD equivalent"}
          </div>
        </div>
        <div className="d-flex gap-2">
          <a className="btn btn-outline-primary" href={api.exportUrl(filterQuery)} download>
            Export CSV
          </a>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            Add employee
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body row g-2 align-items-end">
          <div className="col-12 col-lg-3">
            <label htmlFor="f-search" className="form-label small text-secondary mb-1">Search name or email</label>
            <input id="f-search" className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FilterSelect id="f-country" label="Country" value={country} onChange={setCountry}
            options={(meta?.countries ?? []).map((c) => ({ value: c.code, label: c.name }))} />
          <FilterSelect id="f-dept" label="Department" value={department} onChange={setDepartment}
            options={(meta?.departments ?? []).map((d) => ({ value: d, label: d }))} />
          <FilterSelect id="f-title" label="Job title" value={jobTitle} onChange={setJobTitle}
            options={(meta?.job_titles ?? []).map((t) => ({ value: t, label: t }))} />
          <FilterSelect id="f-status" label="Status" value={status} onChange={setStatus}
            options={[{ value: "active", label: "Active" }, { value: "terminated", label: "Terminated" }]} />
          {hasFilters && (
            <div className="col-auto">
              <button className="btn btn-link px-0" onClick={clearFilters}>Clear filters</button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center mb-0" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setError(null)} />
        </div>
      )}

      <div className="card overflow-hidden">
        <div style={{ height: 3 }}>
          {loading && (
            <div className="progress rounded-0" style={{ height: 3 }} role="progressbar" aria-label="Loading">
              <div className="progress-bar progress-bar-striped progress-bar-animated w-100" />
            </div>
          )}
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    scope="col"
                    className={col.align === "end" ? "text-end" : undefined}
                    aria-sort={sortBy === col.field ? (order === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button className="sortable" onClick={() => toggleSort(col.field)}>
                      {col.label}
                      {sortBy === col.field && <span aria-hidden> {order === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                ))}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setEditing(e)}>
                  <td>
                    <div className="fw-medium">{e.full_name}</div>
                    <div className="small text-secondary">{e.email}</div>
                  </td>
                  <td>{e.country}</td>
                  <td>{e.department}</td>
                  <td>{e.job_title}</td>
                  <td>{formatDate(e.hire_date)}</td>
                  <td className="text-end">
                    <div className="fw-medium">{formatMoney(e.salary, e.currency)}</div>
                    {e.currency !== "USD" && <div className="small text-secondary">≈ {formatUsdCompact(e.salary_usd)}</div>}
                  </td>
                  <td>
                    <span className={`badge ${e.status === "active" ? "text-bg-success" : "text-bg-secondary"}`}>
                      {e.status === "active" ? "Active" : "Terminated"}
                    </span>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="text-center py-5">
                    <div>No employees match these filters.</div>
                    {hasFilters && <button className="btn btn-link" onClick={clearFilters}>Clear filters</button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card-footer bg-white d-flex flex-wrap justify-content-end align-items-center gap-3">
          <label className="d-flex align-items-center gap-2 small text-secondary mb-0">
            Rows per page
            <select className="form-select form-select-sm w-auto" value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="small text-secondary">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
          <div className="btn-group btn-group-sm" role="group" aria-label="Pagination">
            <button className="btn btn-outline-secondary" disabled={page === 0} onClick={() => setPage(0)} aria-label="First page">«</button>
            <button className="btn btn-outline-secondary" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
            <button className="btn btn-outline-secondary" disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
            <button className="btn btn-outline-secondary" disabled={page >= lastPage} onClick={() => setPage(lastPage)} aria-label="Last page">»</button>
          </div>
        </div>
      </div>

      {editing && meta && (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function FilterSelect({ id, label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="col-6 col-lg">
      <label htmlFor={id} className="form-label small text-secondary mb-1">{label}</label>
      <select id={id} className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
