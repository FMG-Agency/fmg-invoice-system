"use client";

import { Building2, Check, KeyRound, Pencil, Plus, ShieldCheck, UserCog, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ACCESS_PERMISSIONS, ACCOUNT_MANAGER_PERMISSIONS, OPERATION_MANAGER_PERMISSIONS, PRODUCTION_MANAGER_PERMISSIONS, type AccessPermission } from "../lib/permissions";
import type { ManagedUser } from "../types";

type UserDraft = {
  username: string;
  displayName: string;
  roleLabel: string;
  password: string;
  active: boolean;
  permissions: AccessPermission[];
  employeeId: number | null;
  clientId: number | null;
};

type AccountGroup = "employees" | "clients";
type EmployeeOption = { id: number; name: string; title: string; department: string };
type ClientOption = { id: number; name: string; companyName: string; ownerName: string };

const accountManagerDraft: UserDraft = {
  username: "",
  displayName: "",
  roleLabel: "Account Manager",
  password: "",
  active: true,
  permissions: [...ACCOUNT_MANAGER_PERMISSIONS],
  employeeId: null,
  clientId: null,
};

const clientPortalDraft: UserDraft = {
  username: "",
  displayName: "",
  roleLabel: "Client Portal",
  password: "",
  active: true,
  permissions: ["client_portal"],
  employeeId: null,
  clientId: null,
};

function isClientAccount(user: ManagedUser) {
  return user.clientId !== null
    || (!user.isAdmin && user.permissions.length === 1 && user.permissions[0] === "client_portal")
    || user.roleLabel.trim().toLowerCase() === "client portal";
}

function userInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function AccessModal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card access-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><div><span className="eyebrow">FMG ACCESS CONTROL</span><h2>{title}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}

