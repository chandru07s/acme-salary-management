import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { EmployeeDialog } from "../components/EmployeeDialog";
import { IconClose, IconDownload, IconPlus, IconSearch } from "../components/Icons";
import { PageHeader } from "../components/PageHeader";
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

  const countryName = (code: string) => meta?.countries.find((c) => c.code === code)?.name ?? code;
  const chips: { label: string; clear: () => void }[] = [];
  if (country) chips.push({ label: countryName(country), clear: () => setCountry("") });
  if (department) chips.push({ label: department, clear: () => setDepartment("") });
  if (jobTitle) chips.push({ label: jobTitle, clear: () => setJobTitle("") });

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Employees"
        subtitle={
          <>
            {data ? `${total.toLocaleString()} ${total === 1 ? "person" : "people"}` : "Loading…"}
            {" · salaries in local currency with the USD equivalent"}
          </>
        }
        actions={
          <>
            <a className="btn btn-light-line" href={api.exportUrl(filterQuery)} download>
              <IconDownload /> Export CSV
            </a>
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              <IconPlus /> Add employee
            </button>
          </>
        }
      />

      <div className="card mb-3">
        <div className="filters">
          <div className="search-wrap">
            <label htmlFor="f-search" className="field-label">Search</label>
            <IconSearch />
            <input id="f-search" className="form-control" placeholder="Name or email" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FilterSelect id="f-country" label="Country" value={country} onChange={setCountry}
            options={(meta?.countries ?? []).map((c) => ({ value: c.code, label: c.name }))} />
          <FilterSelect id="f-dept" label="Department" value={department} onChange={setDepartment}
            options={(meta?.departments ?? []).map((d) => ({ value: d, label: d }))} />
          <FilterSelect id="f-title" label="Job title" value={jobTitle} onChange={setJobTitle}
            options={(meta?.job_titles ?? []).map((t) => ({ value: t, label: t }))} />
        </div>
        <div className="filter-row">
          <div className="segmented" role="group" aria-label="Employment status">
            {[["active", "Active"], ["terminated", "Terminated"], ["", "All"]].map(([v, l]) => (
              <button key={l} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          {chips.map((c) => (
            <span className="chip" key={c.label}>
              {c.label}
              <button type="button" aria-label={`Remove filter ${c.label}`} onClick={c.clear}><IconClose /></button>
            </span>
          ))}
          {hasFilters && <button className="btn btn-link btn-sm px-1" onClick={clearFilters}>Clear all</button>}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setError(null)} />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="table-responsive">
          <table className="table data-table align-middle">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    scope="col"
                    className={col.align === "end" ? "text-end" : undefined}
                    aria-sort={sortBy === col.field ? (order === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button className={`sortable${sortBy === col.field ? " on" : ""}`} onClick={() => toggleSort(col.field)}>
                      {col.label}
                      {sortBy === col.field && <span aria-hidden> {order === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                ))}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {!data && loading && Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk${i}`}>
                  {Array.from({ length: COLUMNS.length + 1 }, (_, j) => (
                    <td key={j}><div className="skel" style={{ width: j === 0 ? "70%" : "55%" }} /></td>
                  ))}
                </tr>
              ))}
              {data?.items.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setEditing(e)} style={{ opacity: loading ? 0.6 : 1 }}>
                  <td>
                    <div className="person">
                      <span className="avatar" style={avatarStyle(e.full_name)} aria-hidden>{initials(e.full_name)}</span>
                      <div className="text-truncate">
                        <div className="person-name">{e.full_name}</div>
                        <div className="person-mail">{e.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-nowrap">{countryName(e.country)}</td>
                  <td>{e.department}</td>
                  <td>{e.job_title}</td>
                  <td className="text-nowrap">{formatDate(e.hire_date)}</td>
                  <td className="text-end">
                    <div className="salary">{formatMoney(e.salary, e.currency)}</div>
                    {e.currency !== "USD" && <div className="cell-sub">≈ {formatUsdCompact(e.salary_usd)}</div>}
                  </td>
                  <td>
                    <span className={`status ${e.status}`}>{e.status === "active" ? "Active" : "Terminated"}</span>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1}>
                    <div className="empty">
                      <h2>No employees match</h2>
                      <div>Try removing a filter or searching for a different name.</div>
                      {hasFilters && <button className="btn btn-link" onClick={clearFilters}>Clear all filters</button>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-foot">
          <label className="d-flex align-items-center gap-2 small text-secondary mb-0">
            Rows per page
            <select className="form-select form-select-sm w-auto" value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="small text-secondary">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
          <div className="pager d-flex" role="group" aria-label="Pagination">
            <button disabled={page === 0} onClick={() => setPage(0)} aria-label="First page">«</button>
            <button disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
            <button disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
            <button disabled={page >= lastPage} onClick={() => setPage(lastPage)} aria-label="Last page">»</button>
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

const TINTS = [
  ["#e8f0fb", "#1b559d"], ["#e3f5ec", "#0f7a4d"], ["#fdeee3", "#a4511a"],
  ["#efe9fb", "#5b3fb0"], ["#fbe8f0", "#a02c5d"], ["#e5f4f6", "#1d6b78"],
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function avatarStyle(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = TINTS[h % TINTS.length];
  return { background: bg, color: fg };
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
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <select id={id} className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
