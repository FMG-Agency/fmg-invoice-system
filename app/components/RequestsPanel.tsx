"use client";

import {
  AlarmClock,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  Paperclip,
  Plus,
  Route,
  ShieldAlert,
  Sunrise,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EmployeeLeaveKind, EmployeeRequest, EmployeeRequestType, RequestsState } from "../types";

const emptyState: RequestsState = {
  requests: [],
  reviewers: [],
  overtimeStartsAt: "19:15",
  workdayStartsAt: "11:00",
  overtimeApprovalAfter: "22:00",
  earlyOvertimeMultiplier: 2.5,
  urgentLeaveDeadline: "12:00",
  urgentLeaveYearLimit: 12,
  sickReportAfterDays: 2,
  resortLeaveDays: 7,
  resortNoticeDays: 14,
  normalLeaveNoticeDays: 2,
  employeeId: null,
  employeeName: "",
  isAdmin: false,
  userId: 0,
  pendingCount: 0,
};

type RequestDraft = {
  type: EmployeeRequestType;
  leaveKind: EmployeeLeaveKind;
  dateFrom: string;
  dateTo: string;
  startTime: string;
  endTime: string;
  details: string;
  attachmentName: string;
  attachmentType: string;
  attachmentBase64: string;
};

const requestTypes: EmployeeRequestType[] = ["leave", "early_leave", "mission", "overtime", "early_arrival"];
const leaveKinds: EmployeeLeaveKind[] = ["vacation", "occasional_leave", "resort_leave", "sick_leave", "urgent_leave", "normal_leave"];

