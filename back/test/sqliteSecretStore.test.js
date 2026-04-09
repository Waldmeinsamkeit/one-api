import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SqliteSecretStore } from "../src/domain/sqliteSecretStore.js";

function createTempDbPath() {
  const dir = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `secrets-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test("sqlite secret store persists and reloads secrets", () => {
  const dbPath = createTempDbPath();
  const store1 = new SqliteSecretStore({ dbPath });
  store1.upsertSecret({
    workspace_id: "default",
    name: "api_key",
    algorithm: "aes-256-gcm",
    iv: "iv-1",
    ciphertext: "cipher-1",
    tag: "tag-1"
  });
  const store2 = new SqliteSecretStore({ dbPath });
  const got = store2.getSecret("default", "api_key");
  assert.ok(got);
  assert.equal(got.workspace_id, "default");
  assert.equal(got.name, "api_key");
  assert.equal(got.algorithm, "aes-256-gcm");
  assert.equal(got.iv, "iv-1");
  assert.equal(got.ciphertext, "cipher-1");
  assert.equal(got.tag, "tag-1");
  const listed = store2.listSecrets("default");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "api_key");
});

test("sqlite secret store accepts authTag input and returns authTag for decrypt", () => {
  const dbPath = createTempDbPath();
  const store = new SqliteSecretStore({ dbPath });
  store.upsertSecret({
    workspace_id: "default",
    name: "api_key",
    algorithm: "aes-256-gcm",
    iv: "iv-2",
    ciphertext: "cipher-2",
    authTag: "auth-tag-2"
  });
  const got = store.getSecret("default", "api_key");
  assert.ok(got);
  assert.equal(got.authTag, "auth-tag-2");
});

test("sqlite secret store deletes secret by workspace and name", () => {
  const dbPath = createTempDbPath();
  const store = new SqliteSecretStore({ dbPath });
  store.upsertSecret({
    workspace_id: "default",
    name: "api_key",
    algorithm: "aes-256-gcm",
    iv: "iv-3",
    ciphertext: "cipher-3",
    authTag: "auth-tag-3"
  });
  const deleted = store.deleteSecret("default", "api_key");
  assert.equal(deleted, true);
  const got = store.getSecret("default", "api_key");
  assert.equal(got, null);
});
