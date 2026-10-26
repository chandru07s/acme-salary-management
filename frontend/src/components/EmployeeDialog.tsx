import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { api } from "../api";
import { formatDate, formatMoney } from "../format";
import type { Employee, EmployeeInput, Meta, SalaryChange } from "../types";

interface Props {
  employee: Employee | null; // null => create
  meta: Meta;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  full_name: string;
  email: string;
  country: string;
  department: string;
  job_title: string;
  salary: string;
  hire_date: string;
  reason: string;
}

function initialState(e: Employee | null, meta: Meta): FormState {
  return {
    full_name: e?.full_name ?? "",
    email: e?.email ?? "",
    country: e?.country ?? meta.countries[0]?.code ?? "US",
    department: e?.department ?? "",
    job_title: e?.job_title ?? "",
    salary: e ? String(e.salary) : "",
    hire_date: e?.hire_date ?? "",
    reason: "",
  };
}

export function EmployeeDialog({ employee, meta, onClose, onSaved }: Props) {
  const isEdit = employee !== null;
  const [form, setForm] = useState<FormState>(() => initialState(employee, meta));
  const [history, setHistory] = useState<SalaryChange[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  useEffect(() => {
    if (employee) api.history(employee.id).then(setHistory).catch(() => setHistory([]));
  }, [employee]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const currency = meta.countries.find((c) => c.code === form.country)?.currency ?? "";
  const salaryNumber = Number(form.salary);
  const salaryChanged = isEdit && salaryNumber !== employee.salary;

  const missing = !form.full_name.trim() || !form.email.trim() || !form.department.trim() ||
    !form.job_title.trim() || !form.hire_date || !(salaryNumber > 0);

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const payload: EmployeeInput = {
      full_name: form.full_name,
      email: form.email,
      country: form.country,
      department: form.department,
      job_title: form.job_title,
      salary: salaryNumber,
      hire_date: form.hire_date,
    };
    return run(() =>
      isEdit
        ? api.updateEmployee(employee.id, { ...payload, reason: salaryChanged ? form.reason || undefined : undefined })
        : api.createEmployee(payload),
    );
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="employee-dialog-title">
      <DialogTitle id="employee-dialog-title">{isEdit ? employee.full_name : "Add employee"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {isEdit && employee.status === "terminated" && (
            <Alert severity="info">This person is terminated and is excluded from insights.</Alert>
          )}

          <TextField label="Full name" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          <TextField label="Email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField select label="Country" required value={form.country} onChange={(e) => set("country", e.target.value)}>
              {meta.countries.map((c) => (
                <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Hire date" type="date" required value={form.hire_date}
              onChange={(e) => set("hire_date", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <Autocomplete
              freeSolo options={meta.departments} inputValue={form.department}
              onInputChange={(_, v) => set("department", v)}
              renderInput={(p) => <TextField {...p} label="Department" required />}
            />
            <Autocomplete
              freeSolo options={meta.job_titles} inputValue={form.job_title}
              onInputChange={(_, v) => set("job_title", v)}
              renderInput={(p) => <TextField {...p} label="Job title" required />}
            />
          </Box>

          <TextField
            label={`Annual salary (${currency})`} type="number" required value={form.salary}
            onChange={(e) => set("salary", e.target.value)}
            helperText={`Base salary per year, paid in ${currency}`}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          {salaryChanged && (
            <TextField
              label="Reason for change" value={form.reason} onChange={(e) => set("reason", e.target.value)}
              helperText="Saved in the salary history, for example “Annual review”"
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
          )}

          {isEdit && history.length > 0 && (
            <Box>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="h2" sx={{ mb: 1 }}>Salary history</Typography>
              <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.75 }}>
                {history.map((h) => (
                  <Box component="li" key={h.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Typography variant="body2">
                      {h.old_salary === null
                        ? formatMoney(h.new_salary, employee.currency)
                        : `${formatMoney(h.old_salary, employee.currency)} → ${formatMoney(h.new_salary, employee.currency)}`}
                      {h.reason && <Typography component="span" variant="body2" color="text.secondary"> · {h.reason}</Typography>}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {formatDate(h.changed_at)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
        <Box>
          {isEdit && employee.status === "active" && (
            confirmTerminate ? (
              <Button color="error" variant="contained" disabled={saving} onClick={() => run(() => api.terminateEmployee(employee.id))}>
                Confirm termination
              </Button>
            ) : (
              <Button color="error" disabled={saving} onClick={() => setConfirmTerminate(true)}>Terminate employee</Button>
            )
          )}
          {isEdit && employee.status === "terminated" && (
            <Button disabled={saving} onClick={() => run(() => api.updateEmployee(employee.id, { status: "active" }))}>
              Reactivate
            </Button>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || missing}>
            {isEdit ? "Save changes" : "Add employee"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
