"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Rail = { target: HTMLElement; left: number; top: number; width: number; maximum: number; position: number; rtl: boolean };

// Discover actual scroll containers, including tables and previews in dialogs.
// Detect layout changes separately from scrolling so scrolling never scans rows.
export function HorizontalScrollControl() {
  const [rail, setRail] = useState<Rail | null>(null);
  const control = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let regions: HTMLElement[] = [];
    let frame = 0;
    let dirty = true;
    const resize = new ResizeObserver(() => schedule(true));
    const observed = new Set<Element>();
    function discover() {
      const next = new Set<Element>();
      regions = [];
      const page = document.querySelector<HTMLElement>(".page-wrap");
      if (page) {
        next.add(page);
        const style = getComputedStyle(page);
        const width = page.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        page.dataset.layout = width < 530 ? "small" : width < 940 ? "compact" : "wide";
      }
      for (const element of document.querySelectorAll<HTMLElement>("div,section,nav,article,main,ul,ol")) {
        if (element === control.current || !element.clientWidth || element.scrollWidth <= element.clientWidth + 1) continue;
        if (!/^(auto|scroll)$/.test(getComputedStyle(element).overflowX)) continue;
        regions.push(element);
        next.add(element);
        for (const child of element.children) next.add(child);
      }
      for (const element of observed) if (!next.has(element)) { resize.unobserve(element); observed.delete(element); }
      for (const element of next) if (!observed.has(element)) { resize.observe(element); observed.add(element); }
    }
    function update() {
      frame = 0;
      if (dirty) { dirty = false; discover(); }
      let selected: Rail | null = null;
      let best = 0;
      const bottomNav = document.querySelector<HTMLElement>(".mobile-nav, .bottom-nav");
      const viewportBottom = Math.min(window.innerHeight, bottomNav?.getClientRects().length ? bottomNav.getBoundingClientRect().top : window.innerHeight);
      for (const element of regions) {
        const rect = element.getBoundingClientRect();
        const left = Math.max(8, rect.left + 8);
        const right = Math.min(window.innerWidth - 8, rect.right - 8);
        const bottom = Math.min(viewportBottom, rect.bottom);
        const height = bottom - Math.max(0, rect.top);
        if (height < 85 || right - left < 140 || height <= best) continue;
        const x = (left + right) / 2;
        const hit = document.elementFromPoint(x, bottom - 55);
        if (!hit || !element.contains(hit)) continue;
        const rtl = getComputedStyle(element).direction === "rtl";
        const maximum = element.scrollWidth - element.clientWidth;
        const width = Math.min(420, right - left);
        selected = {target:element,left:x-width/2,top:bottom-47,width,maximum,position:rtl?maximum+element.scrollLeft:element.scrollLeft,rtl};
        best = height;
      }
      setRail(selected);
    }
    function schedule(rescan = false) {
      dirty ||= rescan;
      if (!frame) frame = requestAnimationFrame(update);
    }
    const onScroll = () => schedule();
    const onLayout = () => schedule(true);
    const observer = new MutationObserver(records => {
      if (records.some(record => !control.current?.contains(record.target) && !(record.target === document.body && [...record.addedNodes,...record.removedNodes].every(node=>node instanceof HTMLElement && node.classList.contains('horizontal-scroll-control'))))) onLayout();
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","open","hidden","aria-expanded"]});
    document.addEventListener("scroll",onScroll,true);
    document.addEventListener("load",onLayout,true);
    window.addEventListener("resize",onLayout);
    onLayout();
    return () => { observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); document.removeEventListener("scroll",onScroll,true); document.removeEventListener("load",onLayout,true); window.removeEventListener("resize",onLayout); };
  },[]);
  if (!rail) return null;
  const move = (value:number) => { rail.target.scrollLeft = rail.rtl ? value-rail.maximum : value; };
  const step = Math.max(80,rail.target.clientWidth * .65);
  return <div ref={control} className="horizontal-scroll-control" dir="ltr" role="group" aria-label="Horizontal scroll" style={{left:rail.left,top:rail.top,width:rail.width}}>
    <button type="button" aria-label="Scroll left" disabled={rail.position<=1} onClick={()=>move(rail.position-step)}><ChevronLeft size={18}/></button>
    <input type="range" aria-label="Horizontal position" min={0} max={rail.maximum} value={Math.round(rail.position)} onChange={e=>move(Number(e.target.value))}/>
    <button type="button" aria-label="Scroll right" disabled={rail.position>=rail.maximum-1} onClick={()=>move(rail.position+step)}><ChevronRight size={18}/></button>
  </div>;
}
