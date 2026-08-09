"use client";

import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, Clock3, FileCheck2, Plus, Route, ShieldAlert, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EmployeeLeaveKind, EmployeeRequest, EmployeeRequestType, RequestsState } from "../types";

const emptyState: RequestsState = { requests: [], reviewers: [], employeeId: null, employeeName: "", isAdmin: false, userId: 0, pendingCount: 0 };

function today() {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function requestLabel(type: EmployeeRequestType) {
  return type === "leave" ? "Leave request" : type === "early_leave" ? "Early-leave excuse" : "Work mission";
}

function leaveLabel(kind: EmployeeLeaveKind) {
  return { vacation: "Annual vacation", sick_leave: "Sick leave", urgent_leave: "Urgent leave", normal_leave: "Normal leave" }[kind];
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${rest ? `${rest}m` : hours ? "" : "0m"}`.trim();
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
  const [draft, setDraft] = useState({
    type: "leave" as EmployeeRequestType,
    leaveKind: "vacation" as EmployeeLeaveKind,
    dateFrom: today(),
    dateTo: today(),
    startTime: "",
    endTime: "",
    details: "",
  });

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

  async function createRequest(event: React.FormEvent) {
    event.preventDefault();
    const saved = await mutate({ action: "create", data: draft }, "Your request was sent to the administrator.");
    if (saved) {
      setCreateOpen(false);
      setDraft({ type: "leave", leaveKind: "vacation", dateFrom: today(), dateTo: today(), startTime: "", endTime: "", details: "" });
    }
  }

  async function decide(decision: "approved" | "rejected") {
    if (!reviewing) return;
    const saved = await mutate({ action: "decide", id: reviewing.id, decision, note: decisionNote }, decision === "approved" ? "Request approved and attendance/payroll updated." : "Request rejected and returned to the employee.");
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
  const missionMinutes = state.requests.filter((request) => request.status === "approved" && request.type === "mission").reduce((sum, request) => sum + request.durationMinutes, 0);
  const canCreate = Boolean(state.employeeId);

  return <>
    <section className="request-summary-grid">
      <article className="panel request-summary"><span className="request-summary-icon yellow"><Clock3 size={21} /></span><div><small>PENDING</small><strong>{state.pendingCount}</strong><p>Waiting for a decision</p></div></article>
      <article className="panel request-summary"><span className="request-summary-icon"><FileCheck2 size={21} /></span><div><small>APPROVED</small><strong>{approved}</strong><p>Reflected in attendance</p></div></article>
      <article className="panel request-summary"><span className="request-summary-icon dark"><BriefcaseBusiness size={21} /></span><div><small>MISSION OVERTIME</small><strong>{minutesLabel(missionMinutes)}</strong><p>Approved mission time</p></div></article>
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
          <div className={`request-type-icon ${request.type}`}>{request.type === "leave" ? <CalendarDays size={21} /> : request.type === "early_leave" ? <Clock3 size={21} /> : <BriefcaseBusiness size={21} />}</div>
          <div className="request-card-main">
            <div className="request-card-title"><div><span>{requestLabel(request.type)}</span><h3>{request.employeeName}</h3><small>{request.employeeTitle || "Employee"} · Request #{request.id}</small></div><span className={`request-status ${request.status}`}>{request.status}</span></div>
            <div className="request-meta"><span><CalendarDays size={14} /> {dateLabel(request.dateFrom)}{request.dateTo !== request.dateFrom ? ` → ${dateLabel(request.dateTo)}` : ""}</span>{request.type === "leave" && <span>{leaveLabel(request.leaveKind)}</span>}{request.startTime && <span><Clock3 size={14} /> {request.startTime}{request.endTime ? ` – ${request.endTime}` : ""}{request.durationMinutes ? ` · ${minutesLabel(request.durationMinutes)}` : ""}</span>}</div>
            <p className="request-details">{request.details}</p>
            <div className="request-route"><Route size={15} /><span>Sent by <strong>{request.requesterName}</strong></span><ArrowRight size={14} /><span>{request.assignedReviewerName ? <>Forwarded to <strong>{request.assignedReviewerName}</strong></> : <strong>Administrator</strong>}</span></div>
            {request.status !== "pending" && <div className={`request-decision-note ${request.status}`}><span>{request.status === "approved" ? <Check size={15} /> : <XCircle size={15} />}</span><p><strong>{request.status === "approved" ? "Approved" : request.status === "rejected" ? "Rejected" : "Cancelled"}{request.reviewedByName ? ` by ${request.reviewedByName}` : ""}</strong>{request.reviewerNote && <small>{request.reviewerNote}</small>}</p></div>}
          </div>
          <div className="request-card-actions">
            {state.isAdmin && request.status === "pending" && <label><span>Forward to</span><select value={request.assignedReviewerId ?? ""} disabled={saving} onChange={(event) => void mutate({ action: "assign", id: request.id, reviewerId: event.target.value ? Number(event.target.value) : null }, event.target.value ? "Request forwarded to the selected reviewer." : "Request returned to administrator review.")}><option value="">Administrator only</option>{state.reviewers.filter((reviewer) => reviewer.id !== request.requesterUserId).map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} · {reviewer.roleLabel}</option>)}</select></label>}
            {canReview && <button className="table-review" onClick={() => { setReviewing(request); setDecisionNote(""); }}><FileCheck2 size={15} /> Review request</button>}
            {ownRequest && request.status === "pending" && <button className="request-cancel" disabled={saving} onClick={() => window.confirm("Cancel this pending request?") && void mutate({ action: "cancel", id: request.id }, "Request cancelled.")}><X size={15} /> Cancel</button>}
          </div>
        </article>;
      })}</div> : <div className="empty-panel"><div className="empty-icon"><CalendarDays size={24} /></div><h3>No requests in this view</h3><p>{canCreate ? "Create a leave, early-leave excuse, or work-mission request." : "Requests assigned to you will appear here."}</p>{canCreate && <button className="small-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> New request</button>}</div>}
    </section>

    {createOpen && <RequestModal title="Send a new request" description={`This request will be recorded for ${state.employeeName} and delivered to the administrator.`} onClose={() => setCreateOpen(false)}>
      <form className="modal-form" onSubmit={createRequest}>
        <div className="request-type-picker">{(["leave", "early_leave", "mission"] as EmployeeRequestType[]).map((type) => <button type="button" key={type} className={draft.type === type ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, type, dateTo: type === "leave" ? current.dateTo : current.dateFrom, startTime: "", endTime: "" }))}>{type === "leave" ? <CalendarDays size={18} /> : type === "early_leave" ? <Clock3 size={18} /> : <BriefcaseBusiness size={18} />}<span><strong>{requestLabel(type)}</strong><small>{type === "leave" ? "Paid or policy leave" : type === "early_leave" ? "No attendance deduction" : "Counts as overtime"}</small></span></button>)}</div>
        <div className="form-grid">
          {draft.type === "leave" && <label className="field"><span>Leave type</span><select value={draft.leaveKind} onChange={(event) => setDraft({ ...draft, leaveKind: event.target.value as EmployeeLeaveKind })}><option value="vacation">Annual vacation</option><option value="sick_leave">Sick leave</option><option value="urgent_leave">Urgent leave</option><option value="normal_leave">Normal leave</option></select></label>}
          <label className="field"><span>{draft.type === "leave" ? "From date" : "Request date"}</span><input required type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value, dateTo: draft.type === "leave" ? draft.dateTo : event.target.value })} /></label>
          {draft.type === "leave" && <label className="field"><span>To date</span><input required type="date" min={draft.dateFrom} value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></label>}
          {draft.type === "early_leave" && <label className="field"><span>Leaving time</span><input required type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label>}
          {draft.type === "mission" && <><label className="field"><span>Mission starts</span><input required type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label><label className="field"><span>Mission ends</span><input required type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></label></>}
          <label className="field wide"><span>Details</span><textarea required minLength={5} rows={5} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} placeholder={draft.type === "mission" ? "Where is the mission, for which client/project, and what work will be completed?" : "Explain the reason and any information the reviewer needs."} /></label>
        </div>
        {draft.type === "mission" && <div className="request-payroll-note"><BriefcaseBusiness size={17} /><span>After approval, the mission duration is added to this employee&apos;s overtime and payroll Excel automatically.</span></div>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Sending…" : "Send request"}</button></div>
      </form>
    </RequestModal>}

    {reviewing && <RequestModal title={`Review request #${reviewing.id}`} description={`${reviewing.employeeName} · ${requestLabel(reviewing.type)} · ${dateLabel(reviewing.dateFrom)}`} onClose={() => setReviewing(null)}>
      <div className="request-review-summary"><span className={`request-type-icon ${reviewing.type}`}>{reviewing.type === "leave" ? <CalendarDays size={20} /> : reviewing.type === "early_leave" ? <Clock3 size={20} /> : <BriefcaseBusiness size={20} />}</span><div><strong>{reviewing.details}</strong><p>{reviewing.type === "leave" ? leaveLabel(reviewing.leaveKind) : reviewing.startTime ? `${reviewing.startTime}${reviewing.endTime ? ` – ${reviewing.endTime}` : ""}` : ""}{reviewing.durationMinutes ? ` · ${minutesLabel(reviewing.durationMinutes)} will be added as overtime` : ""}</p></div></div>
      <label className="field"><span>Decision note <small>Visible to the employee</small></span><textarea rows={4} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Optional approval note, or explain the rejection." /></label>
      <div className="request-decision-actions"><button className="reject-button" disabled={saving} onClick={() => void decide("rejected")}><XCircle size={17} /> Reject</button><button className="approve-button" disabled={saving} onClick={() => void decide("approved")}><Check size={17} /> Approve & apply</button></div>
    </RequestModal>}
  </>;
}
