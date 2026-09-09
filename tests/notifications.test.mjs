import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

test('isolated Account Manager work order reaches only Production Manager; device ownership and delivery failures', async () => {
  // Never load .env.local, contact production, or generate VAPID keys in this test.
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PUBLIC_KEY;
  globalThis.fmgTestSession = { userId: 101, username: 'test-account', displayName: 'Test Account', roleLabel: 'Account Manager', isAdmin: false, permissions: ['production'], clientId: null, employeeId: null };
  await mkdir(new URL('../work/', import.meta.url), { recursive: true });
  const bundle = new URL('../work/notifications-test.mjs', import.meta.url);
  await build({
    stdin: { contents: `export * from './app/lib/notifications'; export { database } from './app/lib/database'; export { POST as createOrder } from './app/api/production/route'; export { POST as notificationAction } from './app/api/notifications/route';`, resolveDir: process.cwd() },
    outfile: fileURLToPath(bundle), bundle: true, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{ name: 'isolated-auth-and-push', setup(b) {
      b.onResolve({ filter: /auth-server$/ }, () => ({ path: 'auth', namespace: 'test' }));
      b.onResolve({ filter: /^@block65\/webcrypto-web-push$/ }, () => ({ path: 'push', namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'auth' ? `export async function getSession() { return globalThis.fmgTestSession; } export async function requirePermission() { return null; }` : `export async function buildPushPayload(input) { return { method: 'POST', body: input.data }; }` }));
    } }],
  });
  const app = await import(bundle.href + '?test=' + Date.now());
  const db = app.database;
  for (const file of (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL('../drizzle/' + file, import.meta.url), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').filter(s => s.trim())) await db.prepare(statement).run();
  }
  // The existing application adds this client-finance field at first use.
  await db.prepare("ALTER TABLE clients ADD COLUMN agency_key TEXT NOT NULL DEFAULT 'fmg'").run();
  await db.prepare("INSERT INTO clients (id, name, owner_name, phone) VALUES (1, 'Isolated client', 'Fixture', '')").run();
  for (const [id, role, admin, client] of [[101, 'Account Manager', 0, null], [102, 'Production Manager', 0, null], [103, 'Operation Manager', 0, null], [104, 'Administrator', 1, null], [105, 'Client', 0, 1]]) {
    await db.prepare('INSERT INTO auth_users (id, username, role_label, password_hash, password_salt, password_iterations, is_admin, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, 'test-' + id, role, 'fixture', 'fixture', 1, admin, client).run();
  }
  const request = body => new Request('https://fmg.test/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://fmg.test' }, body: JSON.stringify(body) });
  const response = await app.createOrder(request({ action: 'create', data: { documentType: 'media_guide', clientId: 1, bundles: [{ id: 'test-bundle', catalogId: 3, name: 'Test bundle', price: 10, inputs: [], outputs: [] }], addons: [], workDate: '2026-09-07', accountNote: 'Isolated test only' } }));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const delivered = await db.prepare("SELECT user_id, type, entity_id FROM system_notifications WHERE type='work_order_pending_production'").all();
  assert.equal(delivered.results.length, 1);
  assert.equal(delivered.results[0].user_id, 102);
  assert.ok(delivered.results[0].entity_id > 0);
  assert.equal((await app.getNotificationsState(101)).unreadCount, 0);
  assert.equal((await app.getNotificationsState(102)).unreadCount, 1);
  assert.equal((await app.getNotificationsState(102)).pushConfigured, false);

  await db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (102, 'https://push.invalid/fixture', 'fixture', 'fixture')").run();
  assert.deepEqual(await (await app.notificationAction(request({ action: 'subscriptionStatus', endpoint: 'https://push.invalid/fixture' }))).json(), { subscribed: false });
  globalThis.fmgTestSession = { ...globalThis.fmgTestSession, userId: 102, roleLabel: 'Production Manager' };
  assert.deepEqual(await (await app.notificationAction(request({ action: 'subscriptionStatus', endpoint: 'https://push.invalid/fixture' }))).json(), { subscribed: true });

  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  // Synthetic strings are consumed only by the mocked payload builder, never real keys.
  process.env.VAPID_PRIVATE_KEY = 'mock-only';
  process.env.VAPID_PUBLIC_KEY = 'mock-only';
  try {
    globalThis.fetch = async () => new Response('', { status: 201 });
    const testResult = await app.testDevicePush(102);
    assert.equal(testResult.accepted, 1);
    assert.equal((await app.getNotificationsState(102)).notifications.length, 1);
    globalThis.fetch = async () => new Response('', { status: 410 });
    assert.equal((await app.testDevicePush(102)).failed, 1);
    assert.equal((await db.prepare('SELECT active FROM push_subscriptions').first()).active, 1);
    logs.length = 0;
    globalThis.fetch = async () => new Response('', { status: 503 });
    await app.notifyUsers([102], { type: 'task_assigned', title: 'Task', message: 'Fixture', targetView: 'tasks' });
    assert.equal(logs[0][1].status, 503);
    assert.equal((await db.prepare('SELECT active FROM push_subscriptions').first()).active, 1);
    globalThis.fetch = async () => new Response('', { status: 410 });
    await app.notifyUsers([102], { type: 'employee_request_assigned', title: 'Request', message: 'Fixture', targetView: 'requests' });
    assert.equal((await db.prepare('SELECT active FROM push_subscriptions').first()).active, 0);
    assert.equal((await app.getNotificationsState(102)).notifications.length, 3);
    assert.doesNotMatch(JSON.stringify(logs), /push.invalid|mock-only/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
  }
  await app.notifyUsers([101], { type: 'task_assigned', title: 'Other account', message: 'Fixture', targetView: 'tasks' });
  const otherId = (await app.getNotificationsState(101)).notifications[0].id;
  assert.equal((await app.notificationAction(request({ action: 'delete', id: otherId }))).status, 200);
  assert.equal((await app.getNotificationsState(101)).notifications.length, 1);
  const ownId = (await app.getNotificationsState(102)).notifications[0].id;
  const deleted = await (await app.notificationAction(request({ action: 'delete', id: ownId }))).json();
  assert.equal(deleted.notifications.length, 2);
  assert.equal(deleted.unreadCount, 2);
  const cleared = await (await app.notificationAction(request({ action: 'clearAll' }))).json();
  assert.equal(cleared.notifications.length, 0);
  assert.equal(cleared.unreadCount, 0);
  assert.equal((await app.getNotificationsState(101)).notifications.length, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM push_subscriptions').first()).total, 1);
  globalThis.fmgTestSession = null;
  assert.equal((await app.notificationAction(request({ action: 'clearAll' }))).status, 401);
});

test('service worker displays push and keeps notification navigation on the application origin', async () => {
  const handlers = {};
  let shown;
  let opened;
  const self = { addEventListener: (name, handler) => { handlers[name] = handler; }, location: { origin: 'https://fmg.test' }, registration: { showNotification: async (title, options) => { shown = { title, options }; } }, clients: { matchAll: async () => [], openWindow: async url => { opened = url; } } };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL });
  let pending;
  handlers.push({ data: { text: () => JSON.stringify({ title: 'New work order', body: 'Ready', url: '/?view=work-order' }) }, waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(shown.title, 'New work order');
  handlers.notificationclick({ notification: { close() {}, data: { url: 'https://external.invalid/' } }, waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(opened, 'https://fmg.test/');
});
