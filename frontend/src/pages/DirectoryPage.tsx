import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { EmployeeDialog } from "../components/EmployeeDialog";
import { formatDate, formatMoney, formatUsdCompact } from "../format";
import type { Employee, EmployeePage, ListQuery, Meta, SortField } from "../types";
import { useDebounce } from "../useDebounce";

interface Column {
  field: SortField;
  label: string;
  align?: "right";
}

const COLUMNS: Column[] = [
  { field: "full_name", label: "Name" },
  { field: "country", label: "Country" },
  { field: "department", label: "Department" },
  { field: "job_title", label: "Job title" },
  { field: "hire_date", label: "Hired" },
  { field: "salary_usd", label: "Annual salary", align: "right" },
];

const ALL = "";

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
  const [country, setCountry] = useState(ALL);
  const [department, setDepartment] = useState(ALL);
  const [jobTitle, setJobTitle] = useState(ALL);
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
    setCountry(ALL);
    setDepartment(ALL);
    setJobTitle(ALL);
    setStatus("active");
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography variant="h1">Employees</Typography>
          <Typography variant="subtitle2">
            {data ? `${data.total.toLocaleString()} ${data.total === 1 ? "person" : "people"}` : "Loading…"}
            {" · salaries shown in local currency, with USD equivalent"}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" href={api.exportUrl(filterQuery)} download>
            Export CSV
          </Button>
          <Button variant="contained" onClick={() => setEditing("new")}>
            Add employee
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          label="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 240, flexGrow: 1 }}
        />
        <FilterSelect label="Country" value={country} onChange={setCountry} width={160}
          options={(meta?.countries ?? []).map((c) => ({ value: c.code, label: c.name }))} />
        <FilterSelect label="Department" value={department} onChange={setDepartment} width={180}
          options={(meta?.departments ?? []).map((d) => ({ value: d, label: d }))} />
        <FilterSelect label="Job title" value={jobTitle} onChange={setJobTitle} width={220}
          options={(meta?.job_titles ?? []).map((t) => ({ value: t, label: t }))} />
        <FilterSelect label="Status" value={status} onChange={setStatus} width={140} allLabel="All"
          options={[{ value: "active", label: "Active" }, { value: "terminated", label: "Terminated" }]} />
        {hasFilters && <Button onClick={clearFilters}>Clear filters</Button>}
      </Paper>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Paper sx={{ overflow: "hidden" }}>
        <Box sx={{ height: 3 }}>{loading && <LinearProgress sx={{ height: 3 }} />}</Box>
        <TableContainer>
          <Table size="small" aria-label="Employees">
            <TableHead>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableCell key={col.field} align={col.align} sortDirection={sortBy === col.field ? order : false}>
                    <TableSortLabel
                      active={sortBy === col.field}
                      direction={sortBy === col.field ? order : "asc"}
                      onClick={() => toggleSort(col.field)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.items.map((e) => (
                <TableRow key={e.id} hover onClick={() => setEditing(e)} sx={{ cursor: "pointer" }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{e.full_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{e.email}</Typography>
                  </TableCell>
                  <TableCell>{e.country}</TableCell>
                  <TableCell>{e.department}</TableCell>
                  <TableCell>{e.job_title}</TableCell>
                  <TableCell>{formatDate(e.hire_date)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatMoney(e.salary, e.currency)}</Typography>
                    {e.currency !== "USD" && (
                      <Typography variant="caption" color="text.secondary">≈ {formatUsdCompact(e.salary_usd)}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={e.status === "active" ? "Active" : "Terminated"}
                      color={e.status === "active" ? "primary" : "default"} variant="outlined" />
                  </TableCell>
                </TableRow>
              ))}
              {data && data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length + 1} sx={{ py: 6, textAlign: "center" }}>
                    <Typography>No employees match these filters.</Typography>
                    {hasFilters && <Button onClick={clearFilters} sx={{ mt: 1 }}>Clear filters</Button>}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={data?.total ?? 0}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Paper>

      {editing && meta && (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </Box>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  width: number;
  allLabel?: string;
}

function FilterSelect({ label, value, onChange, options, width, allLabel = "All" }: FilterSelectProps) {
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ width }}>
      <MenuItem value={ALL}>{allLabel}</MenuItem>
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
      ))}
    </TextField>
  );
}
