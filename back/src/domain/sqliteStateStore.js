import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function ensureParentDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function parseJson(text) {
  if (text === null || text === undefined || text === "") {
    return null;
  }
  return JSON.parse(text);
}

function toJson(value) {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

export class SqliteStateStore {
  constructor({ dbPath }) {
    if (!dbPath) {
      throw new Error("dbPath is required");
    }
    ensureParentDir(dbPath);
    this.db = new DatabaseSync(path.resolve(dbPath));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS adapters (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        api_slug TEXT NOT NULL,
        action TEXT NOT NULL,
        adapter_schema_version TEXT NOT NULL,
        logic_version INTEGER NOT NULL,
        model_profile_id TEXT,
        status TEXT NOT NULL,
        is_public INTEGER NOT NULL,
        review_status TEXT NOT NULL,
        spec_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_adapters_workspace ON adapters(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_adapters_action ON adapters(workspace_id, api_slug, action);

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        api_slug TEXT NOT NULL,
        action TEXT NOT NULL,
        dry_run INTEGER NOT NULL,
        success INTEGER NOT NULL,
        upstream_status INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        request_snapshot_json TEXT,
        upstream_response_json TEXT,
        final_output_json TEXT,
        trace_snapshot_json TEXT,
        trace_enabled INTEGER NOT NULL,
        trace_expire_at TEXT,
        response_meta_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_executions_workspace ON executions(workspace_id, created_at DESC);
    `);
  }

  loadAdapters() {
    const rows = this.db
      .prepare(
        `
      SELECT
        id, workspace_id, api_slug, action, adapter_schema_version, logic_version, model_profile_id,
        status, is_public, review_status, spec_json, created_at, updated_at
      FROM adapters
    `
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      api_slug: row.api_slug,
      action: row.action,
      adapter_schema_version: row.adapter_schema_version,
      logic_version: Number(row.logic_version),
      model_profile_id: row.model_profile_id,
      status: row.status,
      is_public: Boolean(row.is_public),
      review_status: row.review_status,
      spec: parseJson(row.spec_json),
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  saveAdapters(adapters) {
    const insert = this.db.prepare(`
      INSERT INTO adapters (
        id, workspace_id, api_slug, action, adapter_schema_version, logic_version, model_profile_id,
        status, is_public, review_status, spec_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM adapters");
      for (const item of adapters) {
        insert.run(
          item.id,
          item.workspace_id,
          item.api_slug,
          item.action,
          item.adapter_schema_version,
          Number(item.logic_version ?? 0),
          item.model_profile_id ?? null,
          item.status ?? "draft",
          item.is_public ? 1 : 0,
          item.review_status ?? "private",
          toJson(item.spec),
          item.created_at,
          item.updated_at
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  loadExecutions() {
    const rows = this.db
      .prepare(
        `
      SELECT
        id, workspace_id, api_slug, action, dry_run, success, upstream_status, latency_ms,
        request_snapshot_json, upstream_response_json, final_output_json, trace_snapshot_json,
        trace_enabled, trace_expire_at, response_meta_json, created_at
      FROM executions
    `
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      api_slug: row.api_slug,
      action: row.action,
      dry_run: Boolean(row.dry_run),
      success: Boolean(row.success),
      upstream_status: Number(row.upstream_status),
      latency_ms: Number(row.latency_ms),
      request_snapshot: parseJson(row.request_snapshot_json),
      upstream_response: parseJson(row.upstream_response_json),
      final_output: parseJson(row.final_output_json),
      trace_snapshot: parseJson(row.trace_snapshot_json),
      trace_enabled: Boolean(row.trace_enabled),
      trace_expire_at: row.trace_expire_at,
      response_meta: parseJson(row.response_meta_json),
      created_at: row.created_at
    }));
  }

  saveExecutions(executions) {
    const insert = this.db.prepare(`
      INSERT INTO executions (
        id, workspace_id, api_slug, action, dry_run, success, upstream_status, latency_ms,
        request_snapshot_json, upstream_response_json, final_output_json, trace_snapshot_json,
        trace_enabled, trace_expire_at, response_meta_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM executions");
      for (const item of executions) {
        insert.run(
          item.id,
          item.workspace_id,
          item.api_slug,
          item.action,
          item.dry_run ? 1 : 0,
          item.success ? 1 : 0,
          Number(item.upstream_status ?? 0),
          Number(item.latency_ms ?? 0),
          toJson(item.request_snapshot),
          toJson(item.upstream_response),
          toJson(item.final_output),
          toJson(item.trace_snapshot),
          item.trace_enabled ? 1 : 0,
          item.trace_expire_at ?? null,
          toJson(item.response_meta),
          item.created_at
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
