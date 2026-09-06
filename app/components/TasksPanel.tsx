"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
  Send,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AgencyTask, TaskReference, TasksState } from "../types";
import styles from "./TasksPanel.module.css";

const emptyState: TasksState = {
  tasks: [],
  assignees: [],
  userId: 0,
  role: "member",
  canCreate: false,
  canViewDaily: false,
  currentDate: "",
};

type TaskDraft = {
  title: string;
  details: string;
  brief: string;
  gridNotes: string;
  references: TaskReference[];
  startAt: string;
  deadlineAt: string;
  assignedUserId: number;
};

function cairoLocalParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function initialSchedule() {
  const parts = cairoLocalParts();
  const pseudoCairo = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)));
  pseudoCairo.setUTCMinutes(Math.ceil((pseudoCairo.getUTCMinutes() + 1) / 15) * 15, 0, 0);
  const deadline = new Date(pseudoCairo.getTime() + 8 * 60 * 60 * 1000);
  return { startAt: pseudoCairo.toISOString().slice(0, 16), deadlineAt: deadline.toISOString().slice(0, 16) };
}

function blankDraft(): TaskDraft {
  const schedule = initialSchedule();
  return { title: "", details: "", brief: "", gridNotes: "", references: [], startAt: schedule.startAt, deadlineAt: schedule.deadlineAt, assignedUserId: 0 };
}

function dateTimeLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value || "—";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  const hours = Number(match[4]);
  return `${day} · ${hours % 12 || 12}:${match[5]} ${hours >= 12 ? "PM" : "AM"}`;
}

function timeOnly(value: string) {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) return "—";
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

function durationLabel(minutes: number) {
  if (minutes <= 0) return "On time";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ");
}

function statusCopy(task: AgencyTask) {
  if (task.status === "submitted") return task.lateMinutes ? `Submitted · ${durationLabel(task.lateMinutes)} late` : "Submitted on time";
  return task.liveLateMinutes ? `Overdue · ${durationLabel(task.liveLateMinutes)}` : "In progress";
}

function taskTouchesDate(task: AgencyTask, date: string) {
  return task.startAt.slice(0, 10) <= date && task.deadlineAt.slice(0, 10) >= date;
}

