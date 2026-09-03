"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type CredentialsInput = {
  currentPassword: string;
  newUsername: string;
  newPassword: string;
  confirmPassword: string;
};

export function LoginCredentialsPanel({ username, allowUsernameChange = false, onChanged }: {
  username: string;
  allowUsernameChange?: boolean;
  onChanged: (username: string) => void;
}) {
  const schema = z.object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newUsername: z.string().trim().min(3, "Use at least 3 characters.").max(80).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes, or underscores."),
    newPassword: z.union([z.string().min(8, "Use at least 8 characters."), z.literal("")]),
    confirmPassword: z.string(),
  }).superRefine((value, context) => {
    if (!allowUsernameChange && !value.newPassword) {
      context.addIssue({ code: "custom", path: ["newPassword"], message: "Enter a new password." });
    }
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
    }
  });
  const form = useForm<CredentialsInput>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newUsername: username, newPassword: "", confirmPassword: "" },
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const submit = form.handleSubmit(async (data) => {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "change", currentPassword: data.currentPassword, newUsername: data.newUsername, newPassword: data.newPassword }),
      });
      const result = await response.json() as { username?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update credentials.");
      const nextUsername = result.username || username;
      onChanged(nextUsername);
      form.reset({ currentPassword: "", newUsername: nextUsername, newPassword: "", confirmPassword: "" });
      setFeedback({ tone: "success", message: "Your login password was updated. Other active sessions were signed out." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Could not update credentials." });
    } finally {
      setSaving(false);
    }
  });

  return <form className="panel settings-card security-card" onSubmit={submit}>
    <div className="settings-heading"><div className="settings-icon yellow"><ShieldCheck size={20} /></div><div><h2>Login credentials</h2><p>{allowUsernameChange ? "Change the administrator username or set a new password." : "Your username is read-only. Confirm your current password to choose a new one."}</p></div></div>
    <div className="form-grid security-grid">
      <CredentialField label="Current password" error={form.formState.errors.currentPassword?.message}><input type="password" autoComplete="current-password" {...form.register("currentPassword")} placeholder="Required to confirm changes" /></CredentialField>
      <CredentialField label="Username" hint={allowUsernameChange ? undefined : "Cannot be changed"} error={form.formState.errors.newUsername?.message}><input autoComplete="username" readOnly={!allowUsernameChange} aria-readonly={!allowUsernameChange} {...form.register("newUsername")} /></CredentialField>
      <CredentialField label="New password" hint={allowUsernameChange ? "Leave blank to keep it" : "At least 8 characters"} error={form.formState.errors.newPassword?.message}><input type="password" autoComplete="new-password" required={!allowUsernameChange} {...form.register("newPassword")} placeholder="At least 8 characters" /></CredentialField>
      <CredentialField label="Confirm new password" error={form.formState.errors.confirmPassword?.message}><input type="password" autoComplete="new-password" required={!allowUsernameChange} {...form.register("confirmPassword")} placeholder="Repeat the new password" /></CredentialField>
    </div>
    {feedback && <div className={`credentials-feedback ${feedback.tone}`} aria-live="polite">{feedback.tone === "success" ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}<span>{feedback.message}</span></div>}
    <div className="security-actions"><div><LockKeyhole size={15} /><span>Company profile and document defaults remain administrator-only.</span></div><button className="primary-button" disabled={saving}>{saving ? "Updating…" : allowUsernameChange ? "Update login" : "Change my password"}</button></div>
  </form>;
}

function CredentialField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <label className={`field${error ? " field-error" : ""}`}><span>{label}{hint && <small>{hint}</small>}</span>{children}{error && <em>{error}</em>}</label>;
}
