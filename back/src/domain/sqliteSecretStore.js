import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function ensureParentDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

export class SqliteSecretStore {
  constructor({ dbPath }) {
    if (!dbPath) {
      throw new Error("dbPath is required");
    }
    ensureParentDir(dbPath);
    this.db = new DatabaseSync(path.resolve(dbPath));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, name)
      )
    `);
  }

  upsertSecret(secret) {
    const existing = this.getSecret(secret.workspace_id, secret.name);
    const now = new Date().toISOString();
    const createdAt = existing?.created_at ?? now;
    const authTag = secret.authTag ?? secret.tag;
    if (!authTag) {
      throw new Error("secret.authTag is required");
    }
    this.db
      .prepare(
        `
        INSERT INTO secrets (
          workspace_id, name, algorithm, iv, ciphertext, tag, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, name) DO UPDATE SET
          algorithm = excluded.algorithm,
          iv = excluded.iv,
          ciphertext = excluded.ciphertext,
          tag = excluded.tag,
          updated_at = excluded.updated_at
      `
      )
      .run(
        secret.workspace_id,
        secret.name,
        secret.algorithm,
        secret.iv,
        secret.ciphertext,
        authTag,
        createdAt,
        now
      );
    return this.getSecret(secret.workspace_id, secret.name);
  }

  getSecret(workspaceId, name) {
    const row =
      this.db
        .prepare(
          `
        SELECT workspace_id, name, algorithm, iv, ciphertext, tag, created_at, updated_at
        FROM secrets
        WHERE workspace_id = ? AND name = ?
      `
        )
        .get(workspaceId, name) ?? null;
    if (!row) {
      return null;
    }
    return {
      ...row,
      authTag: row.tag
    };
  }

  listSecrets(workspaceId) {
    return this.db
      .prepare(
        `
      SELECT workspace_id, name, algorithm, created_at, updated_at
      FROM secrets
      WHERE workspace_id = ?
      ORDER BY datetime(updated_at) DESC
    `
      )
      .all(workspaceId);
  }
}
