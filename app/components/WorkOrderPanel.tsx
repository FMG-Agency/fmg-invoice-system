"use client";

import Image from "next/image";
import {
  CalendarDays,
  Clock3,
  MapPin,
  NotebookPen,
  PackageCheck,
  Printer,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Client, QuotationCatalogItem } from "../types";
import styles from "./WorkOrderPanel.module.css";

type WorkOrderDraft = {
  clientName: string;
  bundle: string;
  addon: string;
  date: string;
  time: string;
  location: string;
  model: string;
  notes: string;
};

function cairoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function blankWorkOrder(): WorkOrderDraft {
  return {
    clientName: "",
    bundle: "",
    addon: "",
    date: cairoToday(),
    time: "",
    location: "",
    model: "",
    notes: "",
  };
}

function Field({
  icon,
  label,
  hint,
  wide,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return <label className={`${styles.field}${wide ? ` ${styles.fieldWide}` : ""}`}>
    <span className={styles.fieldLabel}>{icon}<strong>{label}</strong>{hint && <small>{hint}</small>}</span>
    {children}
  </label>;
}

export function WorkOrderPanel({ clients, catalog }: { clients: Client[]; catalog: QuotationCatalogItem[] }) {
  const [draft, setDraft] = useState<WorkOrderDraft>(blankWorkOrder);
  const bundles = useMemo(() => catalog.filter((item) => item.active && item.kind === "package"), [catalog]);
  const addons = useMemo(() => catalog.filter((item) => item.active && item.kind === "addon"), [catalog]);
  const matchingAddons = useMemo(() => addons.filter((item) => !item.appliesTo || !draft.bundle || item.appliesTo.toLowerCase() === draft.bundle.toLowerCase()), [addons, draft.bundle]);
  const clientNames = useMemo(() => Array.from(new Set(clients.flatMap((client) => [client.companyName, client.name]).filter(Boolean))), [clients]);

  function patch<Key extends keyof WorkOrderDraft>(key: Key, value: WorkOrderDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function printWorkOrder() {
    const cleanup = () => document.body.classList.remove("work-order-printing");
    document.body.classList.add("work-order-printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 30_000);
  }

  return <section className={styles.workspace}>
    <div className={styles.toolbar}>
      <div>
        <span>LANDSCAPE · A4 READY</span>
        <strong>Complete the work order, then print it or save it as a PDF.</strong>
      </div>
      <div className={styles.toolbarActions}>
        <button type="button" className="secondary-button" onClick={() => setDraft(blankWorkOrder())}><RotateCcw size={15} /> Clear form</button>
        <button type="button" className="primary-button" onClick={printWorkOrder}><Printer size={16} /> Print / Save PDF</button>
      </div>
    </div>

    <div className={styles.sheetFrame}>
      <form className={styles.sheet} aria-label="Media Guide work order" onSubmit={(event) => event.preventDefault()}>
        <header className={styles.sheetHeader}>
          <div className={styles.brand}>
            <Image src="/fmg-logo-light.png" alt="FMG Agency" width={380} height={130} unoptimized priority />
            <span>PRODUCTION UNIT</span>
          </div>
          <div className={styles.documentTitle}>
            <span>CLIENT SERVICE DOCUMENT</span>
            <h2>MEDIA GUIDE</h2>
            <p>PRODUCTION WORK ORDER</p>
          </div>
          <div className={styles.documentMark} aria-hidden="true"><span>WO</span><i /></div>
        </header>

        <div className={styles.sheetBody}>
          <section className={styles.clientRow}>
            <div className={styles.sectionNumber}>01</div>
            <Field icon={<UserRound size={16} />} label="Client name" hint="اسم العميل" wide>
              <input required list="work-order-clients" value={draft.clientName} onChange={(event) => patch("clientName", event.target.value)} placeholder="Enter or select the client name" />
            </Field>
            <datalist id="work-order-clients">{clientNames.map((name) => <option key={name} value={name} />)}</datalist>
            <div className={styles.mediaTag}><span>DOCUMENT TYPE</span><strong>MEDIA GUIDE</strong></div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeading}><span>02</span><div><strong>Production details</strong><small>When and where the production takes place</small></div></div>
            <div className={styles.detailsGrid}>
              <Field icon={<CalendarDays size={15} />} label="Date">
                <input required type="date" value={draft.date} onChange={(event) => patch("date", event.target.value)} />
              </Field>
              <Field icon={<Clock3 size={15} />} label="Time">
                <input required type="time" value={draft.time} onChange={(event) => patch("time", event.target.value)} />
              </Field>
              <Field icon={<MapPin size={15} />} label="Location">
                <input required value={draft.location} onChange={(event) => patch("location", event.target.value)} placeholder="Studio or shoot location" />
              </Field>
              <Field icon={<UserRound size={15} />} label="Model">
                <input value={draft.model} onChange={(event) => patch("model", event.target.value)} placeholder="Model name or details" />
              </Field>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeading}><span>03</span><div><strong>Service scope</strong><small>Selected Media Guide package and extras</small></div></div>
            <div className={styles.scopeGrid}>
              <Field icon={<PackageCheck size={15} />} label="Bundle">
                <input required list="work-order-bundles" value={draft.bundle} onChange={(event) => patch("bundle", event.target.value)} placeholder="Select or type a bundle" />
              </Field>
              <datalist id="work-order-bundles">{bundles.map((bundle) => <option key={bundle.id} value={bundle.name} />)}</datalist>
              <Field icon={<PackageCheck size={15} />} label="Add-on" hint="Optional">
                <input list="work-order-addons" value={draft.addon} onChange={(event) => patch("addon", event.target.value)} placeholder="Select or type an add-on" />
              </Field>
              <datalist id="work-order-addons">{matchingAddons.map((addon) => <option key={addon.id} value={addon.name} />)}</datalist>
            </div>
          </section>

          <section className={`${styles.formSection} ${styles.notesSection}`}>
            <div className={styles.sectionHeading}><span>04</span><div><strong>Additional notes</strong><small>Special requirements, references, or production instructions</small></div></div>
            <Field icon={<NotebookPen size={15} />} label="Notes" wide>
              <textarea value={draft.notes} onChange={(event) => patch("notes", event.target.value)} placeholder="Add any extra notes here…" rows={3} />
            </Field>
          </section>
        </div>

        <footer className={styles.sheetFooter}>
          <span>FMG AGENCY · MEDIA GUIDE PRODUCTION</span>
          <p>Keep this work order with the production team on the shoot day.</p>
          <strong>READY TO CREATE</strong>
        </footer>
      </form>
    </div>
  </section>;
}
