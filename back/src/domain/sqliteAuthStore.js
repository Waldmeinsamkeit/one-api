import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

function ensureParentDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function toWorkspaceId(provider, providerUserId) {
  const digest = crypto.createHash("sha1").update(`${provider}:${providerUserId}`).digest("hex");
  return `ws_${digest.slice(0, 12)}`;
}

function hashLocalPassword(password) {
  const normalized = String(password ?? "");
  if (!normalized) {
    throw new Error("password is required");
  }
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(normalized, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyLocalPassword(password, encoded) {
  const rawPassword = String(password ?? "");
  const stored = String(encoded ?? "");
  if (!rawPassword || !stored) {
    return false;
  }
  if (stored.startsWith("plain:")) {
    const expected = stored.slice("plain:".length);
    if (expected.length !== rawPassword.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(rawPassword), Buffer.from(expected));
  }
  const match = /^scrypt\$([0-9a-f]+)\$([0-9a-f]+)$/i.exec(stored);
  if (!match) {
    return false;
  }
  const salt = Buffer.from(match[1], "hex");
  const expected = Buffer.from(match[2], "hex");
  const actual = crypto.scryptSync(rawPassword, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export class SqliteAuthStore {
  constructor({ dbPath }) {
    ensureParentDir(dbPath);
    this.db = new DatabaseSync(path.resolve(dbPath));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        username TEXT,
        email TEXT,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT,
        UNIQUE(provider, provider_user_id),
        UNIQUE(workspace_id)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_ip TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
    `);
    this.ensureUserColumn("local_password_hash TEXT");
    this.ensureUserColumn("password_updated_at TEXT");
  }

  ensureUserColumn(definition) {
    const [columnName] = definition.split(/\s+/, 1);
    const columns = this.db.prepare("PRAGMA table_info(users)").all();
    if (columns.some((column) => column.name === columnName)) {
      return;
    }
    this.db.exec(`ALTER TABLE users ADD COLUMN ${definition}`);
  }

  upsertOAuthUser({ provider, providerUserId, username, email }) {
    const existing = this.db
      .prepare(
        `
      SELECT id, provider, provider_user_id, username, email, workspace_id, created_at, updated_at, last_login_at
      FROM users
      WHERE provider = ? AND provider_user_id = ?
    `
      )
      .get(provider, providerUserId);

    const now = nowIso();
    if (existing) {
      this.db
        .prepare(
          `
        UPDATE users
        SET username = ?, email = ?, updated_at = ?, last_login_at = ?
        WHERE id = ?
      `
        )
        .run(username ?? null, email ?? null, now, now, existing.id);
      return this.getUserById(existing.id);
    }

    const id = crypto.randomUUID();
    const workspaceId = toWorkspaceId(provider, providerUserId);
    this.db
      .prepare(
        `
      INSERT INTO users (
        id, provider, provider_user_id, username, email, workspace_id, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        provider,
        providerUserId,
        username ?? null,
        email ?? null,
        workspaceId,
        now,
        now,
        now
      );
    return this.getUserById(id);
  }

  getUserById(id) {
    return (
      this.db
        .prepare(
          `
      SELECT id, provider, provider_user_id, username, email, workspace_id, created_at, updated_at, last_login_at
      FROM users
      WHERE id = ?
    `
        )
        .get(id) ?? null
    );
  }

  getLocalUserByUsername(username) {
    const normalized = String(username ?? "").trim();
    if (!normalized) {
      return null;
    }
    return (
      this.db
        .prepare(
          `
      SELECT id, provider, provider_user_id, username, email, workspace_id, created_at, updated_at, last_login_at, local_password_hash
      FROM users
      WHERE provider = 'local' AND (username = ? OR provider_user_id = ?)
      ORDER BY datetime(updated_at) DESC
      LIMIT 1
    `
        )
        .get(normalized, normalized) ?? null
    );
  }

  upsertLocalPasswordUser({ username, password, email = null }) {
    const normalized = String(username ?? "").trim();
    if (!normalized) {
      throw new Error("username is required");
    }
    const passwordHash = hashLocalPassword(password);
    const existing = this.getLocalUserByUsername(normalized);
    const now = nowIso();
    if (existing) {
      this.db
        .prepare(
          `
        UPDATE users
        SET username = ?, provider_user_id = ?, email = ?, local_password_hash = ?, password_updated_at = ?, updated_at = ?
        WHERE id = ?
      `
        )
        .run(normalized, normalized, email, passwordHash, now, now, existing.id);
      return this.getUserById(existing.id);
    }
    const id = crypto.randomUUID();
    const workspaceId = toWorkspaceId("local", normalized);
    this.db
      .prepare(
        `
      INSERT INTO users (
        id, provider, provider_user_id, username, email, workspace_id, created_at, updated_at, last_login_at, local_password_hash, password_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        "local",
        normalized,
        normalized,
        email,
        workspaceId,
        now,
        now,
        null,
        passwordHash,
        now
      );
    return this.getUserById(id);
  }

  verifyLocalUserCredential({ username, password }) {
    const user = this.getLocalUserByUsername(username);
    if (!user || !user.local_password_hash) {
      return false;
    }
    return verifyLocalPassword(password, user.local_password_hash);
  }

  touchUserLastLogin(userId) {
    if (!userId) {
      return;
    }
    const now = nowIso();
    this.db
      .prepare(
        `
      UPDATE users
      SET last_login_at = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(now, now, userId);
  }

  createSession({ userId, ttlDays }) {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    this.db
      .prepare(
        `
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(id, userId, expiresAt, createdAt);
    return { id, user_id: userId, expires_at: expiresAt, created_at: createdAt };
  }

  getSessionWithUser(sessionId) {
    this.cleanupExpiredSessions();
    return (
      this.db
        .prepare(
          `
      SELECT
        s.id AS session_id,
        s.user_id AS session_user_id,
        s.expires_at AS session_expires_at,
        u.id AS user_id,
        u.provider AS provider,
        u.provider_user_id AS provider_user_id,
        u.username AS username,
        u.email AS email,
        u.workspace_id AS workspace_id
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `
        )
        .get(sessionId) ?? null
    );
  }

  deleteSession(sessionId) {
    const result = this.db
      .prepare(
        `
      DELETE FROM sessions
      WHERE id = ?
    `
      )
      .run(sessionId);
    return result.changes > 0;
  }

  cleanupExpiredSessions(now = nowIso()) {
    this.db
      .prepare(
        `
      DELETE FROM sessions
      WHERE expires_at <= ?
    `
      )
      .run(now);
    this.db
      .prepare(
        `
      DELETE FROM admin_sessions
      WHERE expires_at <= ?
    `
      )
      .run(now);
  }

  createAdminSession({ username, ttlDays, lastIp }) {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    this.db
      .prepare(
        `
      INSERT INTO admin_sessions (id, username, expires_at, created_at, last_ip)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(id, username, expiresAt, createdAt, lastIp ?? null);
    return { id, username, expires_at: expiresAt, created_at: createdAt, last_ip: lastIp ?? null };
  }

  getAdminSession(sessionId) {
    this.cleanupExpiredSessions();
    return (
      this.db
        .prepare(
          `
      SELECT id, username, expires_at, created_at, last_ip
      FROM admin_sessions
      WHERE id = ?
    `
        )
        .get(sessionId) ?? null
    );
  }

  deleteAdminSession(sessionId) {
    const result = this.db
      .prepare(
        `
      DELETE FROM admin_sessions
      WHERE id = ?
    `
      )
      .run(sessionId);
    return result.changes > 0;
  }

  listUsers({ limit = 100, offset = 0, q = "" } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const keyword = `%${String(q || "").trim()}%`;
    return this.db
      .prepare(
        `
      SELECT id, provider, provider_user_id, username, email, workspace_id, created_at, updated_at, last_login_at
      FROM users
      WHERE (? = '%%')
        OR (COALESCE(username, '') LIKE ?)
        OR (COALESCE(email, '') LIKE ?)
        OR (provider_user_id LIKE ?)
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(keyword, keyword, keyword, keyword, safeLimit, safeOffset);
  }

  deleteUserById(userId) {
    const user = this.getUserById(userId);
    if (!user) {
      return null;
    }
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      this.db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      this.db.exec("COMMIT");
      return user;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
