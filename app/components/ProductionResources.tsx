"use client";

import { useEffect, useState } from "react";
import type { ProductionCrewMember, ProductionWorkOrder } from "../types";
import styles from "./ProductionDirectoryPanel.module.css";

type Location = { id: number; name: string; mapUrl: string; notes: string; photoUrl: string; active: boolean };
type Review = { id: number; crewId: number; workOrderId: number | null; shootName: string; shootDate: string; rating: number | null; comment: string; authorName: string };
type DirectoryData = { locations: Location[]; reviews: Review[] };

export function ResourcePhoto({ kind, id, onSaved, showToast }: { kind: "crew" | "location"; id: number; onSaved: () => Promise<void>; showToast: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  return <label className={styles.photoUpload}>{busy ? "Uploading…" : "Upload / replace photo"}<input aria-label="Upload photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return showToast("Choose an image under 3 MB.");
    setBusy(true);
    try {
      const form = new FormData(); form.set("kind", kind); form.set("id", String(id)); form.set("photo", file);
      const response = await fetch("/api/production-directory", { method: "POST", body: form });
      const result = await response.json() as DirectoryData & { error?: string }; if (!response.ok) throw new Error(result.error || "Upload failed.");
      await onSaved(); showToast("Photo saved.");
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not upload photo."); }
    finally { setBusy(false); }
  }} /><small>JPG, PNG or WebP · max 3 MB</small></label>;
}