export function AccessPanel({ showToast }: { showToast: (message: string) => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [activeGroup, setActiveGroup] = useState<AccountGroup>("employees");
  const [modalGroup, setModalGroup] = useState<AccountGroup>("employees");
  const [draft, setDraft] = useState<UserDraft>(accountManagerDraft);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/users", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { users?: ManagedUser[]; employees?: EmployeeOption[]; clients?: ClientOption[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load users.");
        if (!cancelled) { setUsers(result.users ?? []); setEmployees(result.employees ?? []); setClients(result.clients ?? []); }
      })
      .catch((error: unknown) => {
        if (!cancelled) showToast(error instanceof Error ? error.message : "Could not load users.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Loading is tied to mounting this admin-only page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientUsers = useMemo(() => users.filter(isClientAccount), [users]);
  const employeeUsers = useMemo(() => users.filter((user) => !isClientAccount(user)), [users]);
  const visibleUsers = activeGroup === "clients" ? clientUsers : employeeUsers;
  const activeVisibleUsers = visibleUsers.filter((user) => user.active).length;

  function openCreate(group: AccountGroup = activeGroup) {
    setEditing(null);
    setModalGroup(group);
    setDraft(group === "clients"
      ? { ...clientPortalDraft, permissions: ["client_portal"] }
      : { ...accountManagerDraft, permissions: [...ACCOUNT_MANAGER_PERMISSIONS] });
    setOpen(true);
  }

  function openEdit(user: ManagedUser) {
    if (user.isAdmin) return;
    const group = isClientAccount(user) ? "clients" : "employees";
    setEditing(user);
    setModalGroup(group);
    setDraft({
      username: user.username,
      displayName: user.displayName,
      roleLabel: group === "clients" ? "Client Portal" : user.roleLabel,
      password: "",
      active: user.active,
      permissions: group === "clients" ? ["client_portal"] : [...user.permissions],
      employeeId: group === "employees" ? user.employeeId : null,
      clientId: group === "clients" ? user.clientId : null,
    });
    setOpen(true);
  }

  function togglePermission(permission: AccessPermission) {
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission],
    }));
  }

  function applyWorkflowPreset(role: "account" | "production" | "operation") {
    const preset = role === "account"
      ? { roleLabel: "Account Manager", permissions: ACCOUNT_MANAGER_PERMISSIONS }
      : role === "production"
        ? { roleLabel: "Production Manager", permissions: PRODUCTION_MANAGER_PERMISSIONS }
        : { roleLabel: "Operation Manager", permissions: OPERATION_MANAGER_PERMISSIONS };
    setDraft((current) => ({ ...current, roleLabel: preset.roleLabel, permissions: [...preset.permissions], clientId: null }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (modalGroup === "clients" && !draft.clientId) return showToast("Choose the client linked to this portal user.");
    if (modalGroup === "employees" && !draft.permissions.length) return showToast("Choose at least one area for this employee user.");
    if (!editing && draft.password.length < 8) return showToast("Use at least 8 characters for the password.");
    const submittedDraft: UserDraft = modalGroup === "clients"
      ? { ...draft, roleLabel: "Client Portal", permissions: ["client_portal"], employeeId: null }
      : { ...draft, clientId: null };
    setSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing ? { action: "update", id: editing.id, data: submittedDraft } : { action: "create", data: submittedDraft }),
      });
      const result = await response.json() as { users?: ManagedUser[]; employees?: EmployeeOption[]; clients?: ClientOption[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save the user.");
      setUsers(result.users ?? []);
      setEmployees(result.employees ?? []);
      setClients(result.clients ?? []);
      setOpen(false);
      showToast(editing
        ? `${modalGroup === "clients" ? "Client" : "Employee"} user access updated immediately.`
        : `${modalGroup === "clients" ? "Client portal" : "Employee"} user created and ready to sign in.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the user.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="access-overview">
      <article className="panel access-stat"><span className="access-stat-icon"><UserRound size={21} /></span><div><small>EMPLOYEE USERS</small><strong>{employeeUsers.length}</strong><p>{employeeUsers.filter((user) => user.active).length} active internal accounts</p></div></article>
      <article className="panel access-stat"><span className="access-stat-icon yellow"><Building2 size={21} /></span><div><small>CLIENT USERS</small><strong>{clientUsers.length}</strong><p>{clientUsers.filter((user) => user.active).length} active portal accounts</p></div></article>
      <button className="primary-button access-create" onClick={() => openCreate(activeGroup)}><Plus size={17} /> Add {activeGroup === "clients" ? "client user" : "employee user"}</button>
    </section>

    <section className="panel data-panel">
      <div className="toolbar access-toolbar">
        <div className="access-group-tabs" role="tablist" aria-label="User type">
          <button type="button" role="tab" aria-selected={activeGroup === "employees"} className={activeGroup === "employees" ? "access-group-tab active" : "access-group-tab"} onClick={() => setActiveGroup("employees")}>
            <UserRound size={18} /><span><strong>Employee Users</strong><small>Internal team & administrators</small></span><em>{employeeUsers.length}</em>
          </button>
          <button type="button" role="tab" aria-selected={activeGroup === "clients"} className={activeGroup === "clients" ? "access-group-tab active" : "access-group-tab"} onClick={() => setActiveGroup("clients")}>
            <Building2 size={18} /><span><strong>Client Users</strong><small>Private client portal accounts</small></span><em>{clientUsers.length}</em>
          </button>
        </div>
        <div className="toolbar-spacer" />
        <span className="record-count">{activeVisibleUsers} active · {visibleUsers.length} total</span>
        <button className="small-primary" onClick={() => openCreate(activeGroup)}><Plus size={15} /> Add {activeGroup === "clients" ? "client" : "employee"}</button>
      </div>

      {loading ? <div className="empty-panel"><div className="empty-icon"><UserCog size={24} /></div><h3>Loading users…</h3></div> : activeGroup === "employees" ? <EmployeeUsersTable users={employeeUsers} openEdit={openEdit} openCreate={() => openCreate("employees")} /> : <ClientUsersTable users={clientUsers} openEdit={openEdit} openCreate={() => openCreate("clients")} />}
    </section>

    {open && <AccessModal
      title={editing ? `Edit ${editing.displayName}` : modalGroup === "clients" ? "Create client user" : "Create employee user"}
      description={modalGroup === "clients" ? "Link this login to one client. The account can only open that client's private portal." : "Link an internal account to an employee and choose exactly which FMG areas it can open."}
      onClose={() => setOpen(false)}>
      <form className="modal-form" onSubmit={save}>
        {modalGroup === "employees" && <div className="access-preset"><div><ShieldCheck size={17} /><span><strong>Ready-made employee presets</strong><small>Start with a workflow role, then adjust individual permissions if needed.</small></span></div><div className="access-preset-actions"><button type="button" className="secondary-button" onClick={() => applyWorkflowPreset("account")}>Account Manager</button><button type="button" className="secondary-button" onClick={() => applyWorkflowPreset("production")}>Production Manager</button><button type="button" className="secondary-button" onClick={() => applyWorkflowPreset("operation")}>Operation Manager</button></div></div>}
        <div className="form-grid">
          <label className="field"><span>Display name</span><input required value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder={modalGroup === "clients" ? "e.g. Lewis Jewellery" : "e.g. Ahmed Hassan"} /></label>
          {modalGroup === "employees" && <label className="field"><span>Role / title</span><input required value={draft.roleLabel} onChange={(event) => setDraft({ ...draft, roleLabel: event.target.value })} /></label>}
          <label className="field"><span>Username</span><input required minLength={3} pattern="[A-Za-z0-9._-]+" autoComplete="off" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} placeholder={modalGroup === "clients" ? "lewis.portal" : "operation.manager"} /></label>
          <label className="field"><span>{editing ? "New password" : "Temporary password"}<small>{editing ? "Leave blank to keep it" : "At least 8 characters"}</small></span><input type="password" minLength={editing ? undefined : 8} required={!editing} autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /></label>
          {modalGroup === "employees" ? <label className="field"><span>Linked employee <small>For requests and employee records</small></span><select value={draft.employeeId ?? ""} onChange={(event) => setDraft({ ...draft, employeeId: event.target.value ? Number(event.target.value) : null, clientId: null })}><option value="">No employee linked</option>{employees.filter((employee) => !users.some((user) => user.id !== editing?.id && user.employeeId === employee.id)).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.title ? ` · ${employee.title}` : ""}{employee.department ? ` · ${employee.department}` : ""}</option>)}</select></label> : <label className="field"><span>Linked client <small>Required for the private portal</small></span><select required value={draft.clientId ?? ""} onChange={(event) => {
            const clientId = event.target.value ? Number(event.target.value) : null;
            const client = clients.find((item) => item.id === clientId);
            setDraft({ ...draft, clientId, employeeId: null, roleLabel: "Client Portal", permissions: ["client_portal"], displayName: draft.displayName || client?.companyName || client?.name || "" });
          }}><option value="">Choose client</option>{clients.filter((client) => !users.some((user) => user.id !== editing?.id && user.clientId === client.id)).map((client) => <option key={client.id} value={client.id}>{client.companyName || client.name}{client.ownerName ? ` · ${client.ownerName}` : ""}</option>)}</select></label>}
        </div>

        {modalGroup === "employees" ? <>
          <div className="permission-heading"><div><KeyRound size={17} /><span><strong>Allowed areas</strong><small>The employee only sees the checked sections.</small></span></div><span>{draft.permissions.length} selected</span></div>
          <div className="permission-grid">{ACCESS_PERMISSIONS.map((permission) => {
            const checked = draft.permissions.includes(permission.key);
            const privateArea = permission.key === "employees" || permission.key === "attendance";
            return <button type="button" key={permission.key} className={checked ? "permission-option selected" : "permission-option"} onClick={() => togglePermission(permission.key)} aria-pressed={checked}><span className="permission-check">{checked && <Check size={14} />}</span><span><strong>{permission.label}</strong><small>{permission.description}</small></span>{privateArea && <em>Private</em>}</button>;
          })}</div>
        </> : <div className="access-client-scope"><span><KeyRound size={18} /></span><div><strong>Client Portal access only</strong><p>This user can see only the invoices and monthly plans for the linked client. Internal FMG areas remain hidden.</p></div><em>PRIVATE</em></div>}

        <label className="check-field access-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Active account can sign in</span></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : editing ? "Save access" : modalGroup === "clients" ? "Create client user" : "Create employee user"}</button></div>
      </form>
    </AccessModal>}
  </>;
}

function EmployeeUsersTable({ users, openEdit, openCreate }: { users: ManagedUser[]; openEdit: (user: ManagedUser) => void; openCreate: () => void }) {
  if (!users.length) return <div className="empty-panel"><div className="empty-icon"><UserRound size={24} /></div><h3>No employee users yet</h3><p>Create an internal account, link it to an employee, and choose the areas they can access.</p><button className="small-primary" onClick={openCreate}><Plus size={15} /> Add employee user</button></div>;
  return <div className="table-scroll"><table className="data-table access-table"><thead><tr><th>Employee user</th><th>Role</th><th>Username</th><th>Linked employee</th><th>Allowed areas</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className={!user.active ? "muted-row" : ""}>
    <td><div className="client-cell"><span className="avatar-soft">{userInitials(user.displayName)}</span><span><strong>{user.displayName}</strong><small>{user.isAdmin ? "Primary administrator" : "Internal FMG account"}</small></span></div></td>
    <td><span className={user.isAdmin ? "access-role admin" : "access-role"}>{user.roleLabel}</span></td>
    <td><strong className="table-main">{user.username}</strong></td>
    <td>{user.employeeName ? <span className="access-linked-profile"><UserRound size={13} /> {user.employeeName}</span> : <span className="table-sub">Not linked</span>}</td>
    <td><div className="permission-summary">{user.isAdmin ? <span>Full access</span> : user.permissions.map((permission) => <span key={permission}>{ACCESS_PERMISSIONS.find((item) => item.key === permission)?.label ?? permission}</span>)}</div></td>
    <td><span className={user.active ? "hr-status active" : "hr-status inactive"}>{user.active ? "Active" : "Inactive"}</span></td>
    <td>{user.isAdmin ? <small className="table-sub">Edit login in Settings</small> : <button className="table-review" onClick={() => openEdit(user)}><Pencil size={15} /> Edit access</button>}</td>
  </tr>)}</tbody></table></div>;
}

function ClientUsersTable({ users, openEdit, openCreate }: { users: ManagedUser[]; openEdit: (user: ManagedUser) => void; openCreate: () => void }) {
  if (!users.length) return <div className="empty-panel"><div className="empty-icon"><Building2 size={24} /></div><h3>No client users yet</h3><p>Create a private portal login and link it to exactly one client.</p><button className="small-primary" onClick={openCreate}><Plus size={15} /> Add client user</button></div>;
  return <div className="table-scroll"><table className="data-table access-table"><thead><tr><th>Client user</th><th>Linked client</th><th>Username</th><th>Access</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className={!user.active ? "muted-row" : ""}>
    <td><div className="client-cell"><span className="avatar-soft client-avatar"><Building2 size={15} /></span><span><strong>{user.displayName}</strong><small>Private portal account</small></span></div></td>
    <td>{user.clientName ? <span className="access-linked-profile client"><Building2 size={13} /> {user.clientName}</span> : <span className="access-link-warning">Client link required</span>}</td>
    <td><strong className="table-main">{user.username}</strong></td>
    <td><div className="permission-summary"><span>Client Portal only</span></div></td>
    <td><span className={user.active ? "hr-status active" : "hr-status inactive"}>{user.active ? "Active" : "Inactive"}</span></td>
    <td><button className="table-review" onClick={() => openEdit(user)}><Pencil size={15} /> Edit client user</button></td>
  </tr>)}</tbody></table></div>;
}