function TaskModal({ eyebrow, title, description, onClose, children }: { eyebrow: string; title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className={styles.modalLayer} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={styles.modalCard} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export function TasksPanel({ showToast }: { showToast: (message: string) => void }) {
  const [state, setState] = useState<TasksState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(blankDraft);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [scope, setScope] = useState<"all" | "mine" | "created" | "submitted">("mine");
  const [dailyDate, setDailyDate] = useState(() => {
    const parts = cairoLocalParts();
    return `${parts.year}-${parts.month}-${parts.day}`;
  });
  const [dailyEmployee, setDailyEmployee] = useState("all");
  const [submitting, setSubmitting] = useState<AgencyTask | null>(null);
  const [submissionUrl, setSubmissionUrl] = useState("");

  async function refresh(showError = true) {
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const result = await response.json() as TasksState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not load tasks.");
      setState(result as TasksState);
      setDailyDate((current) => current || (result as TasksState).currentDate);
    } catch (error) {
      if (showError) showToast(error instanceof Error ? error.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(false), 30_000);
    return () => window.clearInterval(interval);
    // The panel owns polling for task and notification freshness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutate(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as TasksState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not save the task.");
      setState(result as TasksState);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the task.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    const next = blankDraft();
    next.assignedUserId = state.assignees[0]?.id ?? 0;
    setDraft(next);
    setCreateOpen(true);
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    const references = draft.references.filter((reference) => reference.url.trim()).map((reference) => ({ label: reference.label.trim(), url: reference.url.trim() }));
    const done = await mutate({ action: "create", data: { ...draft, references } });
    if (!done) return;
    setCreateOpen(false);
    setScope("created");
    showToast("Task assigned and the team member has been notified.");
  }

  async function submitTask(event: React.FormEvent) {
    event.preventDefault();
    if (!submitting) return;
    const done = await mutate({ action: "submit", id: submitting.id, submissionUrl: submissionUrl.trim() });
    if (!done) return;
    setSubmitting(null);
    setSubmissionUrl("");
    showToast("Task submitted successfully.");
  }

  function updateReference(index: number, key: keyof TaskReference, value: string) {
    setDraft((current) => ({ ...current, references: current.references.map((reference, refIndex) => refIndex === index ? { ...reference, [key]: value } : reference) }));
  }

  const stats = useMemo(() => {
    const currentDate = state.currentDate;
    return {
      mine: state.tasks.filter((task) => task.assignedUserId === state.userId && task.status === "assigned").length,
      dueToday: state.tasks.filter((task) => taskTouchesDate(task, currentDate) && task.status === "assigned").length,
      submittedToday: state.tasks.filter((task) => task.submittedAt.slice(0, 10) === currentDate).length,
      overdue: state.tasks.filter((task) => task.status === "assigned" && task.liveLateMinutes > 0).length,
    };
  }, [state]);

  const filteredTasks = useMemo(() => state.tasks.filter((task) => {
    if (scope === "mine") return task.assignedUserId === state.userId;
    if (scope === "created") return task.createdByUserId === state.userId;
    if (scope === "submitted") return task.status === "submitted";
    return true;
  }), [scope, state]);

  const dailyTasks = useMemo(() => state.tasks.filter((task) => taskTouchesDate(task, dailyDate) && (dailyEmployee === "all" || task.assignedUserId === Number(dailyEmployee))), [dailyDate, dailyEmployee, state.tasks]);
  const dailyGroups = useMemo(() => {
    const groups = new Map<number, { name: string; role: string; tasks: AgencyTask[] }>();
    dailyTasks.forEach((task) => {
      const group = groups.get(task.assignedUserId) ?? { name: task.assignedUserName, role: task.assignedUserRole, tasks: [] };
      group.tasks.push(task);
      groups.set(task.assignedUserId, group);
    });
    return [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [dailyTasks]);

  function toggleTask(id: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <div className={styles.workspace}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span><CheckCircle2 size={14} /> FMG TASK FLOW</span><h2>Daily work, clear ownership.</h2><p>Assign detailed work, keep every reference together, and measure delivery against the exact deadline.</p></div>
      {state.canCreate && <button type="button" className={styles.createButton} onClick={openCreate}><Plus size={17} /> Assign a task</button>}
      <div className={styles.stats}>
        <article><span><UserRound size={18} /></span><div><small>MY OPEN TASKS</small><strong>{stats.mine}</strong></div></article>
        <article><span><CalendarDays size={18} /></span><div><small>OPEN TODAY</small><strong>{stats.dueToday}</strong></div></article>
        <article><span><Check size={18} /></span><div><small>SUBMITTED TODAY</small><strong>{stats.submittedToday}</strong></div></article>
        <article className={stats.overdue ? styles.dangerStat : ""}><span><Clock3 size={18} /></span><div><small>OVERDUE</small><strong>{stats.overdue}</strong></div></article>
      </div>
    </section>

    {state.canViewDaily && <section className={styles.dailyPanel}>
      <header><div><span>DAILY DELIVERY BOARD</span><h2>Who is working on what?</h2><p>The date starts on today in Cairo. Multi-day tasks stay visible on every active day.</p></div><div className={styles.dailyFilters}><label><CalendarDays size={15} /><span>Day</span><input type="date" value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} /></label><label><UsersRound size={15} /><span>Employee</span><select value={dailyEmployee} onChange={(event) => setDailyEmployee(event.target.value)}><option value="all">All team members</option>{state.assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.displayName}</option>)}</select></label></div></header>
      <div className={styles.dailySummary}><span><strong>{dailyTasks.length}</strong> tasks</span><span><strong>{dailyTasks.filter((task) => task.status === "submitted").length}</strong> submitted</span><span><strong>{dailyTasks.filter((task) => task.status === "assigned").length}</strong> not submitted</span><span><strong>{dailyTasks.filter((task) => task.liveLateMinutes > 0 && task.status === "assigned").length}</strong> overdue</span></div>
      {dailyGroups.length ? <div className={styles.dailyGroups}>{dailyGroups.map(([userId, group]) => <article key={userId} className={styles.dailyPerson}>
        <header><span className={styles.personAvatar}>{group.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div><h3>{group.name}</h3><p>{group.role}</p></div><strong>{group.tasks.filter((task) => task.status === "submitted").length}/{group.tasks.length} delivered</strong></header>
        <div>{group.tasks.map((task) => <button key={task.id} type="button" onClick={() => { toggleTask(task.id); document.getElementById(`task-${task.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><span className={task.status === "submitted" ? styles.doneDot : task.liveLateMinutes ? styles.lateDot : styles.openDot} /><span><strong>{task.title}</strong><small>{timeOnly(task.startAt)} → {timeOnly(task.deadlineAt)}</small></span><em className={task.status === "submitted" ? styles.doneText : task.liveLateMinutes ? styles.lateText : styles.openText}>{statusCopy(task)}</em></button>)}</div>
      </article>)}</div> : <div className={styles.emptyDaily}><CalendarDays size={28} /><strong>No tasks scheduled for this selection.</strong><span>Choose another day or employee, or assign a new task.</span></div>}
    </section>}

    <section className={styles.taskPanel}>
      <header><div><span>TASK WORKSPACE</span><h2>{state.canViewDaily ? "All task details" : "Your tasks"}</h2><p>Open a task to see its brief, grid direction, references, and submission status.</p></div><div className={styles.scopeFilters}>
        <button className={scope === "mine" ? styles.activeFilter : ""} onClick={() => setScope("mine")}>Assigned to me <span>{state.tasks.filter((task) => task.assignedUserId === state.userId).length}</span></button>
        {state.canCreate && <button className={scope === "created" ? styles.activeFilter : ""} onClick={() => setScope("created")}>Created by me <span>{state.tasks.filter((task) => task.createdByUserId === state.userId).length}</span></button>}
        {state.canViewDaily && <button className={scope === "all" ? styles.activeFilter : ""} onClick={() => setScope("all")}>All <span>{state.tasks.length}</span></button>}
        <button className={scope === "submitted" ? styles.activeFilter : ""} onClick={() => setScope("submitted")}>Submitted <span>{state.tasks.filter((task) => task.status === "submitted").length}</span></button>
      </div></header>

      {loading ? <div className={styles.loading}><LoaderCircle size={28} /><strong>Loading tasks…</strong></div> : filteredTasks.length ? <div className={styles.taskList}>{filteredTasks.map((task) => {
        const open = expanded.has(task.id);
        return <article id={`task-${task.id}`} key={task.id} className={`${styles.taskCard} ${task.liveLateMinutes && task.status === "assigned" ? styles.overdueCard : ""}`}>
          <button type="button" className={styles.taskToggle} onClick={() => toggleTask(task.id)} aria-expanded={open}>
            <span className={task.status === "submitted" ? styles.doneIcon : task.liveLateMinutes ? styles.lateIcon : styles.progressIcon}>{task.status === "submitted" ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</span>
            <span className={styles.taskIdentity}><small>#{String(task.id).padStart(4, "0")} · {task.assignedUserName}</small><strong>{task.title}</strong><em>Assigned by {task.createdByName}</em></span>
            <span className={styles.schedule}><small>START</small><strong>{dateTimeLabel(task.startAt)}</strong></span>
            <span className={styles.schedule}><small>DEADLINE</small><strong>{dateTimeLabel(task.deadlineAt)}</strong></span>
            <span className={`${styles.statusBadge} ${task.status === "submitted" ? styles.doneText : task.liveLateMinutes ? styles.lateText : styles.openText}`}>{statusCopy(task)}</span>
            <span className={styles.expandLabel}>{open ? "Hide" : "Details"}<ChevronDown className={open ? styles.rotated : ""} size={16} /></span>
          </button>
          {open && <div className={styles.taskDetails}>
            <div className={styles.detailGrid}>
              <section><span><FileText size={14} /> TASK DETAILS</span><p>{task.details || "No extra details."}</p></section>
              <section><span><FileText size={14} /> BRIEF</span><p>{task.brief || "No brief added."}</p></section>
              <section><span><FileText size={14} /> GRID / LAYOUT DIRECTION</span><p>{task.gridNotes || "No grid direction added."}</p></section>
              <section><span><Link2 size={14} /> REFERENCES · {task.references.length}</span>{task.references.length ? <div className={styles.referenceList}>{task.references.map((reference, index) => <a key={`${reference.url}-${index}`} href={reference.url} target="_blank" rel="noopener noreferrer"><span>{reference.label || `Reference ${index + 1}`}</span><ExternalLink size={13} /></a>)}</div> : <p>No references added.</p>}</section>
            </div>
            <footer><div><span>Assigned to <strong>{task.assignedUserName}</strong> · {task.assignedUserRole}</span>{task.status === "submitted" && <span>Submitted {dateTimeLabel(task.submittedAt)} · {task.lateMinutes ? `${durationLabel(task.lateMinutes)} late` : "on time"}</span>}</div>{task.submissionUrl && <a href={task.submissionUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open submitted link</a>}{task.status === "assigned" && task.assignedUserId === state.userId && <button type="button" onClick={() => { setSubmitting(task); setSubmissionUrl(""); }}><Send size={14} /> Submit completed task</button>}</footer>
          </div>}
        </article>;
      })}</div> : <div className={styles.emptyTasks}><CheckCircle2 size={30} /><strong>No tasks in this view.</strong><span>Assigned work and completed submissions will appear here.</span></div>}
    </section>

    {createOpen && <TaskModal eyebrow="ASSIGN NEW WORK" title="Create a detailed task" description={state.role === "account_manager" ? "Account Managers can assign to the team, excluding administrators and Operation Managers." : "Choose any internal user, define the work, and set an exact start and deadline."} onClose={() => !saving && setCreateOpen(false)}>
      <form className={styles.taskForm} onSubmit={(event) => void createTask(event)}>
        <div className={styles.formGrid}>
          <label><span>Assign to</span><select required value={draft.assignedUserId || ""} onChange={(event) => setDraft((current) => ({ ...current, assignedUserId: Number(event.target.value) }))}><option value="" disabled>Select a team member</option>{state.assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.displayName} · {assignee.employeeTitle || assignee.roleLabel}</option>)}</select></label>
          <label><span>Task title</span><input required minLength={2} maxLength={200} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Example: September grid – Part 1" /></label>
          <label><span>Start date & time</span><input required type="datetime-local" value={draft.startAt} onChange={(event) => setDraft((current) => ({ ...current, startAt: event.target.value }))} /></label>
          <label><span>Deadline</span><input required type="datetime-local" min={draft.startAt} value={draft.deadlineAt} onChange={(event) => setDraft((current) => ({ ...current, deadlineAt: event.target.value }))} /></label>
          <label className={styles.wide}><span>Task details</span><textarea required minLength={3} rows={4} value={draft.details} onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))} placeholder="Write exactly what needs to be delivered…" /></label>
          <label><span>Brief <small>Optional</small></span><textarea rows={4} value={draft.brief} onChange={(event) => setDraft((current) => ({ ...current, brief: event.target.value }))} placeholder="Objectives, tone, audience, or key message…" /></label>
          <label><span>Grid / layout direction <small>Optional</small></span><textarea rows={4} value={draft.gridNotes} onChange={(event) => setDraft((current) => ({ ...current, gridNotes: event.target.value }))} placeholder="Describe the grid or visual layout…" /></label>
        </div>
        <section className={styles.referencesEditor}><header><div><Link2 size={16} /><span><strong>References</strong><small>Add one link or several — all optional.</small></span></div><button type="button" onClick={() => setDraft((current) => ({ ...current, references: [...current.references, { label: "", url: "" }] }))}><Plus size={14} /> Add reference</button></header>
          {draft.references.length ? <div>{draft.references.map((reference, index) => <div className={styles.referenceRow} key={index}><span>{index + 1}</span><input value={reference.label} onChange={(event) => updateReference(index, "label", event.target.value)} placeholder="Reference name" /><input required type="url" value={reference.url} onChange={(event) => updateReference(index, "url", event.target.value)} placeholder="https://…" /><button type="button" onClick={() => setDraft((current) => ({ ...current, references: current.references.filter((_, refIndex) => refIndex !== index) }))} aria-label={`Remove reference ${index + 1}`}><X size={14} /></button></div>)}</div> : <p>No references added yet.</p>}
        </section>
        <footer><button type="button" className={styles.cancelButton} onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</button><button className={styles.saveButton} disabled={saving || !draft.assignedUserId}>{saving ? <><LoaderCircle size={16} /> Assigning…</> : <><Send size={16} /> Assign & notify</>}</button></footer>
      </form>
    </TaskModal>}

    {submitting && <TaskModal eyebrow="TASK DELIVERY" title={`Submit “${submitting.title}”`} description="Confirm the task is complete. The completion time is recorded immediately and compared with the deadline." onClose={() => !saving && setSubmitting(null)}>
      <form className={styles.submitForm} onSubmit={(event) => void submitTask(event)}>
        <div className={styles.submitSummary}><span><Clock3 size={17} /></span><div><small>DEADLINE</small><strong>{dateTimeLabel(submitting.deadlineAt)}</strong><p>{submitting.liveLateMinutes ? `Currently ${durationLabel(submitting.liveLateMinutes)} late` : "Still within the deadline"}</p></div></div>
        <label><span>Completed work link <small>Optional</small></span><div><Link2 size={16} /><input type="url" value={submissionUrl} onChange={(event) => setSubmissionUrl(event.target.value)} placeholder="https://drive.google.com/…" /></div></label>
        <p className={styles.confirmNote}><CheckCircle2 size={15} /> Submission marks this task as completed and records the exact Cairo delivery time.</p>
        <footer><button type="button" className={styles.cancelButton} onClick={() => setSubmitting(null)} disabled={saving}>Back</button><button className={styles.saveButton} disabled={saving}>{saving ? <><LoaderCircle size={16} /> Submitting…</> : <><CheckCircle2 size={16} /> Confirm submission</>}</button></footer>
      </form>
    </TaskModal>}
  </div>;
}