export function ProductionResources({ member, orders, canManage, showToast, search = "" }: { search?: string; member?: ProductionCrewMember; orders: ProductionWorkOrder[]; canManage: boolean; showToast: (message: string) => void }) {
  const [data, setData] = useState<DirectoryData>({ locations: [], reviews: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState<Omit<Location, "id" | "photoUrl"> & { id: number | null } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({ workOrderId: "", shootName: "", shootDate: "", rating: "", comment: "" });
  async function load() {
    const response = await fetch("/api/production-directory", { cache: "no-store" });
    const result = await response.json() as DirectoryData & { error?: string }; if (!response.ok) throw new Error(result.error || "Could not load directory.");
    setData(result); setLoaded(true); setError("");
  }
  useEffect(() => { void load().catch(error => setError(error.message)); }, []);
  async function save(body: unknown) {
    setBusy(true);
    try {
      const response = await fetch("/api/production-directory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as DirectoryData & { error?: string }; if (!response.ok) throw new Error(result.error || "Could not save.");
      setData(result); return true;
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }
  if (error) return <p role="alert">{error} <button onClick={() => void load().catch(error => setError(error.message))}>Retry</button></p>;
  if (!loaded) return <p>Loading…</p>;
  if (member) {
    const reviews = data.reviews.filter(item => item.crewId === member.id);
    const shoots = orders.filter(order => order.productionOptions.some(option => option.crewMemberId === member.id));
    return <section className={styles.history}>
      <h3>Shoot history · {member.name}</h3>
      <p>Work-order assignments appear automatically. Reviews record what happened on the shoot day.</p>
      {shoots.map(order => <article key={order.id}><strong>{order.code} · {order.clientName}</strong><p>{order.workDate} · {order.status === "final_approved" ? "Approved shoot" : "Planned / awaiting approval"}</p></article>)}
      {!shoots.length && <p>No linked work-order assignments yet.</p>}
      <h3>Ratings & comments ({reviews.length})</h3>
      {reviews.map(item => <article key={item.id}><strong>{item.shootName}{item.workOrderId ? ` · WO-${String(item.workOrderId).padStart(4, "0")}` : ""}</strong><p>{item.shootDate}{item.rating ? ` · ${"★".repeat(item.rating)} (${item.rating}/5)` : ""}</p><p>{item.comment}</p><small>By {item.authorName}</small></article>)}
      {canManage && <button type="button" className={styles.primaryAction} onClick={() => setReviewOpen(!reviewOpen)}>Add shoot / review</button>}
      {reviewOpen && <form className={styles.form} onSubmit={async event => {
        event.preventDefault();
        if (await save({ action: "saveReview", data: { ...review, crewId: member.id, workOrderId: review.workOrderId ? Number(review.workOrderId) : null, rating: review.rating ? Number(review.rating) : null } })) { setReviewOpen(false); setReview({ workOrderId: "", shootName: "", shootDate: "", rating: "", comment: "" }); showToast("Shoot review saved."); }
      }}><div className={styles.formGrid}>
        <label><span>Work order (optional)</span><select value={review.workOrderId} onChange={event => { const order = orders.find(item => item.id === Number(event.target.value)); setReview({ ...review, workOrderId: event.target.value, shootName: order?.clientName ?? review.shootName, shootDate: order?.workDate ?? review.shootDate }); }}><option value="">Older / other shoot</option>{orders.map(order => <option key={order.id} value={order.id}>{order.code} · {order.clientName}</option>)}</select></label>
        <label><span>Shoot / client name</span><input required maxLength={300} value={review.shootName} onChange={event => setReview({ ...review, shootName: event.target.value })} /></label>
        <label><span>Shoot date</span><input required type="date" value={review.shootDate} onChange={event => setReview({ ...review, shootDate: event.target.value })} /></label>
        <label><span>Rating</span><select value={review.rating} onChange={event => setReview({ ...review, rating: event.target.value })}><option value="">Comment only</option>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label className={styles.wide}><span>Review / comment</span><textarea required={!review.rating} maxLength={5000} rows={4} value={review.comment} onChange={event => setReview({ ...review, comment: event.target.value })} /></label>
      </div><button className={styles.saveButton} disabled={busy}>{busy ? "Saving…" : "Save review"}</button></form>}
    </section>;
  }
  return <section>
    {canManage && <button className={styles.primaryAction} onClick={() => setLocation({ id: null, name: "", mapUrl: "", notes: "", active: true })}>Add location</button>}
    {location && <form className={styles.form} onSubmit={async event => { event.preventDefault(); if (await save({ action: "saveLocation", id: location.id, data: location })) { setLocation(null); showToast("Location saved. You can now add its photo."); } }}><div className={styles.formGrid}>
      <label><span>Location name</span><input required maxLength={200} value={location.name} onChange={event => setLocation({ ...location, name: event.target.value })} /></label>
      <label><span>Map / location link</span><input required type="url" maxLength={2000} placeholder="https://maps.google.com/…" value={location.mapUrl} onChange={event => setLocation({ ...location, mapUrl: event.target.value })} /></label>
      <label className={styles.wide}><span>Notes / address</span><textarea maxLength={2000} value={location.notes} onChange={event => setLocation({ ...location, notes: event.target.value })} /></label>
      <label className={styles.activeToggle}><input type="checkbox" checked={location.active} onChange={event => setLocation({ ...location, active: event.target.checked })} />Available</label>
    </div><footer><button type="button" className={styles.cancelButton} onClick={() => setLocation(null)}>Cancel</button><button className={styles.saveButton} disabled={busy}>Save location</button></footer></form>}
    <div className={styles.crewGrid}>{data.locations.filter(item => [item.name, item.notes].some(value => value.toLowerCase().includes(search.trim().toLowerCase()))).map(item => <article key={item.id} className={`${styles.crewCard} ${!item.active ? styles.inactive : ""}`}>
      {/* Private photos are served through an authenticated same-origin endpoint. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.photoUrl && <img className={styles.resourcePhoto} src={item.photoUrl} alt={item.name} />}
      <h3>{item.name}{!item.active && " · Inactive"}</h3><p>{item.notes}</p><a href={item.mapUrl} target="_blank" rel="noopener noreferrer">Open location ↗</a>
      {canManage && <><button className={styles.secondaryAction} onClick={() => setLocation(item)}>Edit location</button><ResourcePhoto kind="location" id={item.id} onSaved={load} showToast={showToast} /></>}
    </article>)}</div>
    {!data.locations.length && <p>No locations added yet.</p>}
  </section>;
}
