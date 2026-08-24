"use client";

import {
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { AttendanceRecord, AttendanceStatus, Employee, HrPolicy, HrState, PayrollAdjustment } from "../types";

export type HrMutation = (body: Record<string, unknown>) => Promise<HrState>;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function hrMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function minutesLabel(value: number) {
  if (!value) return "0m";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes ? `${minutes}m` : ""}`.trim() : `${minutes}m`;
}

function readableStatus(value: AttendanceStatus) {
  return value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

const attendanceStatusOptions: AttendanceStatus[] = ["present", "incomplete", "absent", "friday", "vacation", "occasional_leave", "resort_leave", "sick_leave", "urgent_leave", "normal_leave", "assignment"];
const leaveStatusOptions: AttendanceStatus[] = ["vacation", "occasional_leave", "resort_leave", "sick_leave", "urgent_leave", "normal_leave"];
const adjustmentReasons = [
  "Perfect performance · deadline / quality / creativity / punctuality",
  "Extra tasks beyond daily responsibilities",
  "Daily tasks not completed",
  "First audit issue · creator",
  "Second audit issue · account manager and creator",
  "Post-publication issue · operation manager, account manager and creator",
  "Weak performance · deadline / quality / creativity / attitude",
  "Leave or assignment without written approval",
];

function HrModal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={cx("modal-card", wide && "hr-modal-wide")} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><div><span className="eyebrow">FMG PEOPLE OPERATIONS</span><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}

type EmployeeDraft = Omit<Employee, "id" | "createdAt" | "updatedAt">;

const blankEmployee: EmployeeDraft = {
  biometricCode: "",
  name: "",
  title: "",
  department: "",
  email: "",
  phone: "",
  hireDate: "",
  baseSalary: 0,
  monthlyCommission: 0,
  monthlyDeduction: 0,
  active: true,
  notes: "",
};

export function EmployeesPanel({ state, mutate, busy, showToast }: { state: HrState; mutate: HrMutation; busy: boolean; showToast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<EmployeeDraft>(blankEmployee);
  const [open, setOpen] = useState(false);
  const filtered = state.employees.filter((employee) => [employee.name, employee.biometricCode, employee.title, employee.department, employee.email, employee.phone].some((value) => value.toLowerCase().includes(query.toLowerCase())));

  function openForm(employee?: Employee) {
    setEditing(employee ?? null);
    setDraft(employee ? {
      biometricCode: employee.biometricCode, name: employee.name, title: employee.title, department: employee.department,
      email: employee.email, phone: employee.phone, hireDate: employee.hireDate, baseSalary: employee.baseSalary,
      monthlyCommission: employee.monthlyCommission, monthlyDeduction: employee.monthlyDeduction,
      active: employee.active, notes: employee.notes,
    } : blankEmployee);
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await mutate(editing
        ? { action: "updateEmployee", month: state.month, id: editing.id, data: draft }
        : { action: "createEmployee", month: state.month, data: draft });
      setOpen(false);
      showToast(editing ? "Employee details updated." : "Employee added to the FMG team.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save employee");
    }
  }

  async function deactivate(employee: Employee) {
    if (!window.confirm(`Deactivate ${employee.name}? Their attendance history will remain saved.`)) return;
    try { await mutate({ action: "deleteEmployee", month: state.month, id: employee.id }); showToast("Employee deactivated; history preserved."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not deactivate employee"); }
  }

  return <>
    <section className="panel data-panel">
      <div className="toolbar"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees, titles, biometric IDs…" /></div><div className="toolbar-spacer" /><span className="record-count">{state.employees.filter((employee) => employee.active).length} active employees</span><button className="small-primary" onClick={() => openForm()}><UserRoundPlus size={16} /> Add employee</button></div>
      {filtered.length ? <div className="table-scroll"><table className="data-table employee-table"><thead><tr><th>Employee</th><th>Title & department</th><th>Biometric ID</th><th>Base salary</th><th>Commission</th><th>Fixed deduction</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((employee) => <tr key={employee.id} className={!employee.active ? "muted-row" : ""}>
        <td><div className="client-cell"><span className="avatar-soft">{employee.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span><strong>{employee.name}</strong><small>{employee.email || employee.phone || "No contact details"}</small></span></div></td>
        <td><strong className="table-main">{employee.title || "Title not set"}</strong><small className="table-sub">{employee.department || "Department not set"}</small></td>
        <td><span className="category-pill">{employee.biometricCode || "—"}</span></td>
        <td><strong className="table-main">{hrMoney(employee.baseSalary, state.policy.currency)}</strong></td>
        <td className="positive-value">+ {hrMoney(employee.monthlyCommission, state.policy.currency)}</td>
        <td className="negative-value">− {hrMoney(employee.monthlyDeduction, state.policy.currency)}</td>
        <td><span className={cx("hr-status", employee.active ? "active" : "inactive")}>{employee.active ? "Active" : "Inactive"}</span></td>
        <td><div className="row-actions"><button onClick={() => openForm(employee)} aria-label="Edit employee"><Pencil size={16} /></button>{employee.active && <button className="danger" onClick={() => deactivate(employee)} aria-label="Deactivate employee"><Trash2 size={16} /></button>}</div></td>
      </tr>)}</tbody></table></div> : <div className="empty-panel"><div className="empty-icon"><UsersRound size={24} /></div><h3>{query ? "No matching employees" : "Build the FMG employee directory"}</h3><p>{query ? "Try a different name, title, or biometric ID." : "Add employees manually, or import the biometric workbook to create them automatically."}</p>{!query && <button className="small-primary" onClick={() => openForm()}><Plus size={15} /> Add first employee</button>}</div>}
    </section>

    {open && <HrModal title={editing ? "Edit employee" : "Add employee"} description="Salary figures are private and remain behind the administrator login." onClose={() => setOpen(false)} wide>
      <form className="modal-form" onSubmit={save}><div className="form-grid hr-form-grid">
        <label className="field"><span>Full name *</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span>Biometric ID</span><input value={draft.biometricCode} onChange={(event) => setDraft({ ...draft, biometricCode: event.target.value })} placeholder="e.g. 15" /></label>
        <label className="field"><span>Job title</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Department</span><input value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} /></label>
        <label className="field"><span>Base salary ({state.policy.currency})</span><input type="number" min="0" step="0.01" value={draft.baseSalary} onChange={(event) => setDraft({ ...draft, baseSalary: Number(event.target.value) })} /></label>
        <label className="field"><span>Monthly commission</span><input type="number" min="0" step="0.01" value={draft.monthlyCommission} onChange={(event) => setDraft({ ...draft, monthlyCommission: Number(event.target.value) })} /></label>
        <label className="field"><span>Fixed monthly deduction</span><input type="number" min="0" step="0.01" value={draft.monthlyDeduction} onChange={(event) => setDraft({ ...draft, monthlyDeduction: Number(event.target.value) })} /></label>
        <label className="field"><span>Hire date</span><input type="date" value={draft.hireDate} onChange={(event) => setDraft({ ...draft, hireDate: event.target.value })} /></label>
        <label className="field"><span>Phone</span><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
        <label className="field"><span>Email</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label className="field field-wide"><span>Notes</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <label className="check-field field-wide"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Active employee included in payroll</span></label>
      </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save employee"}</button></div></form>
    </HrModal>}
  </>;
}

type AttendanceDraft = Pick<AttendanceRecord, "firstIn" | "lastOut" | "status" | "lateExcused" | "earlyLeaveExcused" | "leavePaid" | "overtimeApproved" | "earlyOvertimeApproved" | "notes">;
type AdjustmentDraft = Pick<PayrollAdjustment, "employeeId" | "type" | "label" | "amount" | "notes">;

const blankAdjustment: AdjustmentDraft = { employeeId: 0, type: "bonus", label: "", amount: 0, notes: "" };

export function AttendancePanel({ state, mutate, busy, onMonthChange, onStateChange, showToast }: { state: HrState; mutate: HrMutation; busy: boolean; onMonthChange: (month: string) => Promise<void>; onStateChange: (state: HrState) => void; showToast: (message: string) => void }) {
  const [tab, setTab] = useState<"attendance" | "payroll" | "adjustments">("attendance");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceDraft | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<HrPolicy>(state.policy);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentDraft>(blankAdjustment);
  const fileInput = useRef<HTMLInputElement>(null);

  const filteredAttendance = useMemo(() => state.attendance.filter((record) =>
    (employeeFilter === "all" || record.employeeId === Number(employeeFilter)) &&
    (statusFilter === "all" || record.status === statusFilter)), [employeeFilter, state.attendance, statusFilter]);

  const totals = useMemo(() => ({
    lateMinutes: state.attendance.reduce((sum, record) => sum + record.lateMinutes, 0),
    overtimeMinutes: state.attendance.reduce((sum, record) => sum + record.overtimeMinutes, 0),
    payroll: state.payroll.reduce((sum, record) => sum + record.netSalary, 0),
    incomplete: state.attendance.filter((record) => record.status === "incomplete").length,
  }), [state]);

  async function importWorkbook(file: File) {
    setUploading(true);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/hr/import", { method: "POST", body });
      const result = await response.json() as HrState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not import attendance workbook");
      onStateChange(result as HrState);
      showToast(`Attendance imported for ${(result as HrState).month}. Review incomplete punches before payroll.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not import attendance workbook");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function openAttendance(record: AttendanceRecord) {
    setEditingAttendance(record);
    setAttendanceDraft({ firstIn: record.firstIn, lastOut: record.lastOut, status: record.status, lateExcused: record.lateExcused, earlyLeaveExcused: record.earlyLeaveExcused, leavePaid: record.leavePaid, overtimeApproved: record.overtimeApproved, earlyOvertimeApproved: record.earlyOvertimeApproved, notes: record.notes });
  }

  async function saveAttendance(event: React.FormEvent) {
    event.preventDefault();
    if (!editingAttendance || !attendanceDraft) return;
    try { await mutate({ action: "updateAttendance", month: state.month, id: editingAttendance.id, data: attendanceDraft }); setEditingAttendance(null); showToast("Attendance decision saved and payroll recalculated."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not update attendance"); }
  }

  function openPolicy() {
    setPolicyDraft({ ...state.policy });
    setPolicyOpen(true);
  }

  async function savePolicy(event: React.FormEvent) {
    event.preventDefault();
    try { await mutate({ action: "updatePolicy", month: state.month, data: policyDraft }); setPolicyOpen(false); showToast("Attendance policy saved and payroll recalculated."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not save attendance policy"); }
  }

  function openAdjustment(employeeId = 0) {
    setAdjustmentDraft({ ...blankAdjustment, employeeId: employeeId || state.employees.find((employee) => employee.active)?.id || 0 });
    setAdjustmentOpen(true);
  }

  async function saveAdjustment(event: React.FormEvent) {
    event.preventDefault();
    try { await mutate({ action: "createAdjustment", month: state.month, data: adjustmentDraft }); setAdjustmentOpen(false); showToast("Payroll adjustment added."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not add adjustment"); }
  }

  async function removeAdjustment(adjustment: PayrollAdjustment) {
    if (!window.confirm(`Delete “${adjustment.label}”?`)) return;
    try { await mutate({ action: "deleteAdjustment", month: state.month, id: adjustment.id }); showToast("Payroll adjustment deleted."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not delete adjustment"); }
  }

  function downloadPayrollWorkbook() {
    const anchor = document.createElement("a");
    anchor.href = `/api/hr/export?month=${encodeURIComponent(state.month)}`;
    anchor.click();
  }

  return <>
    <section className="hr-commandbar panel">
      <div className="month-control"><span>Payroll month</span><input type="month" value={state.month} onChange={(event) => void onMonthChange(event.target.value)} /></div>
      <div className="hr-command-actions"><button className="secondary-button" onClick={openPolicy}><Settings2 size={16} /> Policy settings</button><button className="secondary-button" onClick={downloadPayrollWorkbook} disabled={!state.payroll.length}><Download size={16} /> Download full Excel</button><input ref={fileInput} className="sr-only" type="file" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkbook(file); }} /><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? <Clock3 size={16} /> : <FileSpreadsheet size={16} />}{uploading ? "Importing…" : "Import biometric Excel"}</button></div>
    </section>

    <section className="policy-strip"><CheckCircle2 size={18} /><div><strong>FMG Office Policy v{state.policy.policyVersion} is active</strong><span>Free arrival through {state.policy.freeArrivalUntil} · overtime ×{state.policy.overtimeMultiplier} after {state.policy.overtimeStartsAt} · approval required after {state.policy.overtimeApprovalAfter} · Friday ×{state.policy.fridayMultiplier}</span></div><small>Approved early arrival ×{state.policy.earlyOvertimeMultiplier}</small></section>

    <section className="stats-grid hr-stats"><article className="stat-card stat-yellow"><div className="stat-top"><span>Active employees</span><i><UsersRound size={19} /></i></div><strong className="stat-value">{state.employees.filter((employee) => employee.active).length}</strong><small>{state.imports[0] ? `Last import: ${state.imports[0].fileName}` : "No biometric file imported"}</small></article><article className="stat-card stat-white"><div className="stat-top"><span>Total late time</span><i><Clock3 size={19} /></i></div><strong className="stat-value">{minutesLabel(totals.lateMinutes)}</strong><small>{state.attendance.filter((record) => record.lateMinutes > 0).length} late attendance records</small></article><article className="stat-card stat-black"><div className="stat-top"><span>Eligible overtime</span><i><CalendarClock size={19} /></i></div><strong className="stat-value">{minutesLabel(totals.overtimeMinutes)}</strong><small>{totals.incomplete} incomplete punch records</small></article><article className="stat-card stat-white"><div className="stat-top"><span>Projected payroll</span><i><BadgeDollarSign size={19} /></i></div><strong className="stat-value hr-money-value">{hrMoney(totals.payroll, state.policy.currency)}</strong><small>After current additions and deductions</small></article></section>

    <section className="panel data-panel">
      <div className="data-tabs"><button className={tab === "attendance" ? "active" : ""} onClick={() => setTab("attendance")}>Attendance <span>{state.attendance.length}</span></button><button className={tab === "payroll" ? "active" : ""} onClick={() => setTab("payroll")}>Payroll <span>{state.payroll.length}</span></button><button className={tab === "adjustments" ? "active" : ""} onClick={() => setTab("adjustments")}>Adjustments <span>{state.adjustments.length}</span></button></div>

      {tab === "attendance" && <>
        <div className="filters-row">
          <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">All employees</option>{state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{attendanceStatusOptions.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select>
          <div className="toolbar-spacer" /><span className="record-count">{filteredAttendance.length} attendance records in this view</span>
        </div>
        {filteredAttendance.length ? <div className="table-scroll"><table className="data-table attendance-table"><thead><tr><th>Date</th><th>Employee</th><th>First in</th><th>Last out</th><th>Status</th><th>Late / early</th><th>Overtime</th><th>Payroll impact</th><th>Review</th></tr></thead><tbody>{filteredAttendance.map((record) => <tr key={record.id}>
          <td><strong className="table-main">{record.workDate}</strong><small className="table-sub">{new Date(`${record.workDate}T12:00:00`).toLocaleDateString("en", { weekday: "short" })}</small></td>
          <td><strong className="table-main">{record.employeeName}</strong><small className="table-sub">ID {record.biometricCode || "—"}</small></td>
          <td>{record.firstIn || "—"}</td><td>{record.lastOut || "—"}</td>
          <td><span className={cx("attendance-status", `attendance-${record.status}`)}>{readableStatus(record.status)}</span>{leaveStatusOptions.includes(record.status) && <small className="table-sub">{record.leavePaid ? "Paid" : "Unpaid"}</small>}</td>
          <td><strong className={record.lateMinutes || record.earlyLeaveMinutes ? "negative-value" : ""}>{minutesLabel(record.lateMinutes)} late</strong>{record.lateExcused && <small className="table-sub">Late excused by manager</small>}{record.earlyLeaveMinutes > 0 && <small className="table-sub">{minutesLabel(record.earlyLeaveMinutes)} early{record.earlyLeaveExcused ? " · excused" : ""}</small>}</td>
          <td><strong className={record.overtimeMinutes ? "positive-value" : ""}>{minutesLabel(record.overtimeMinutes)}</strong>{record.earlyOvertimeMinutes > 0 && <small className="table-sub">{minutesLabel(record.earlyOvertimeMinutes)} approved early ×{state.policy.earlyOvertimeMultiplier}</small>}{record.missionOvertimeMinutes > 0 && <small className="table-sub">{minutesLabel(record.missionOvertimeMinutes)} approved mission</small>}{record.lastOut > state.policy.overtimeApprovalAfter && !record.overtimeApproved && <small className="table-sub">Time after {state.policy.overtimeApprovalAfter} excluded · approval required</small>}</td>
          <td><span className="impact-add">+{hrMoney(record.overtimePay + record.fridayPay, state.policy.currency)}</span><span className="impact-minus">−{hrMoney(record.lateDeduction + record.earlyLeaveDeduction + record.leaveDeduction, state.policy.currency)}</span></td>
          <td><button className="table-review" onClick={() => openAttendance(record)}><Pencil size={15} /> Review</button></td>
        </tr>)}</tbody></table></div> : <div className="empty-panel"><div className="empty-icon"><FileSpreadsheet size={24} /></div><h3>No attendance records for this view</h3><p>Import the monthly biometric Excel file, or change the employee/status filters.</p><button className="small-primary" onClick={() => fileInput.current?.click()}><Plus size={15} /> Import Excel</button></div>}
      </>}

      {tab === "payroll" && <><div className="filters-row"><span className="record-count">Calculated from salary, policy, attendance, approved employee requests, and monthly adjustments · Excel includes one sheet per employee</span></div>{state.payroll.length ? <div className="table-scroll"><table className="data-table payroll-table"><thead><tr><th>Employee</th><th>Base</th><th>Commission & additions</th><th>Overtime & Friday</th><th>Attendance deduction</th><th>Other deductions</th><th>Net salary</th><th>Details</th></tr></thead><tbody>{state.payroll.map((record) => <tr key={record.employeeId}><td><strong className="table-main">{record.employeeName}</strong><small className="table-sub">{record.title || "Title not set"}</small></td><td>{hrMoney(record.baseSalary, state.policy.currency)}</td><td className="positive-value">+{hrMoney(record.monthlyCommission + record.manualAdditions, state.policy.currency)}</td><td className="positive-value">+{hrMoney(record.overtimePay + record.fridayPay, state.policy.currency)}</td><td className="negative-value">−{hrMoney(record.attendanceDeduction, state.policy.currency)}</td><td className="negative-value">−{hrMoney(record.monthlyDeduction + record.manualDeductions, state.policy.currency)}</td><td><strong className="net-salary">{hrMoney(record.netSalary, state.policy.currency)}</strong></td><td><button className="table-review" onClick={() => openAdjustment(record.employeeId)}><Plus size={15} /> Adjustment</button><small className="table-sub">{minutesLabel(record.lateMinutes)} late · {record.earlyLeaveDays} early leave · {record.unpaidLeaveDays} unpaid leave · {minutesLabel(record.overtimeMinutes)} OT</small></td></tr>)}</tbody></table></div> : <div className="empty-panel"><div className="empty-icon"><BadgeDollarSign size={24} /></div><h3>Add employee salaries first</h3><p>Payroll summaries appear automatically for active employees.</p></div>}</>}

      {tab === "adjustments" && <><div className="filters-row"><span className="record-count">One-off commissions, bonuses, allowances, and deductions for {state.month}</span><div className="toolbar-spacer" /><button className="small-primary" onClick={() => openAdjustment()}><Plus size={15} /> Add adjustment</button></div>{state.adjustments.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Type</th><th>Label</th><th>Amount</th><th>Notes</th><th>Actions</th></tr></thead><tbody>{state.adjustments.map((adjustment) => <tr key={adjustment.id}><td><strong className="table-main">{adjustment.employeeName}</strong></td><td><span className={cx("attendance-status", adjustment.type === "deduction" ? "attendance-absent" : "attendance-present")}>{adjustment.type}</span></td><td>{adjustment.label}</td><td className={adjustment.type === "deduction" ? "negative-value" : "positive-value"}>{adjustment.type === "deduction" ? "−" : "+"}{hrMoney(adjustment.amount, state.policy.currency)}</td><td>{adjustment.notes || "—"}</td><td><div className="row-actions"><button className="danger" onClick={() => removeAdjustment(adjustment)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : <div className="empty-panel"><div className="empty-icon"><BadgeDollarSign size={24} /></div><h3>No monthly adjustments</h3><p>Add a one-off commission, bonus, allowance, or deduction when needed.</p><button className="small-primary" onClick={() => openAdjustment()}><Plus size={15} /> Add adjustment</button></div>}</>}
    </section>

    {editingAttendance && attendanceDraft && <HrModal title={`Review ${editingAttendance.employeeName} · ${editingAttendance.workDate}`} description={`Raw punches: ${editingAttendance.punches.join(" · ") || "No punches"}`} onClose={() => setEditingAttendance(null)}>
      <form className="modal-form" onSubmit={saveAttendance}><div className="form-grid">
        <label className="field"><span>First in</span><input type="time" value={attendanceDraft.firstIn} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, firstIn: event.target.value })} /></label><label className="field"><span>Last out</span><input type="time" value={attendanceDraft.lastOut} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, lastOut: event.target.value })} /></label>
        <label className="field field-wide"><span>Attendance status</span><select value={attendanceDraft.status} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, status: event.target.value as AttendanceStatus })}>{attendanceStatusOptions.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}</select></label>
        <label className="check-field"><input type="checkbox" checked={attendanceDraft.lateExcused} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, lateExcused: event.target.checked })} /><span>Manager approved / excuse lateness</span></label><label className="check-field"><input type="checkbox" checked={attendanceDraft.earlyLeaveExcused} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, earlyLeaveExcused: event.target.checked })} /><span>Approved early-leave excuse · no half-day deduction</span></label>
        <label className="check-field"><input type="checkbox" checked={attendanceDraft.leavePaid} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, leavePaid: event.target.checked })} /><span>Paid leave · uncheck to deduct the configured leave day</span></label><label className="check-field"><input type="checkbox" checked={attendanceDraft.overtimeApproved} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, overtimeApproved: event.target.checked })} /><span>Manager approved time after {state.policy.overtimeApprovalAfter}</span></label>
        <label className="check-field field-wide"><input type="checkbox" checked={attendanceDraft.earlyOvertimeApproved} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, earlyOvertimeApproved: event.target.checked })} /><span>Approved urgent early-arrival task · pay time before {state.policy.workdayStartsAt} at ×{state.policy.earlyOvertimeMultiplier}</span></label>
        <label className="field field-wide"><span>Written manager note</span><textarea required={attendanceDraft.overtimeApproved || attendanceDraft.earlyOvertimeApproved} value={attendanceDraft.notes} onChange={(event) => setAttendanceDraft({ ...attendanceDraft, notes: event.target.value })} placeholder="Required for overtime after 10 PM or approved early-arrival work." /></label>
      </div><div className="calculation-preview"><CircleAlert size={16} /><span>Changes recalculate lateness, overtime, and payroll immediately using the active Office Policy.</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditingAttendance(null)}>Cancel</button><button className="primary-button" disabled={busy}>Save review</button></div></form>
    </HrModal>}

    {policyOpen && <HrModal title="FMG attendance & leave policy" description="Policy v2 · late arrival, approved overtime, Friday work, leave notice periods, rewards, and deductions." onClose={() => setPolicyOpen(false)} wide>
      <form className="modal-form" onSubmit={savePolicy}><div className="form-grid hr-form-grid">
        <label className="field"><span>Currency</span><input required value={policyDraft.currency} onChange={(event) => setPolicyDraft({ ...policyDraft, currency: event.target.value.toUpperCase() })} /></label><label className="field"><span>Salary divisor (days)</span><input type="number" min="1" step="0.01" value={policyDraft.salaryDivisor} onChange={(event) => setPolicyDraft({ ...policyDraft, salaryDivisor: Number(event.target.value) })} /></label>
        <label className="field"><span>Workday begins</span><input type="time" value={policyDraft.workdayStartsAt} onChange={(event) => setPolicyDraft({ ...policyDraft, workdayStartsAt: event.target.value })} /></label><label className="field"><span>Workday minutes</span><input type="number" min="1" value={policyDraft.workdayMinutes} onChange={(event) => setPolicyDraft({ ...policyDraft, workdayMinutes: Number(event.target.value) })} /></label>
        <label className="field"><span>Free arrival through</span><input type="time" value={policyDraft.freeArrivalUntil} onChange={(event) => setPolicyDraft({ ...policyDraft, freeArrivalUntil: event.target.value })} /></label><label className="field"><span>Minute ×4 band ends</span><input type="time" value={policyDraft.minorLateUntil} onChange={(event) => setPolicyDraft({ ...policyDraft, minorLateUntil: event.target.value })} /></label>
        <label className="field"><span>Quarter-day band ends</span><input type="time" value={policyDraft.quarterDayUntil} onChange={(event) => setPolicyDraft({ ...policyDraft, quarterDayUntil: event.target.value })} /></label><label className="field"><span>Late minute multiplier</span><input type="number" min="0.01" step="0.01" value={policyDraft.minutePenaltyMultiplier} onChange={(event) => setPolicyDraft({ ...policyDraft, minutePenaltyMultiplier: Number(event.target.value) })} /></label>
        <label className="field"><span>Workday ends</span><input type="time" value={policyDraft.workdayEndsAt} onChange={(event) => setPolicyDraft({ ...policyDraft, workdayEndsAt: event.target.value })} /></label><label className="field"><span>Overtime starts</span><input type="time" value={policyDraft.overtimeStartsAt} onChange={(event) => setPolicyDraft({ ...policyDraft, overtimeStartsAt: event.target.value })} /></label>
        <label className="field"><span>Approval required after</span><input type="time" value={policyDraft.overtimeApprovalAfter} onChange={(event) => setPolicyDraft({ ...policyDraft, overtimeApprovalAfter: event.target.value })} /></label><label className="field"><span>OT arrival cutoff</span><input type="time" value={policyDraft.overtimeArrivalCutoff} onChange={(event) => setPolicyDraft({ ...policyDraft, overtimeArrivalCutoff: event.target.value })} /></label>
        <label className="field"><span>Overtime multiplier</span><input type="number" min="0.01" step="0.01" value={policyDraft.overtimeMultiplier} onChange={(event) => setPolicyDraft({ ...policyDraft, overtimeMultiplier: Number(event.target.value) })} /></label><label className="field"><span>Approved early-arrival multiplier</span><input type="number" min="0.01" step="0.01" value={policyDraft.earlyOvertimeMultiplier} onChange={(event) => setPolicyDraft({ ...policyDraft, earlyOvertimeMultiplier: Number(event.target.value) })} /></label>
        <label className="field"><span>Unexcused early leave (day fraction)</span><input type="number" min="0" max="2" step="0.25" value={policyDraft.earlyLeaveDayMultiplier} onChange={(event) => setPolicyDraft({ ...policyDraft, earlyLeaveDayMultiplier: Number(event.target.value) })} /></label><label className="field"><span>Friday work (number of days)</span><input type="number" min="0.01" step="0.01" value={policyDraft.fridayMultiplier} onChange={(event) => setPolicyDraft({ ...policyDraft, fridayMultiplier: Number(event.target.value) })} /></label>
        <label className="field"><span>Unpaid leave (day fraction)</span><input type="number" min="0" max="2" step="0.25" value={policyDraft.unpaidLeaveDayMultiplier} onChange={(event) => setPolicyDraft({ ...policyDraft, unpaidLeaveDayMultiplier: Number(event.target.value) })} /></label><label className="field"><span>Urgent leave deadline</span><input type="time" value={policyDraft.urgentLeaveDeadline} onChange={(event) => setPolicyDraft({ ...policyDraft, urgentLeaveDeadline: event.target.value })} /></label>
        <label className="field"><span>Urgent leave yearly limit</span><input type="number" min="1" step="1" value={policyDraft.urgentLeaveYearLimit} onChange={(event) => setPolicyDraft({ ...policyDraft, urgentLeaveYearLimit: Number(event.target.value) })} /></label><label className="field"><span>Medical report after (days)</span><input type="number" min="1" step="1" value={policyDraft.sickReportAfterDays} onChange={(event) => setPolicyDraft({ ...policyDraft, sickReportAfterDays: Number(event.target.value) })} /></label>
        <label className="field"><span>Resort leave maximum days</span><input type="number" min="1" step="1" value={policyDraft.resortLeaveDays} onChange={(event) => setPolicyDraft({ ...policyDraft, resortLeaveDays: Number(event.target.value) })} /></label><label className="field"><span>Resort leave notice (days)</span><input type="number" min="0" step="1" value={policyDraft.resortNoticeDays} onChange={(event) => setPolicyDraft({ ...policyDraft, resortNoticeDays: Number(event.target.value) })} /></label>
        <label className="field"><span>Normal leave notice (days)</span><input type="number" min="0" step="1" value={policyDraft.normalLeaveNoticeDays} onChange={(event) => setPolicyDraft({ ...policyDraft, normalLeaveNoticeDays: Number(event.target.value) })} /></label>
        <label className="field"><span>Absence day multiplier</span><input type="number" min="0" step="0.01" value={policyDraft.absenceDayMultiplier} onChange={(event) => setPolicyDraft({ ...policyDraft, absenceDayMultiplier: Number(event.target.value) })} /></label>
        <label className="check-field field-wide"><input type="checkbox" checked={policyDraft.absenceDeductionEnabled} onChange={(event) => setPolicyDraft({ ...policyDraft, absenceDeductionEnabled: event.target.checked })} /><span>Automatically deduct unapproved absence days using the configured multiplier</span></label>
      </div><div className="policy-reference"><div className="policy-rule-grid"><article><strong>Late arrival</strong><ul><li>Arrival through {policyDraft.freeArrivalUntil} is on time.</li><li>Until {policyDraft.minorLateUntil}: every late minute ×{policyDraft.minutePenaltyMultiplier}.</li><li>Then through {policyDraft.quarterDayUntil}: quarter-day deduction.</li><li>After {policyDraft.quarterDayUntil}: half day plus every extra minute ×{policyDraft.minutePenaltyMultiplier}.</li></ul></article><article><strong>Overtime & Friday</strong><ul><li>After {policyDraft.overtimeStartsAt}: every minute ×{policyDraft.overtimeMultiplier}, only when arrival is by {policyDraft.overtimeArrivalCutoff}.</li><li>After {policyDraft.overtimeApprovalAfter}: written manager approval and reason required.</li><li>Approved early-arrival task ×{policyDraft.earlyOvertimeMultiplier}, arranged one day before.</li><li>Friday work is paid as {policyDraft.fridayMultiplier} normal days.</li></ul></article><article><strong>Leaves</strong><ul><li>Friday and religious occasions are off.</li><li>Resort leave: up to {policyDraft.resortLeaveDays} days, with {policyDraft.resortNoticeDays} days’ notice.</li><li>Sick leave over {policyDraft.sickReportAfterDays} days requires a medical report.</li><li>Urgent leave by {policyDraft.urgentLeaveDeadline}, maximum {policyDraft.urgentLeaveYearLimit} per year; normal leave needs {policyDraft.normalLeaveNoticeDays} days’ notice.</li></ul></article><article><strong>Rewards & deductions</strong><ul><li>Rewards: perfect performance and extra tasks.</li><li>Audit responsibility: creator → account manager + creator → operation manager + account manager + creator.</li><li>Incomplete tasks, weak performance, and work absence without written approval can be deducted.</li><li>Apply each amount from Payroll Adjustments with a written note.</li></ul></article></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPolicyOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>Save policy</button></div></form>
    </HrModal>}

    {adjustmentOpen && <HrModal title={`Add payroll adjustment · ${state.month}`} onClose={() => setAdjustmentOpen(false)}>
      <form className="modal-form" onSubmit={saveAdjustment}><div className="form-grid">
        <label className="field"><span>Employee</span><select required value={adjustmentDraft.employeeId || ""} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, employeeId: Number(event.target.value) })}><option value="">Choose employee</option>{state.employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="field"><span>Type</span><select value={adjustmentDraft.type} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, type: event.target.value as AdjustmentDraft["type"] })}><option value="commission">Commission</option><option value="bonus">Bonus</option><option value="allowance">Allowance</option><option value="deduction">Deduction</option></select></label>
        <label className="field"><span>Policy reason</span><input required list="adjustment-policy-reasons" value={adjustmentDraft.label} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, label: event.target.value })} placeholder="Choose a policy reason or type another" /><datalist id="adjustment-policy-reasons">{adjustmentReasons.map((reason) => <option key={reason} value={reason} />)}</datalist></label><label className="field"><span>Amount ({state.policy.currency})</span><input required type="number" min="0.01" step="0.01" value={adjustmentDraft.amount} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, amount: Number(event.target.value) })} /></label>
        <label className="field field-wide"><span>Notes</span><textarea value={adjustmentDraft.notes} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, notes: event.target.value })} /></label>
      </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAdjustmentOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>Add adjustment</button></div></form>
    </HrModal>}
  </>;
}
