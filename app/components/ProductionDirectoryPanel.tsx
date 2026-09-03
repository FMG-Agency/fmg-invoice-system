"use client";

import {
  Camera,
  CheckCircle2,
  ExternalLink,
  Link2,
  LoaderCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProductionCrewCategory, ProductionCrewMember, ProductionState } from "../types";
import styles from "./ProductionDirectoryPanel.module.css";

type CrewDraft = Pick<ProductionCrewMember, "category" | "name" | "phone" | "profileUrl" | "notes" | "active">;
type DirectoryFilter = "all" | ProductionCrewCategory;

const emptyState: ProductionState = {
  role: "viewer",
  orders: [],
  clients: [],
  catalog: [],
  crew: [],
  modelCatalogUrl: "",
  canManageDirectory: false,
  pendingProductionCount: 0,
  pendingOperationsCount: 0,
  finalApprovedCount: 0,
};

const categoryDetails: Record<ProductionCrewCategory, { label: string; plural: string; icon: typeof UserRound }> = {
  model: { label: "Model", plural: "Models", icon: UserRound },
  photographer: { label: "Photographer", plural: "Photographers", icon: Camera },
  videographer: { label: "Videographer", plural: "Videographers", icon: Video },
};

const blankCrew: CrewDraft = { category: "model", name: "", phone: "", profileUrl: "", notes: "", active: true };

function normalizeState(value: ProductionState): ProductionState {
  return {
    ...emptyState,
    ...value,
    crew: Array.isArray(value.crew) ? value.crew : [],
    modelCatalogUrl: value.modelCatalogUrl ?? "",
    canManageDirectory: Boolean(value.canManageDirectory),
  };
}