function today() {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function blankDraft(): RequestDraft {
  return {
    type: "leave",
    leaveKind: "vacation",
    dateFrom: today(),
    dateTo: today(),
    startTime: "",
    endTime: "",
    details: "",
    attachmentName: "",
    attachmentType: "",
    attachmentBase64: "",
  };
}

function requestLabel(type: EmployeeRequestType) {
  return {
    leave: "Leave request",
    early_leave: "Early-leave excuse",
    mission: "Work mission",
    overtime: "Overtime approval",
    early_arrival: "Urgent early arrival",
  }[type];
}

function leaveLabel(kind: EmployeeLeaveKind) {
  return {
    vacation: "Annual vacation",
    occasional_leave: "Religious / occasional holiday",
    resort_leave: "Resort leave",
    sick_leave: "Sick leave",
    urgent_leave: "Urgent leave",
    normal_leave: "Normal leave",
  }[kind];
}

function requestDescription(type: EmployeeRequestType, state: RequestsState) {
  return {
    leave: "Reviewer chooses paid or unpaid",
    early_leave: "Approval prevents the half-day deduction",
    mission: `Eligible time after ${timeLabel(state.overtimeStartsAt)} counts as OT`,
    overtime: `Manager approval is required after ${timeLabel(state.overtimeApprovalAfter)}`,
    early_arrival: `Approved urgent work is paid ×${state.earlyOvertimeMultiplier}`,
  }[type];
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${rest ? `${rest}m` : hours ? "" : "0m"}`.trim();
}

function timeLabel(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function dateSpanDays(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1;
}

function typeIcon(type: EmployeeRequestType, size: number) {
  if (type === "leave") return <CalendarDays size={size} />;
  if (type === "early_leave") return <Clock3 size={size} />;
  if (type === "overtime") return <AlarmClock size={size} />;
  if (type === "early_arrival") return <Sunrise size={size} />;
  return <BriefcaseBusiness size={size} />;
}

function policyNote(draft: RequestDraft, state: RequestsState) {
  if (draft.type === "mission") return `Only mission time after ${timeLabel(state.overtimeStartsAt)} is added to overtime after approval.`;
  if (draft.type === "overtime") return `Overtime starts at ${timeLabel(state.overtimeStartsAt)}. Time after ${timeLabel(state.overtimeApprovalAfter)} requires this written manager approval, and overtime is only eligible when arrival is no later than 11:30 AM.`;
  if (draft.type === "early_arrival") return `Submit at least one day before the task. Approved time before ${timeLabel(state.workdayStartsAt)} is paid at ×${state.earlyOvertimeMultiplier}.`;
  if (draft.type !== "leave") return "Approved early leave is recorded as excused and does not trigger the half-day deduction.";
  if (draft.leaveKind === "sick_leave") return `A medical report is required when sick leave exceeds ${state.sickReportAfterDays} days.`;
  if (draft.leaveKind === "urgent_leave") return `Submit by ${timeLabel(state.urgentLeaveDeadline)} on the day, with a maximum of ${state.urgentLeaveYearLimit} urgent requests per year.`;
  if (draft.leaveKind === "resort_leave") return `Maximum ${state.resortLeaveDays} days per request, submitted at least ${state.resortNoticeDays} days in advance.`;
  if (draft.leaveKind === "normal_leave") return `Normal leave must be submitted at least ${state.normalLeaveNoticeDays} days in advance and approved.`;
  return "The reviewer will decide whether this leave is paid or unpaid before approval.";
}

function RequestModal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card request-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><div><span className="eyebrow">EMPLOYEE REQUEST</span><h2>{title}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}

export function RequestsPanel({ showToast }: { showToast: (message: string) => void }) {
  const [state, setState] = useState<RequestsState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine" | "review" | "pending" | "decided">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewing, setReviewing] = useState<EmployeeRequest | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [reviewLeavePaid, setReviewLeavePaid] = useState(true);
  const [draft, setDraft] = useState<RequestDraft>(blankDraft);

  useEffect(() => {
    let cancelled = false;
    async function refresh(showError: boolean) {
      try {
        const response = await fetch("/api/requests", { cache: "no-store" });
        const result = await response.json() as RequestsState | { error?: string };
        if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not load requests.");
        if (!cancelled) setState(result as RequestsState);
      } catch (error) {
        if (!cancelled && showError) showToast(error instanceof Error ? error.message : "Could not load requests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void refresh(true);
    const interval = window.setInterval(() => { void refresh(false); }, 20_000);
    return () => { cancelled = true; window.clearInterval(interval); };
    // Requests refresh in the background so decisions reach employees without a manual reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutate(body: Record<string, unknown>, success: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as RequestsState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not update the request.");
      setState(result as RequestsState);
      showToast(success);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update the request.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function chooseAttachment(file?: File) {
    if (!file) {
      setDraft((current) => ({ ...current, attachmentName: "", attachmentType: "", attachmentBase64: "" }));
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      showToast("Attachments must be PDF, JPG, or PNG files.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast("The attachment must be no larger than 3 MB.");
      return;
    }
    const attachmentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read the attachment."));
      reader.readAsDataURL(file);
    });
    setDraft((current) => ({ ...current, attachmentName: file.name, attachmentType: file.type, attachmentBase64 }));
  }

  async function createRequest(event: React.FormEvent) {
    event.preventDefault();
    const sickDays = draft.type === "leave" && draft.leaveKind === "sick_leave" ? dateSpanDays(draft.dateFrom, draft.dateTo) : 0;
    if (sickDays > state.sickReportAfterDays && !draft.attachmentBase64) {
      showToast(`Attach a medical report for sick leave longer than ${state.sickReportAfterDays} days.`);
      return;
    }
    const saved = await mutate({ action: "create", data: draft }, "Your request was sent to the administrator.");
    if (saved) {
      setCreateOpen(false);
      setDraft(blankDraft());
    }
  }

  async function decide(decision: "approved" | "rejected") {
    if (!reviewing) return;
    const saved = await mutate({ action: "decide", id: reviewing.id, decision, note: decisionNote, leavePaid: reviewLeavePaid }, decision === "approved" ? "Request approved and attendance/payroll updated." : "Request rejected and returned to the employee.");
    if (saved) { setReviewing(null); setDecisionNote(""); }
  }

  const visibleRequests = useMemo(() => state.requests.filter((request) => {
    if (filter === "mine") return state.employeeId !== null && request.employeeId === state.employeeId;
    if (filter === "review") return request.status === "pending" && (state.isAdmin || request.assignedReviewerId === state.userId);
    if (filter === "pending") return request.status === "pending";
    if (filter === "decided") return request.status !== "pending";
    return true;
  }), [filter, state]);

  const approved = state.requests.filter((request) => request.status === "approved").length;
  const approvedOvertime = state.requests
    .filter((request) => request.status === "approved" && ["mission", "overtime", "early_arrival"].includes(request.type))
    .reduce((sum, request) => sum + request.durationMinutes, 0);
  const canCreate = Boolean(state.employeeId);

  return <>
    <section className="request-summary-grid">
      <article className="panel request-summary"><span className="request-summary-icon yellow"><Clock3 size={21} /></span><div><small>PENDING</small><strong>{state.pendingCount}</strong><p>Waiting for a decision</p></div></article>
      <article className="panel request-summary"><span className="request-summary-icon"><FileCheck2 size={21} /></span><div><small>APPROVED</small><strong>{approved}</strong><p>Reflected in attendance</p></div></article>
      <article className="panel request-summary"><span className="request-summary-icon dark"><AlarmClock size={21} /></span><div><small>APPROVED OVERTIME</small><strong>{minutesLabel(approvedOvertime)}</strong><p>Mission, evening & early work</p></div></article>
      <button className="primary-button request-create" onClick={() => setCreateOpen(true)} disabled={!canCreate}><Plus size={17} /> New request</button>
    </section>

    {!loading && !canCreate && <section className="request-link-warning"><ShieldAlert size={20} /><div><strong>Your account is not linked to an employee profile.</strong><p>An administrator can link it from Users & Access. Reviewers can still process requests assigned to them.</p></div></section>}

    <section className="panel data-panel requests-panel">
      <div className="data-tabs request-tabs">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{state.requests.length}</span></button>
        {state.employeeId && <button className={filter === "mine" ? "active" : ""} onClick={() => setFilter("mine")}>My requests <span>{state.requests.filter((request) => request.employeeId === state.employeeId).length}</span></button>}
        {(state.isAdmin || state.requests.some((request) => request.assignedReviewerId === state.userId)) && <button className={filter === "review" ? "active" : ""} onClick={() => setFilter("review")}>Needs review <span>{state.requests.filter((request) => request.status === "pending" && (state.isAdmin || request.assignedReviewerId === state.userId)).length}</span></button>}
        <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Pending</button>
        <button className={filter === "decided" ? "active" : ""} onClick={() => setFilter("decided")}>Decided</button>
      </div>

      {loading ? <div className="empty-panel"><div className="empty-icon"><Clock3 size={24} /></div><h3>Loading employee requests…</h3></div> : visibleRequests.length ? <div className="request-list">{visibleRequests.map((request) => {
        const canReview = request.status === "pending" && (state.isAdmin || request.assignedReviewerId === state.userId);
        const ownRequest = state.employeeId !== null && request.employeeId === state.employeeId && request.requesterUserId === state.userId;
        return <article className="request-card" key={request.id}>
          <div className={`request-type-icon ${request.type}`}>{typeIcon(request.type, 21)}</div>
          <div className="request-card-main">
            <div className="request-card-title"><div><span>{requestLabel(request.type)}</span><h3>{request.employeeName}</h3><small>{request.employeeTitle || "Employee"} · Request #{request.id}</small></div><span className={`request-status ${request.status}`}>{request.status}</span></div>
            <div className="request-meta"><span><CalendarDays size={14} /> {dateLabel(request.dateFrom)}{request.dateTo !== request.dateFrom ? ` → ${dateLabel(request.dateTo)}` : ""}</span>{request.type === "leave" && <span>{leaveLabel(request.leaveKind)}{request.status === "approved" ? ` · ${request.leavePaid === false ? "Unpaid" : "Paid"}` : ""}</span>}{request.startTime && <span><Clock3 size={14} /> {request.startTime}{request.endTime ? ` – ${request.endTime}` : ""}{request.durationMinutes ? ` · ${minutesLabel(request.durationMinutes)} eligible` : request.type === "mission" ? ` · No eligible OT after ${timeLabel(state.overtimeStartsAt)}` : ""}</span>}</div>
            <p className="request-details">{request.details}</p>
            {request.hasAttachment && <a className="request-attachment" href={`/api/requests/attachment/${request.id}`} target="_blank" rel="noreferrer"><Paperclip size={14} /> {request.attachmentName || "View attachment"}</a>}
            <div className="request-route"><Route size={15} /><span>Sent by <strong>{request.requesterName}</strong></span><ArrowRight size={14} /><span>{request.assignedReviewerName ? <>Forwarded to <strong>{request.assignedReviewerName}</strong></> : <strong>Administrator</strong>}</span></div>
            {request.status !== "pending" && <div className={`request-decision-note ${request.status}`}><span>{request.status === "approved" ? <Check size={15} /> : <XCircle size={15} />}</span><p><strong>{request.status === "approved" ? "Approved" : request.status === "rejected" ? "Rejected" : "Cancelled"}{request.reviewedByName ? ` by ${request.reviewedByName}` : ""}</strong>{request.reviewerNote && <small>{request.reviewerNote}</small>}</p></div>}
          </div>
          <div className="request-card-actions">
            {state.isAdmin && request.status === "pending" && <label><span>Forward to</span><select value={request.assignedReviewerId ?? ""} disabled={saving} onChange={(event) => void mutate({ action: "assign", id: request.id, reviewerId: event.target.value ? Number(event.target.value) : null }, event.target.value ? "Request forwarded to the selected reviewer." : "Request returned to administrator review.")}><option value="">Administrator only</option>{state.reviewers.filter((reviewer) => reviewer.id !== request.requesterUserId).map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} · {reviewer.roleLabel}</option>)}</select></label>}
            {canReview && <button className="table-review" onClick={() => { setReviewing(request); setDecisionNote(""); setReviewLeavePaid(request.leavePaid ?? true); }}><FileCheck2 size={15} /> Review request</button>}
            {ownRequest && request.status === "pending" && <button className="request-cancel" disabled={saving} onClick={() => window.confirm("Cancel this pending request?") && void mutate({ action: "cancel", id: request.id }, "Request cancelled.")}><X size={15} /> Cancel</button>}
          </div>
        </article>;
      })}</div> : <div className="empty-panel"><div className="empty-icon"><CalendarDays size={24} /></div><h3>No requests in this view</h3><p>{canCreate ? "Create a leave, excuse, mission, or overtime approval request." : "Requests assigned to you will appear here."}</p>{canCreate && <button className="small-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> New request</button>}</div>}
    </section>

    {createOpen && <RequestModal title="Send a new request" description={`This written request will be recorded for ${state.employeeName} and delivered to the administrator.`} onClose={() => setCreateOpen(false)}>
      <form className="modal-form" onSubmit={createRequest}>
        <div className="request-type-picker">{requestTypes.map((type) => <button type="button" key={type} className={draft.type === type ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, type, dateTo: type === "leave" ? current.dateTo : current.dateFrom, startTime: "", endTime: "" }))}>{typeIcon(type, 18)}<span><strong>{requestLabel(type)}</strong><small>{requestDescription(type, state)}</small></span></button>)}</div>
        <div className="form-grid">
          {draft.type === "leave" && <label className="field"><span>Leave type</span><select value={draft.leaveKind} onChange={(event) => setDraft({ ...draft, leaveKind: event.target.value as EmployeeLeaveKind })}>{leaveKinds.map((kind) => <option value={kind} key={kind}>{leaveLabel(kind)}</option>)}</select></label>}
          <label className="field"><span>{draft.type === "leave" ? "From date" : "Request date"}</span><input required type="date" min={today()} value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value, dateTo: draft.type === "leave" && draft.dateTo >= event.target.value ? draft.dateTo : event.target.value })} /></label>
          {draft.type === "leave" && <label className="field"><span>To date</span><input required type="date" min={draft.dateFrom} value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></label>}
          {draft.type === "early_leave" && <label className="field"><span>Leaving time</span><input required type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label>}
          {draft.type === "early_arrival" && <label className="field"><span>Early arrival time</span><input required type="time" max={state.workdayStartsAt} value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label>}
          {(draft.type === "mission" || draft.type === "overtime") && <><label className="field"><span>{draft.type === "mission" ? "Mission" : "Overtime"} starts</span><input required type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label><label className="field"><span>{draft.type === "mission" ? "Mission" : "Overtime"} ends</span><input required type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></label></>}
          <label className="field wide"><span>Reason & task details</span><textarea required minLength={5} rows={5} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} placeholder={draft.type === "mission" ? "Where is the mission, for which client/project, and what work will be completed?" : draft.type === "early_arrival" ? "Describe the urgent task agreed with your manager." : "Explain the reason and all information the reviewer needs."} /></label>
          <label className="field wide"><span>Attachment <small>PDF, JPG or PNG · maximum 3 MB</small></span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => void chooseAttachment(event.target.files?.[0])} />{draft.attachmentName && <small className="field-hint"><Paperclip size={13} /> {draft.attachmentName}</small>}</label>
        </div>
        <div className="request-payroll-note">{typeIcon(draft.type, 17)}<span>{policyNote(draft, state)}</span></div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Sending…" : "Send request"}</button></div>
      </form>
    </RequestModal>}

    {reviewing && <RequestModal title={`Review request #${reviewing.id}`} description={`${reviewing.employeeName} · ${requestLabel(reviewing.type)} · ${dateLabel(reviewing.dateFrom)}`} onClose={() => setReviewing(null)}>
      <div className="request-review-summary"><span className={`request-type-icon ${reviewing.type}`}>{typeIcon(reviewing.type, 20)}</span><div><strong>{reviewing.details}</strong><p>{reviewing.type === "leave" ? leaveLabel(reviewing.leaveKind) : reviewing.startTime ? `${reviewing.startTime}${reviewing.endTime ? ` – ${reviewing.endTime}` : ""}` : ""}{reviewing.durationMinutes ? ` · ${minutesLabel(reviewing.durationMinutes)} eligible` : ""}</p></div></div>
      {reviewing.hasAttachment && <a className="request-attachment review" href={`/api/requests/attachment/${reviewing.id}`} target="_blank" rel="noreferrer"><Paperclip size={15} /> Open {reviewing.attachmentName || "attachment"}</a>}
      {reviewing.type === "leave" && <label className="field"><span>Payroll treatment <small>Chosen by the reviewer</small></span><select value={reviewLeavePaid ? "paid" : "unpaid"} onChange={(event) => setReviewLeavePaid(event.target.value === "paid")}><option value="paid">Paid leave · no salary deduction</option><option value="unpaid">Unpaid leave · deduct the configured daily amount</option></select></label>}
      <label className="field"><span>Decision note <small>Visible to the employee</small></span><textarea rows={4} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Add the manager's approval note, or explain the rejection." /></label>
      <div className="request-decision-actions"><button className="reject-button" disabled={saving} onClick={() => void decide("rejected")}><XCircle size={17} /> Reject</button><button className="approve-button" disabled={saving} onClick={() => void decide("approved")}><Check size={17} /> Approve & apply</button></div>
    </RequestModal>}
  </>;
}
