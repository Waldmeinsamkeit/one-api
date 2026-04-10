import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SqliteAuthStore } from "../src/domain/sqliteAuthStore.js";
import { AuthService } from "../src/domain/authService.js";

function createTempDbPath() {
  const dir = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `local-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test("local password login verifies database credential and creates reusable user session", () => {
  const authStore = new SqliteAuthStore({ dbPath: createTempDbPath() });
  authStore.upsertLocalPasswordUser({
    username: "test1",
    password: "test1"
  });
  const authService = new AuthService({
    config: {
      localPasswordAuthEnabled: true,
      sessionTtlDays: 7
    },
    authStore
  });

  assert.equal(
    authService.verifyLocalPasswordCredential({ username: "test1", password: "test1" }),
    true
  );
  assert.equal(
    authService.verifyLocalPasswordCredential({ username: "test1", password: "wrong" }),
    false
  );

  const first = authService.loginLocalPasswordUser({ username: "test1" });
  const second = authService.loginLocalPasswordUser({ username: "test1" });

  assert.equal(first.user.username, "test1");
  assert.equal(first.user.provider, "local");
  assert.equal(second.user.id, first.user.id);
  assert.ok(first.user.workspace_id.startsWith("ws_"));

  const sessionRow = authStore.getSessionWithUser(first.session.id);
  assert.ok(sessionRow);
  assert.equal(sessionRow.username, "test1");
});

test("local password login returns false for unknown user", () => {
  const authStore = new SqliteAuthStore({ dbPath: createTempDbPath() });
  const authService = new AuthService({
    config: {
      localPasswordAuthEnabled: true,
      sessionTtlDays: 7
    },
    authStore
  });

  assert.equal(
    authService.verifyLocalPasswordCredential({ username: "nouser", password: "any" }),
    false
  );
});

test("local password login supports legacy env credential and bootstraps local user", () => {
  const authStore = new SqliteAuthStore({ dbPath: createTempDbPath() });
  const authService = new AuthService({
    config: {
      localPasswordAuthEnabled: true,
      localTestUsername: "test1",
      localTestPassword: "test1",
      sessionTtlDays: 7
    },
    authStore
  });

  assert.equal(
    authService.verifyLocalPasswordCredential({ username: "test1", password: "test1" }),
    true
  );
  const { user } = authService.loginLocalPasswordUser({ username: "test1" });
  assert.equal(user.provider, "local");
  assert.equal(user.username, "test1");
  assert.equal(
    authStore.verifyLocalUserCredential({ username: "test1", password: "test1" }),
    true
  );
});
