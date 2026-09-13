"use client";
import { useEffect, useState } from "react";

export function ReadingSize({ userId }: { userId: number }) {
  const [size, setSize] = useState(100);
  const [open, setOpen] = useState(false);
  const key = `fmg-reading-size-${userId}`;
  useEffect(() => {
    let saved = 100;
    try { const value = Number(localStorage.getItem(key)); if ([90,100,110,125,150].includes(value)) saved = value; } catch {}
    setSize(saved);
    document.documentElement.style.zoom = String(saved / 100);
    return () => { document.documentElement.style.zoom = ""; };
  }, [key]);
  function change(value: number) {
    setSize(value);
    document.documentElement.style.zoom = String(value / 100);
    try { localStorage.setItem(key, String(value)); } catch {}
  }
  return <div className="reading-size-control">
    <button type="button" aria-label="Font and reading size" aria-expanded={open} onClick={() => setOpen(!open)}>Aa</button>
    {open && <div className="reading-size-panel"><strong>Font & reading size</strong><p>Saved for your account on this device.</p><select aria-label="Reading size" value={size} onChange={e=>change(Number(e.target.value))}><option value={90}>Small · 90%</option><option value={100}>Default · 100%</option><option value={110}>Large · 110%</option><option value={125}>Larger · 125%</option><option value={150}>Largest · 150%</option></select><button type="button" onClick={()=>change(100)}>Reset</button><button type="button" onClick={()=>setOpen(false)}>Close</button></div>}
  </div>;
}
