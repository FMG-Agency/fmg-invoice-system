"use client";

import { Bell, BellOff, BellRing, CheckCheck, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationsState, NotificationTargetView, SystemNotification } from "../types";

const emptyState: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  pushConfigured: false,
  vapidPublicKey: "",
};

function relativeTime(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (!Number.isFinite(seconds) || seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function readJson(response: Response) {
  const payload = await response.json() as NotificationsState | { error?: string };
  if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Could not update notifications.");
  return payload as NotificationsState;
}

export function NotificationCenter({
  onNavigate,
  showToast,
}: {
  onNavigate: (view: NotificationTargetView) => void;
  showToast: (message: string) => void;
}) {
  const [state, setState] = useState<NotificationsState>(emptyState);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const rootRef = useRef<HTMLDivElement>(null);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIos = typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const iphoneInstallNeeded = isIos && !isStandalone;

  const load = useCallback(async (quiet = false) => {
    try {
      const next = await readJson(await fetch("/api/notifications", { cache: "no-store" }));
      setState(next);
      if (supported) {
        setPermission(window.Notification.permission);
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        const status = subscription ? await fetch("/api/notifications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "subscriptionStatus", endpoint: subscription.endpoint }),
        }) : null;
        const saved = status?.ok ? await status.json() as { subscribed: boolean } : null;
        setPushEnabled(window.Notification.permission === "granted" && Boolean(saved?.subscribed));
      }
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : "Could not load notifications.");
    }
  }, [showToast, supported]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(true), 0);
    const interval = window.setInterval(() => void load(true), 25_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function post(body: Record<string, unknown>) {
    return readJson(await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
  }

  async function enablePush() {
    if (!supported) return showToast("This browser does not support push notifications.");
    if (!state.pushConfigured || !state.vapidPublicKey) return showToast("Push notifications are not configured yet.");
    setBusy(true);
    try {
      const nextPermission = await window.Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") throw new Error(nextPermission === "denied" ? "Notifications are blocked. Open this site's browser settings, allow Notifications, then try Enable again." : "Notification permission was dismissed. Tap Enable and choose Allow to try again.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(state.vapidPublicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("The browser returned an incomplete push subscription.");
      const next = await post({
        action: "subscribe",
        subscription: { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: json.keys },
      });
      setState(next);
      setPushEnabled(true);
      showToast("Desktop and mobile notifications are now active on this device.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const next = await post({ action: "unsubscribe", endpoint: subscription.endpoint });
        setState(next);
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
      showToast("Push notifications are off on this device.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not disable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function openNotification(notification: SystemNotification) {
    if (!notification.read) {
      try { setState(await post({ action: "read", id: notification.id })); } catch { /* The destination remains available. */ }
    }
    setOpen(false);
    onNavigate(notification.targetView);
  }

  async function readAll() {
    setBusy(true);
    try { setState(await post({ action: "readAll" })); } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not mark notifications as read.");
    } finally { setBusy(false); }
  }

  const permissionBlocked = permission === "denied";

  async function testDevices() {
    setBusy(true);
    setTestResult("");
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "testPush" }) });
      const result = await response.json() as { configured: boolean; accepted: number; failed: number; statuses: number[] };
      if (!response.ok) throw new Error("Could not test device notifications. Please try again.");
      setTestResult(!result.configured ? "Device push is not configured in this environment." : !result.statuses.length ? "No devices registered for your account. Open FMG on your device and choose Enable first." : `Push service accepted ${result.accepted} delivery attempt(s); ${result.failed} failed. ${result.failed ? `Status: ${result.statuses.join(", ")} (0 means encryption or network failure). ` : ""}Check your device outside this page; acceptance does not confirm display.`);
    } catch (error) { setTestResult(error instanceof Error ? error.message : "Device test failed."); }
    finally { setBusy(false); }
  }

  return <div className="notification-center" ref={rootRef}>
    <button className="icon-button notification-button" aria-label={`Notifications${state.unreadCount ? `, ${state.unreadCount} unread` : ""}`} aria-expanded={open} onClick={() => { setOpen((current) => !current); void load(true); }}>
      <Bell size={18} />
      {state.unreadCount > 0 && <span className="notification-count">{state.unreadCount > 99 ? "99+" : state.unreadCount}</span>}
    </button>
    {open && <section className="notification-popover" aria-label="System notifications">
      <header className="notification-heading">
        <div><span>NOTIFICATIONS</span><strong>Updates for you</strong></div>
        <div>{state.unreadCount > 0 && <button onClick={readAll} disabled={busy} title="Mark all as read"><CheckCheck size={17} /></button>}<button onClick={() => setOpen(false)} title="Close"><X size={17} /></button></div>
      </header>
      <div className="push-control">
        <span className={pushEnabled ? "push-icon active" : "push-icon"}>{pushEnabled ? <BellRing size={18} /> : <Smartphone size={18} />}</span>
        <span><strong>{pushEnabled ? "Device alerts are on" : "Get alerts on this device"}</strong><small>{permissionBlocked ? "Notifications are blocked. Allow Notifications in this site's browser settings and your device settings, then return here." : iphoneInstallNeeded ? "On iPhone or iPad (iOS/iPadOS 16.4+): open in Safari, use Share → Add to Home Screen, then open FMG System from its icon and tap Enable." : !supported ? "This browser does not support device alerts. Use a supported browser; your updates remain in this bell." : !state.pushConfigured ? "Device alerts are unavailable in this environment. Your updates remain in this bell." : pushEnabled ? "Device alerts are enabled. Delivery also depends on your device's notification and Focus settings." : "Tap Enable, then choose Allow when your browser asks."}</small></span>
        {pushEnabled ? <button onClick={disablePush} disabled={busy} className="push-toggle off"><BellOff size={15} /> Off</button> : <button onClick={enablePush} disabled={busy || permissionBlocked || !supported || !state.pushConfigured || iphoneInstallNeeded} className="push-toggle">{iphoneInstallNeeded ? "Install first" : "Enable"}</button>}
      </div>
      <div className="notification-list">
        <div className="push-control"><button className="push-toggle" disabled={busy || !state.pushConfigured} onClick={testDevices}>Test my devices</button><small role="status">{testResult || "Sends a test to devices registered to your account."}</small></div>
        {state.notifications.length ? state.notifications.map((notification) => <button key={notification.id} className={notification.read ? "notification-item" : "notification-item unread"} onClick={() => void openNotification(notification)}>
          <span className="notification-dot" />
          <span><strong>{notification.title}</strong><p>{notification.message}</p><small>{relativeTime(notification.createdAt)}</small></span>
        </button>) : <div className="notification-empty"><Bell size={22} /><strong>You’re all caught up</strong><span>New work orders and employee-request updates will appear here.</span></div>}
      </div>
    </section>}
  </div>;
}
