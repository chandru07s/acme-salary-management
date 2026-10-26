import { useEffect, useRef, useState } from "react";
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
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (employee) api.history(employee.id).then(setHistory).catch(() => setHistory([]));
  }, [employee]);

  // Modal behaviour: lock page scroll, focus the first field, close on Escape.
  useEffect(() => {
    document.body.classList.add("modal-open");
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, saving]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const currency = meta.countries.find((c) => c.code === form.country)?.currency ?? "";
  const salaryNumber = Number(form.salary);
  const salaryChanged = isEdit && salaryNumber !== employee.salary;

  const missing =
    !form.full_name.trim() || !form.email.trim() || !form.department.trim() ||
    !form.job_title.trim() || !form.hire_date || !(salaryNumber > 0);

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
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
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title"
        onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title fs-5" id="employee-dialog-title">{isEdit ? employee.full_name : "Add employee"}</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} disabled={saving} />
            </div>

            <div className="modal-body">
              <div className="d-grid gap-3">
                {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
                {isEdit && employee.status === "terminated" && (
                  <div className="alert alert-info mb-0">This person is terminated and is excluded from insights.</div>
                )}

                <Field id="e-name" label="Full name">
                  <input id="e-name" ref={firstField} className="form-control" required value={form.full_name}
                    onChange={(e) => set("full_name", e.target.value)} />
                </Field>
                <Field id="e-email" label="Email">
                  <input id="e-email" type="email" className="form-control" required value={form.email}
                    onChange={(e) => set("email", e.target.value)} />
                </Field>

                <div className="row g-3">
                  <div className="col-sm-6">
                    <Field id="e-country" label="Country">
                      <select id="e-country" className="form-select" value={form.country} onChange={(e) => set("country", e.target.value)}>
                        {meta.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="col-sm-6">
                    <Field id="e-hired" label="Hire date">
                      <input id="e-hired" type="date" className="form-control" required value={form.hire_date}
                        onChange={(e) => set("hire_date", e.target.value)} />
                    </Field>
                  </div>
                  <div className="col-sm-6">
                    <Field id="e-dept" label="Department">
                      <input id="e-dept" list="dept-options" className="form-control" required value={form.department}
                        onChange={(e) => set("department", e.target.value)} />
                      <datalist id="dept-options">{meta.departments.map((d) => <option key={d} value={d} />)}</datalist>
                    </Field>
                  </div>
                  <div className="col-sm-6">
                    <Field id="e-title" label="Job title">
                      <input id="e-title" list="title-options" className="form-control" required value={form.job_title}
                        onChange={(e) => set("job_title", e.target.value)} />
                      <datalist id="title-options">{meta.job_titles.map((t) => <option key={t} value={t} />)}</datalist>
                    </Field>
                  </div>
                </div>

                <Field id="e-salary" label={`Annual salary (${currency})`}>
                  <input id="e-salary" type="number" min={1} step={1} className="form-control" required value={form.salary}
                    onChange={(e) => set("salary", e.target.value)} aria-describedby="e-salary-help" />
                  <div id="e-salary-help" className="form-text">Base salary per year, paid in {currency}</div>
                </Field>

                {salaryChanged && (
                  <Field id="e-reason" label="Reason for change">
                    <input id="e-reason" className="form-control" maxLength={200} value={form.reason}
                      onChange={(e) => set("reason", e.target.value)} aria-describedby="e-reason-help" />
                    <div id="e-reason-help" className="form-text">Saved in the salary history, for example “Annual review”</div>
                  </Field>
                )}

                {isEdit && history.length > 0 && (
                  <section>
                    <hr />
                    <h3 className="fs-6 fw-semibold">Salary history</h3>
                    <ul className="list-unstyled mb-0 d-grid gap-1">
                      {history.map((h) => (
                        <li key={h.id} className="d-flex justify-content-between gap-3 small">
                          <span>
                            {h.old_salary === null
                              ? formatMoney(h.new_salary, employee.currency)
                              : `${formatMoney(h.old_salary, employee.currency)} → ${formatMoney(h.new_salary, employee.currency)}`}
                            {h.reason && <span className="text-secondary"> · {h.reason}</span>}
                          </span>
                          <span className="text-secondary text-nowrap">{formatDate(h.changed_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>

            <div className="modal-footer justify-content-between">
              <div>
                {isEdit && employee.status === "active" && (
                  confirmTerminate ? (
                    <button className="btn btn-danger" disabled={saving} onClick={() => run(() => api.terminateEmployee(employee.id))}>
                      Confirm termination
                    </button>
                  ) : (
                    <button className="btn btn-outline-danger" disabled={saving} onClick={() => setConfirmTerminate(true)}>
                      Terminate employee
                    </button>
                  )
                )}
                {isEdit && employee.status === "terminated" && (
                  <button className="btn btn-outline-primary" disabled={saving}
                    onClick={() => run(() => api.updateEmployee(employee.id, { status: "active" }))}>
                    Reactivate
                  </button>
                )}
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving || missing}>
                  {saving ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="form-label mb-1">{label}</label>
      {children}
    </div>
  );
}
