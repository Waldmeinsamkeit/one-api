import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SqliteAuthStore } from "../src/domain/sqliteAuthStore.js";

function createTempDbPath() {
  const dir = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `auth-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test("sqlite auth store upserts oauth user and creates session", () => {
  const dbPath = createTempDbPath();
  const store = new SqliteAuthStore({ dbPath });
  const user = store.upsertOAuthUser({
    provider: "linuxdo",
    providerUserId: "u-1",
    username: "alice",
    email: "alice@example.com"
  });
  assert.ok(user.id);
  assert.ok(user.workspace_id.startsWith("ws_"));
  const session = store.createSession({ userId: user.id, ttlDays: 1 });
  const row = store.getSessionWithUser(session.id);
  assert.ok(row);
  assert.equal(row.user_id, user.id);
  assert.equal(row.workspace_id, user.workspace_id);
});

test("sqlite auth store creates and deletes admin session", () => {
  const dbPath = createTempDbPath();
  const store = new SqliteAuthStore({ dbPath });
  const admin = store.createAdminSession({ username: "admin", ttlDays: 1, lastIp: "127.0.0.1" });
  const got = store.getAdminSession(admin.id);
  assert.ok(got);
  assert.equal(got.username, "admin");
  assert.equal(got.last_ip, "127.0.0.1");
  const deleted = store.deleteAdminSession(admin.id);
  assert.equal(deleted, true);
  const empty = store.getAdminSession(admin.id);
  assert.equal(empty, null);
});

test("sqlite auth store lists users and deletes user with sessions", () => {
  const dbPath = createTempDbPath();
  const store = new SqliteAuthStore({ dbPath });
  const user = store.upsertOAuthUser({
    provider: "linuxdo",
    providerUserId: "u-2",
    username: "bob",
    email: "bob@example.com"
  });
  const session = store.createSession({ userId: user.id, ttlDays: 1 });
  const users = store.listUsers({ q: "bob" });
  assert.equal(users.length, 1);
  assert.equal(users[0].id, user.id);
  const deleted = store.deleteUserById(user.id);
  assert.ok(deleted);
  const after = store.getSessionWithUser(session.id);
  assert.equal(after, null);
});

test("sqlite auth store can create and verify local password user", () => {
  const dbPath = createTempDbPath();
  const store = new SqliteAuthStore({ dbPath });
  const user = store.upsertLocalPasswordUser({
    username: "local-user",
    password: "local-pass"
  });

  assert.equal(user.provider, "local");
  assert.equal(user.username, "local-user");
  assert.equal(store.verifyLocalUserCredential({ username: "local-user", password: "local-pass" }), true);
  assert.equal(store.verifyLocalUserCredential({ username: "local-user", password: "wrong" }), false);
});
