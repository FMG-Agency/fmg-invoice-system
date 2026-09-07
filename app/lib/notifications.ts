import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { database } from "./database";
import type { NotificationTargetView, NotificationsState, SystemNotification } from "../types";

type NotificationInput = {
  type: string;
  title: string;
  message: string;
  targetView: NotificationTargetView;
  entityId?: number | null;
  actorUserId?: number | null;
};

type WorkflowRole = "production_manager" | "operation_manager";

const notificationSchema = [
  `CREATE TABLE IF NOT EXISTS system_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_view TEXT NOT NULL DEFAULT 'dashboard',
    entity_id INTEGER,
    read_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time INTEGER,
    user_agent TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_system_notifications_user_created ON system_notifications(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_system_notifications_user_unread ON system_notifications(user_id, read_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint)",
  "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active ON push_subscriptions(user_id, active)",
];

let notificationsDatabaseReady: Promise<void> | null = null;

export async function ensureNotificationsDatabase() {
  notificationsDatabaseReady ??= database.batch(notificationSchema.map((statement) => database.prepare(statement))).then(() => undefined);
  try {
    await notificationsDatabaseReady;
  } catch (error) {
    notificationsDatabaseReady = null;
    throw error;
  }
}

function mapNotification(row: Record<string, unknown>): SystemNotification {
  const target = String(row.targetView ?? "dashboard");
  return {
    id: Number(row.id),
    type: String(row.type ?? "system"),
    title: String(row.title ?? "FMG System"),
    message: String(row.message ?? ""),
    targetView: target === "work-order" || target === "requests" || target === "tasks" ? target : "dashboard",
    entityId: row.entityId === null || row.entityId === undefined ? null : Number(row.entityId),
    read: Boolean(String(row.readAt ?? "")),
    createdAt: String(row.createdAt ?? ""),
  };
}

export async function getNotificationsState(userId: number): Promise<NotificationsState> {
  await ensureNotificationsDatabase();
  const [rows, unread] = await Promise.all([
    database.prepare(`SELECT id, type, title, message, target_view AS targetView, entity_id AS entityId,
        read_at AS readAt, created_at AS createdAt
      FROM system_notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60`).bind(userId).all<Record<string, unknown>>(),
    database.prepare("SELECT COUNT(*) AS count FROM system_notifications WHERE user_id = ? AND read_at = ''")
      .bind(userId).first<{ count: number }>(),
  ]);
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  return {
    notifications: rows.results.map(mapNotification),
    unreadCount: Number(unread?.count ?? 0),
    pushConfigured: Boolean(publicKey && process.env.VAPID_PRIVATE_KEY?.trim()),
    vapidPublicKey: publicKey,
  };
}

export async function administratorUserIds(excludeUserId?: number | null) {
  const rows = await database.prepare("SELECT id FROM auth_users WHERE active = 1 AND is_admin = 1 AND client_id IS NULL")
    .all<{ id: number }>();
  return rows.results.map((row) => Number(row.id)).filter((id) => id !== excludeUserId);
}

function normalizedRole(value: string) {
  return value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

export async function workflowRecipientUserIds(role: WorkflowRole, excludeUserId?: number | null) {
  const rows = await database.prepare(`SELECT id, role_label AS roleLabel, is_admin AS isAdmin
      FROM auth_users WHERE active = 1 AND client_id IS NULL`)
    .all<{ id: number; roleLabel: string; isAdmin: number }>();
  const matches = rows.results.filter((row) => {
    if (Number(row.isAdmin) === 1) return false;
    const label = normalizedRole(row.roleLabel);
    if (role === "production_manager") return label.includes("production") && label.includes("manager");
    return (label.includes("operation") || label.includes("operations")) && label.includes("manager");
  }).map((row) => Number(row.id)).filter((id) => id !== excludeUserId);
  return matches.length ? matches : rows.results
    .filter((row) => Number(row.isAdmin) === 1)
    .map((row) => Number(row.id))
    .filter((id) => id !== excludeUserId);
}

async function sendPush(userId: number, notificationId: number, input: NotificationInput) {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:fmgagency9@gmail.com";
  if (!publicKey || !privateKey) return;

  const rows = await database.prepare(`SELECT id, endpoint, p256dh, auth, expiration_time AS expirationTime
      FROM push_subscriptions WHERE user_id = ? AND active = 1`).bind(userId)
    .all<{ id: number; endpoint: string; p256dh: string; auth: string; expirationTime: number | null }>();
  const deliveries = await Promise.allSettled(rows.results.map(async (row) => {
    const subscription: PushSubscription = {
      endpoint: row.endpoint,
      expirationTime: row.expirationTime,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    const payload = await buildPushPayload({
      data: JSON.stringify({
        id: notificationId,
        title: input.title,
        body: input.message,
        url: `/?view=${encodeURIComponent(input.targetView)}&notification=${notificationId}`,
        tag: `${input.type}-${input.entityId ?? notificationId}`,
      }),
      options: { ttl: 60 * 60 * 24, urgency: "high" },
    }, subscription, { subject, publicKey, privateKey });
    const response = await fetch(row.endpoint, { ...payload, signal: AbortSignal.timeout(10_000) });
    if (response.status === 404 || response.status === 410) {
      await database.prepare("UPDATE push_subscriptions SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(row.id).run();
    } else if (!response.ok) {
      // Do not log endpoints, credentials, response bodies, or notification content.
      console.error("Push service rejected delivery", { notificationId, subscriptionId: row.id, status: response.status });
    }
  }));
  deliveries.forEach((delivery, index) => {
    if (delivery.status === "rejected") {
      console.error("Push delivery failed", { notificationId, subscriptionId: rows.results[index].id });
    }
  });
}

export async function notifyUsers(userIds: number[], input: NotificationInput) {
  try {
    await ensureNotificationsDatabase();
    const uniqueUsers = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== input.actorUserId))];
    for (const userId of uniqueUsers) {
      const result = await database.prepare(`INSERT INTO system_notifications
          (user_id, type, title, message, target_view, entity_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(userId, input.type.slice(0, 80), input.title.slice(0, 180), input.message.slice(0, 600),
          input.targetView, input.entityId ?? null).run();
      const notificationId = Number(result.meta.last_row_id);
      await sendPush(userId, notificationId, input);
    }
  } catch {
    console.error("Notification delivery failed");
  }
}
