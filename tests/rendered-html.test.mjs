import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the FMG production entrypoint", async () => {
  await access(new URL("dist/server/index.js", root));
  const [layout, page] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(layout, /FMG Agency \| Invoice & Quotation System/i);
  assert.match(layout, /og\.png/i);
  assert.match(page, /FmgSystem/);
  assert.doesNotMatch(`${layout}\n${page}`, /codex-preview|react-loading-skeleton/i);
});

test("ships the complete product, protected access, and persistent storage bindings", async () => {
  const [component, api, authApi, hosting, migration, authMigration] = await Promise.all([
    readFile(new URL("app/components/FmgSystem.tsx", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/route.ts", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("drizzle/0000_exotic_nightcrawler.sql", root), "utf8"),
    readFile(new URL("drizzle/0001_gifted_hobgoblin.sql", root), "utf8"),
  ]);
  for (const expected of ["New Invoice", "New Quotation", "Clients", "Categories", "All Data", "Settings"]) {
    assert.match(component, new RegExp(expected));
  }
  assert.match(api, /saveDocument/);
  assert.match(api, /createClient/);
  assert.match(api, /createCategory/);
  assert.match(api, /requireAuth/);
  for (const action of ["setup", "login", "logout", "change"]) {
    assert.match(authApi, new RegExp(`action: z\\.literal\\(\\"${action}\\"\\)`));
  }
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "FILES"/);
  assert.match(migration, /CREATE TABLE `documents`/);
  assert.match(migration, /CREATE TABLE `clients`/);
  assert.match(authMigration, /CREATE TABLE `auth_credentials`/);
  assert.match(authMigration, /CREATE TABLE `auth_sessions`/);
  assert.match(authMigration, /CREATE TABLE `auth_attempts`/);
});
