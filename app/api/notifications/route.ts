import { z } from "zod";
import { getSession } from "../../lib/auth-server";
import { database } from "../../lib/database";
import { ensureNotificationsDatabase, getNotificationsState, notifyUsers, testDevicePush } from "../../lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const subscriptionSchema = z.object({
  endpoint: z.string().url().refine((value) => value.startsWith("https://"), "Push endpoint must use HTTPS."),
  expirationTime: z.number().finite().nullable().default(null),
  keys: z.object({
    p256dh: z.string().min(20).max(1000),
    auth: z.string().min(8).max(500),
  }),
});

const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("testPush") }),
  z.object({ action: z.literal("subscriptionStatus"), endpoint: z.string().url() }),
  z.object({ action: z.literal("subscribe"), subscription: subscriptionSchema }),
  z.object({ action: z.literal("unsubscribe"), endpoint: z.string().url() }),
  z.object({ action: z.literal("read"), id: z.number().int().positive() }),
  z.object({ action: z.literal("readAll") }),
]);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function responseError(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid notification request." }, { status: 400 });
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected notification error." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    return Response.json(await getNotificationsState(session.userId));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    await ensureNotificationsDatabase();
    const payload = payloadSchema.parse(await request.json());

    if (payload.action === "testPush") return Response.json(await testDevicePush(session.userId));

    if (payload.action === "subscriptionStatus") {
      const subscription = await database.prepare("SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ? AND active = 1")
        .bind(session.userId, payload.endpoint).first();
      return Response.json({ subscribed: Boolean(subscription) });
    }

    if (payload.action === "subscribe") {
      const subscription = payload.subscription;
      await database.prepare(`INSERT INTO push_subscriptions
          (user_id, endpoint, p256dh, auth, expiration_time, user_agent, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
          auth = excluded.auth, expiration_time = excluded.expiration_time, user_agent = excluded.user_agent,
          active = 1, updated_at = CURRENT_TIMESTAMP`)
        .bind(session.userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth,
          subscription.expirationTime, request.headers.get("user-agent")?.slice(0, 500) ?? "").run();
      await notifyUsers([session.userId], {
        type: "push_enabled",
        title: "FMG notifications are active",
        message: "This device is registered for updates addressed to your account.",
        targetView: "dashboard",
      });
    } else if (payload.action === "unsubscribe") {
      await database.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
        .bind(session.userId, payload.endpoint).run();
    } else if (payload.action === "read") {
      await database.prepare("UPDATE system_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at = ''")
        .bind(payload.id, session.userId).run();
    } else {
      await database.prepare("UPDATE system_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at = ''")
        .bind(session.userId).run();
    }
    return Response.json(await getNotificationsState(session.userId));
  } catch (error) {
    return responseError(error);
  }
}
