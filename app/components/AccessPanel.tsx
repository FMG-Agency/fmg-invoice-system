"use client";

import { Check, KeyRound, Pencil, Plus, ShieldCheck, UserCog, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ACCESS_PERMISSIONS, OPERATION_MANAGER_PERMISSIONS, type AccessPermission } from "../lib/permissions";
import type { ManagedUser } from "../types";

type UserDraft = {
  username: string;
  displayName: string;
  roleLabel: string;
  password: string;
  active: boolean;
  permissions: AccessPermission[];
};

const operationManagerDraft: UserDraft = {
  username: "",
  displayName: "",
  roleLabel: "Operation Manager",
  password: "",
  active: true,
  permissions: [...OPERATION_MANAGER_PERMISSIONS],
};

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [draft, setDraft] = useState<UserDraft>(operationManagerDraft);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/users", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { users?: ManagedUser[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load users.");
        if (!cancelled) setUsers(result.users ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) showToast(error instanceof Error ? error.message : "Could not load users.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Loading is tied to mounting this admin-only page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeUsers = useMemo(() => users.filter((user) => user.active).length, [users]);

  function openCreate() {
    setEditing(null);
    setDraft({ ...operationManagerDraft, permissions: [...OPERATION_MANAGER_PERMISSIONS] });
    setOpen(true);
  }

  function openEdit(user: ManagedUser) {
    if (user.isAdmin) return;
    setEditing(user);
    setDraft({ username: user.username, displayName: user.displayName, roleLabel: user.roleLabel, password: "", active: user.active, permissions: [...user.permissions] });
    setOpen(true);
  }

  function togglePermission(permission: AccessPermission) {
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission],
    }));
  }

  function applyOperationManagerPreset() {
    setDraft((current) => ({ ...current, roleLabel: "Operation Manager", permissions: [...OPERATION_MANAGER_PERMISSIONS] }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.permissions.length) return showToast("Choose at least one area for this user.");
    if (!editing && draft.password.length < 8) return showToast("Use at least 8 characters for the password.");
    setSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing ? { action: "update", id: editing.id, data: draft } : { action: "create", data: draft }),
      });
      const result = await response.json() as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save the user.");
      setUsers(result.users ?? []);
      setOpen(false);
      showToast(editing ? "User access updated immediately." : "New user created and ready to sign in.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the user.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="access-overview">
      <article className="panel access-stat"><span className="access-stat-icon"><UsersRound size={21} /></span><div><small>TOTAL USERS</small><strong>{users.length}</strong><p>{activeUsers} active accounts</p></div></article>
      <article className="panel access-stat"><span className="access-stat-icon yellow"><ShieldCheck size={21} /></span><div><small>ACCESS MODEL</small><strong>Per user</strong><p>Changes apply to active sessions immediately</p></div></article>
      <button className="primary-button access-create" onClick={openCreate}><Plus size={17} /> Add user</button>
    </section>

    <section className="panel data-panel">
      <div className="toolbar"><div><span className="eyebrow">USERS & ACCESS</span><h2 className="access-title">Team accounts</h2></div><div className="toolbar-spacer" /><span className="record-count">Only administrators can manage this page</span></div>
      {loading ? <div className="empty-panel"><div className="empty-icon"><UserCog size={24} /></div><h3>Loading users…</h3></div> : users.length ? <div className="table-scroll"><table className="data-table access-table"><thead><tr><th>User</th><th>Role</th><th>Username</th><th>Allowed areas</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className={!user.active ? "muted-row" : ""}>
        <td><div className="client-cell"><span className="avatar-soft">{user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"}</span><span><strong>{user.displayName}</strong><small>{user.isAdmin ? "Primary administrator" : "FMG team account"}</small></span></div></td>
        <td><span className={user.isAdmin ? "access-role admin" : "access-role"}>{user.roleLabel}</span></td>
        <td><strong className="table-main">{user.username}</strong></td>
        <td><div className="permission-summary">{user.isAdmin ? <span>Full access</span> : user.permissions.map((permission) => <span key={permission}>{ACCESS_PERMISSIONS.find((item) => item.key === permission)?.label ?? permission}</span>)}</div></td>
        <td><span className={user.active ? "hr-status active" : "hr-status inactive"}>{user.active ? "Active" : "Inactive"}</span></td>
        <td>{user.isAdmin ? <small className="table-sub">Edit login in Settings</small> : <button className="table-review" onClick={() => openEdit(user)}><Pencil size={15} /> Edit access</button>}</td>
      </tr>)}</tbody></table></div> : <div className="empty-panel"><div className="empty-icon"><UsersRound size={24} /></div><h3>Create your first team account</h3><p>The Operation Manager preset keeps employee and attendance data private.</p><button className="small-primary" onClick={openCreate}><Plus size={15} /> Add user</button></div>}
    </section>

    {open && <AccessModal title={editing ? `Edit ${editing.displayName}` : "Create team user"} description="Choose exactly which FMG areas this account can open. Passwords are encrypted before storage." onClose={() => setOpen(false)}>
      <form className="modal-form" onSubmit={save}>
        <div className="access-preset"><div><ShieldCheck size={17} /><span><strong>Operation Manager preset</strong><small>Documents, clients, categories, and archive — without Employees or Attendance.</small></span></div><button type="button" className="secondary-button" onClick={applyOperationManagerPreset}>Apply preset</button></div>
        <div className="form-grid">
          <label className="field"><span>Display name</span><input required value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder="e.g. Ahmed Hassan" /></label>
          <label className="field"><span>Role / title</span><input required value={draft.roleLabel} onChange={(event) => setDraft({ ...draft, roleLabel: event.target.value })} /></label>
          <label className="field"><span>Username</span><input required minLength={3} pattern="[A-Za-z0-9._-]+" autoComplete="off" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} placeholder="operation.manager" /></label>
          <label className="field"><span>{editing ? "New password" : "Temporary password"}<small>{editing ? "Leave blank to keep it" : "At least 8 characters"}</small></span><input type="password" minLength={editing ? undefined : 8} required={!editing} autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /></label>
        </div>
        <div className="permission-heading"><div><KeyRound size={17} /><span><strong>Allowed areas</strong><small>The user only sees the checked sections.</small></span></div><span>{draft.permissions.length} selected</span></div>
        <div className="permission-grid">{ACCESS_PERMISSIONS.map((permission) => {
          const checked = draft.permissions.includes(permission.key);
          const privateArea = permission.key === "employees" || permission.key === "attendance";
          return <button type="button" key={permission.key} className={checked ? "permission-option selected" : "permission-option"} onClick={() => togglePermission(permission.key)} aria-pressed={checked}><span className="permission-check">{checked && <Check size={14} />}</span><span><strong>{permission.label}</strong><small>{permission.description}</small></span>{privateArea && <em>Private</em>}</button>;
        })}</div>
        <label className="check-field access-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Active account can sign in</span></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : editing ? "Save access" : "Create user"}</button></div>
      </form>
    </AccessModal>}
  </>;
}