function DirectoryModal({ title, description, onClose, children }: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return <div className={styles.modalLayer} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={styles.modalCard} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span>PRODUCTION DIRECTORY</span><h2>{title}</h2><p>{description}</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export function ProductionDirectoryPanel({ showToast }: { showToast: (message: string) => void }) {
  const [state, setState] = useState<ProductionState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [crewDraft, setCrewDraft] = useState<CrewDraft | null>(null);
  const [catalogueDraft, setCatalogueDraft] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/production", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as ProductionState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not load the production directory.");
      if (!cancelled) setState(normalizeState(result as ProductionState));
    }).catch((error: unknown) => {
      if (!cancelled) showToast(error instanceof Error ? error.message : "Could not load the production directory.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // This permission-protected page loads its own live directory state when mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCrew = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.crew.filter((member) => {
      if (filter !== "all" && member.category !== filter) return false;
      if (!query) return true;
      return [member.name, member.phone, member.notes, categoryDetails[member.category].label].some((value) => value.toLowerCase().includes(query));
    });
  }, [filter, search, state.crew]);

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as ProductionState | { error?: string };
      if (!response.ok) throw new Error("error" in result && result.error ? result.error : "Could not save the production directory.");
      setState(normalizeState(result as ProductionState));
      showToast(successMessage);
    } finally {
      setSaving(false);
    }
  }

  function openNewCrew() {
    setEditingId(null);
    setCrewDraft({ ...blankCrew });
  }

  function openCrew(member: ProductionCrewMember) {
    setEditingId(member.id);
    setCrewDraft({ category: member.category, name: member.name, phone: member.phone, profileUrl: member.profileUrl, notes: member.notes, active: member.active });
  }

  async function saveCrew(event: React.FormEvent) {
    event.preventDefault();
    if (!crewDraft) return;
    try {
      await mutate({ action: "saveCrew", id: editingId, data: crewDraft }, editingId ? "Crew member updated." : "Crew member added.");
      setCrewDraft(null);
      setEditingId(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the crew member.");
    }
  }

  async function saveCatalogue(event: React.FormEvent) {
    event.preventDefault();
    if (catalogueDraft === null) return;
    try {
      await mutate({ action: "saveDirectorySettings", data: { modelCatalogUrl: catalogueDraft } }, catalogueDraft.trim() ? "Model catalogue link saved." : "Model catalogue link removed.");
      setCatalogueDraft(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the catalogue link.");
    }
  }

  const counts = (Object.keys(categoryDetails) as ProductionCrewCategory[]).map((category) => ({
    category,
    total: state.crew.filter((member) => member.active && member.category === category).length,
  }));

  if (loading) return <section className={styles.loading}><LoaderCircle size={27} /><h2>Loading talent and crew…</h2><p>Preparing the production directory and model catalogue.</p></section>;

  return <section className={styles.workspace}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span><UsersRound size={15} /> TALENT & CREW</span><h2>Your production directory</h2><p>Keep trusted models, photographers, and videographers ready for every work order.</p></div>
      <div className={styles.heroActions}>
        {state.modelCatalogUrl
          ? <a className={styles.catalogueButton} href={state.modelCatalogUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /><span><small>TEAM ACCESS</small><strong>Open model catalogue</strong></span></a>
          : <div className={styles.catalogueEmpty}><Link2 size={16} /><span><strong>No catalogue link yet</strong><small>Add a shared link for the production team.</small></span></div>}
        {state.canManageDirectory && <button className={styles.secondaryAction} type="button" onClick={() => setCatalogueDraft(state.modelCatalogUrl)}><Link2 size={16} /> {state.modelCatalogUrl ? "Edit catalogue link" : "Add catalogue link"}</button>}
        {state.canManageDirectory && <button className={styles.primaryAction} type="button" onClick={openNewCrew}><Plus size={16} /> Add talent / crew</button>}
      </div>
      <div className={styles.stats}>{counts.map(({ category, total }) => { const Icon = categoryDetails[category].icon; return <article key={category}><span><Icon size={17} /></span><div><small>{categoryDetails[category].plural}</small><strong>{total}</strong></div></article>; })}</div>
    </section>

    <section className={styles.directoryPanel}>
      <header className={styles.directoryHeader}>
        <div><span>RESOURCE LIST</span><h2>Available people</h2><p>{filteredCrew.length} shown · inactive entries stay out of new work orders.</p></div>
        <label className={styles.searchBox}><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or notes…" aria-label="Search talent and crew" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={14} /></button>}</label>
      </header>
      <nav className={styles.filters} aria-label="Filter production directory">
        <button type="button" className={filter === "all" ? styles.active : ""} onClick={() => setFilter("all")}>All <span>{state.crew.length}</span></button>
        {counts.map(({ category, total }) => <button key={category} type="button" className={filter === category ? styles.active : ""} onClick={() => setFilter(category)}>{categoryDetails[category].plural} <span>{total}</span></button>)}
      </nav>

      {filteredCrew.length ? <div className={styles.crewGrid}>{filteredCrew.map((member) => {
        const details = categoryDetails[member.category];
        const Icon = details.icon;
        return <article key={member.id} className={`${styles.crewCard} ${!member.active ? styles.inactive : ""}`}>
          <header><span className={styles.memberIcon}><Icon size={20} /></span><div><small>{details.label.toUpperCase()}</small><h3>{member.name}</h3></div>{!member.active && <em>Inactive</em>}</header>
          <a className={styles.phoneLine} href={`tel:${member.phone.replace(/\s+/g, "")}`}><Phone size={15} /><span><small>PHONE NUMBER</small><strong>{member.phone || "Phone not added"}</strong></span></a>
          {member.notes && <p>{member.notes}</p>}
          <footer>{member.profileUrl ? <a href={member.profileUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open portfolio</a> : <span>No personal portfolio link</span>}{state.canManageDirectory && <button type="button" onClick={() => openCrew(member)}><Pencil size={14} /> Edit</button>}</footer>
        </article>;
      })}</div> : <div className={styles.empty}><UsersRound size={27} /><h3>No matching people</h3><p>{state.crew.length ? "Try another search or category." : "Add the first model, photographer, or videographer to start the directory."}</p>{state.canManageDirectory && !state.crew.length && <button type="button" className={styles.primaryAction} onClick={openNewCrew}><Plus size={15} /> Add first person</button>}</div>}
    </section>

    {crewDraft && <DirectoryModal title={editingId ? "Edit talent or crew" : "Add talent or crew"} description="These details will appear as selectable options inside production work orders." onClose={() => !saving && setCrewDraft(null)}>
      <form className={styles.form} onSubmit={saveCrew}>
        <div className={styles.formGrid}>
          <label><span>Type</span><select value={crewDraft.category} onChange={(event) => setCrewDraft({ ...crewDraft, category: event.target.value as ProductionCrewCategory })}><option value="model">Model</option><option value="photographer">Photographer</option><option value="videographer">Videographer</option></select></label>
          <label><span>Name</span><input required maxLength={200} value={crewDraft.name} onChange={(event) => setCrewDraft({ ...crewDraft, name: event.target.value })} placeholder="Full or professional name" /></label>
          <label><span>Phone number</span><input required type="tel" maxLength={100} value={crewDraft.phone} onChange={(event) => setCrewDraft({ ...crewDraft, phone: event.target.value })} placeholder="e.g. +20 100 000 0000" /></label>
          <label><span>Portfolio / personal catalogue link <small>Optional</small></span><input type="url" maxLength={2000} value={crewDraft.profileUrl} onChange={(event) => setCrewDraft({ ...crewDraft, profileUrl: event.target.value })} placeholder="https://…" /></label>
          <label className={styles.wide}><span>Notes <small>Optional</small></span><textarea rows={4} maxLength={2000} value={crewDraft.notes} onChange={(event) => setCrewDraft({ ...crewDraft, notes: event.target.value })} placeholder="Availability, style, rates, or internal notes…" /></label>
          {editingId && <label className={styles.activeToggle}><input type="checkbox" checked={crewDraft.active} onChange={(event) => setCrewDraft({ ...crewDraft, active: event.target.checked })} /><span><strong>Available for new work orders</strong><small>Turn this off to archive the person without losing their saved details.</small></span></label>}
        </div>
        <footer><button type="button" className={styles.cancelButton} disabled={saving} onClick={() => setCrewDraft(null)}>Cancel</button><button className={styles.saveButton} disabled={saving}>{saving ? <><LoaderCircle size={16} /> Saving…</> : <><CheckCircle2 size={16} /> Save person</>}</button></footer>
      </form>
    </DirectoryModal>}

    {catalogueDraft !== null && <DirectoryModal title="Model catalogue link" description="Add one shared Canva, Drive, website, or catalogue link. Everyone with Production access will see it." onClose={() => !saving && setCatalogueDraft(null)}>
      <form className={styles.form} onSubmit={saveCatalogue}>
        <label className={styles.fullField}><span>Catalogue URL</span><input type="url" maxLength={2000} value={catalogueDraft} onChange={(event) => setCatalogueDraft(event.target.value)} placeholder="https://www.canva.com/…" /><small>Leave it empty and save to remove the catalogue button.</small></label>
        <footer><button type="button" className={styles.cancelButton} disabled={saving} onClick={() => setCatalogueDraft(null)}>Cancel</button><button className={styles.saveButton} disabled={saving}>{saving ? <><LoaderCircle size={16} /> Saving…</> : <><Link2 size={16} /> Save catalogue link</>}</button></footer>
      </form>
    </DirectoryModal>}
  </section>;
}
