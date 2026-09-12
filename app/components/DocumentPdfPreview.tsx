"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

export function DocumentPdfPreview({ id, code, onClose }: { id: number; code: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    void (async () => {
      try {
        const response = await fetch(`/api/pdf/${id}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) {
          const message = response.status === 409 ? "This draft has no PDF yet. Open it in the editor and save it first."
            : response.status === 401 ? "Your session expired. Please sign in again."
            : response.status === 403 ? "You do not have access to this document."
            : response.status === 404 ? "This document or its PDF could not be found."
            : "Could not load this document. Close the preview and try again.";
          throw new Error(message);
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (!blob.type.includes("application/pdf")) throw new Error("The document preview is not a PDF.");
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load this document.");
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);

  return <dialog ref={dialogRef} className="document-preview-dialog" aria-labelledby="document-preview-title" onCancel={onClose}>
    <header>
      <div><span>DOCUMENT PREVIEW</span><h2 id="document-preview-title">{code}</h2></div>
      <div className="document-preview-actions">
        <a className="secondary-button" href={`/api/pdf/${id}?download=1`}><Download size={16} /> Download</a>
        <button className="icon-button" onClick={onClose} aria-label="Close document preview" autoFocus><X size={20} /></button>
      </div>
    </header>
    {error ? <p className="document-preview-message" role="alert">{error}</p> : url
      ? <iframe src={url} title={`PDF preview: ${code}`} />
      : <p className="document-preview-message" role="status">Loading document…</p>}
    <footer>If your browser cannot display the PDF, use Download.</footer>
  </dialog>;
}
