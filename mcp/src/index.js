import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { resolveConfig } from "../../cli/dist/core/config.js";
import {
  refreshReadinessAfterSecretSet,
  upsertPendingSnapshotFromGen
} from "../../cli/dist/core/context.js";
import { ApiHttpClient } from "../../cli/dist/core/http.js";
import { getGlobalConfigPath, getProjectConfigPath } from "../../cli/dist/core/paths.js";
import { normalizeGlobalConfig, normalizeProjectConfig } from "../../cli/dist/core/validate.js";

const text = (value) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }]
});

const readJsonIfExists = async (filePath) => {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

const writeJson = async (filePath, data) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const getClient = async () => {
  const resolved = await resolveConfig({ cwd: process.cwd() });
  if (!resolved.backend_url.value || !resolved.token.value) {
    throw new Error("Missing backend_url or token, run init_config first.");
  }
  return new ApiHttpClient({
    backend_url: resolved.backend_url.value,
    token: resolved.token.value,
    workspace_id: resolved.workspace_id.value
  });
};

const readContextIndex = async (cwd) => {
  const indexPath = path.join(cwd, ".av-cli", "context", "index.json");
  return readJsonIfExists(indexPath);
};

const resolveAction = async (slug, action) => {
  if (action) {
    return action;
  }
  const index = await readContextIndex(process.cwd());
  const matched = (index?.snapshots || []).filter((item) => item.slug === slug);
  if (matched.length === 1) {
    return matched[0].action;
  }
  if (matched.length > 1) {
    throw new Error(`Multiple actions for slug "${slug}", please provide action.`);
  }
  throw new Error(`No local snapshot for slug "${slug}", please provide action.`);
};

const validatePayloadBySnapshotHint = async (slug, action, payload) => {
  const detailPath = path.join(process.cwd(), ".av-cli", "context", `${slug}.${action}.json`);
  const detail = await readJsonIfExists(detailPath);
  const hint = detail?.payload_schema_hint;
  if (!hint || typeof hint !== "object" || payload === null || typeof payload !== "object") {
    return;
  }

  const errors = [];
  for (const [key, rule] of Object.entries(hint)) {
    const expected = rule?.type;
    const value = payload[key];
    if (value === undefined || !expected) {
      continue;
    }
    if (expected === "number" && typeof value !== "number") {
      errors.push(`${key} should be number`);
    } else if (expected === "string" && typeof value !== "string") {
      errors.push(`${key} should be string`);
    } else if (expected === "boolean" && typeof value !== "boolean") {
      errors.push(`${key} should be boolean`);
    } else if (expected === "array" && !Array.isArray(value)) {
      errors.push(`${key} should be array`);
    } else if (expected === "object" && (value === null || typeof value !== "object" || Array.isArray(value))) {
      errors.push(`${key} should be object`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Payload validation failed: ${errors.join("; ")}`);
  }
};

const server = new McpServer({
  name: "av-mcp",
  version: "0.1.0"
});

server.tool(
  "init_config",
  {
    backend_url: z.string().url(),
    token: z.string().min(1),
    workspace_id: z.string().optional(),
    profile: z.string().optional(),
    adapter_dir: z.string().optional(),
    preferred_model: z.string().optional()
  },
  async (args) => {
    const cwd = process.cwd();
    const profileName = args.profile || "default";
    const globalPath = getGlobalConfigPath({
      platform: process.platform,
      homeDir: os.homedir(),
      env: process.env
    });
    const projectPath = getProjectConfigPath(cwd);

    const globalExisting = normalizeGlobalConfig(await readJsonIfExists(globalPath));
    const projectExisting = normalizeProjectConfig(await readJsonIfExists(projectPath));

    const globalConfig = {
      active_profile: profileName,
      profiles: {
        ...(globalExisting.profiles || {}),
        [profileName]: {
          backend_url: args.backend_url,
          token: args.token,
          default_workspace: args.workspace_id || globalExisting.profiles?.[profileName]?.default_workspace
        }
      }
    };
    const projectConfig = {
      workspace_id: args.workspace_id || projectExisting.workspace_id,
      adapter_dir: args.adapter_dir || projectExisting.adapter_dir,
      preferred_model: args.preferred_model || projectExisting.preferred_model
    };

    await writeJson(globalPath, globalConfig);
    await writeJson(projectPath, projectConfig);

    return text({
      success: true,
      active_profile: profileName,
      global_config_path: globalPath,
      project_config_path: projectPath
    });
  }
);

server.tool(
  "gen_from_curl",
  {
    api_slug: z.string().min(1),
    action: z.string().min(1),
    curl: z.string().min(1),
    target_format: z.string().optional(),
    source_url: z.string().url().optional()
  },
  async (args) => {
    const client = await getClient();
    const data = await client.generate({
      api_slug: args.api_slug,
      action: args.action,
      source_type: "curl",
      source_content: args.curl,
      source_url: args.source_url,
      target_format: args.target_format
    });

    await upsertPendingSnapshotFromGen({
      cwd: process.cwd(),
      api_slug: args.api_slug,
      action: args.action,
      generated_adapter: data
    });

    return text({ success: true, data });
  }
);

server.tool("adapters_list", {}, async () => {
  const client = await getClient();
  const data = (await client.adapters()) || [];
  const brief = data.map((item) => ({
    id: item.id,
    api_slug: item.api_slug,
    action: item.action,
    status: item.status,
    description: item.description,
    schema_hint: item.schema_hint || null
  }));
  return text({ success: true, total: brief.length, adapters: brief });
});

server.tool(
  "adapter_get",
  {
    api_slug: z.string().min(1),
    action: z.string().optional()
  },
  async (args) => {
    const client = await getClient();
    const data = (await client.adapters()) || [];
    const filtered = data.filter(
      (item) => item.api_slug === args.api_slug && (args.action ? item.action === args.action : true)
    );
    if (filtered.length === 0) {
      throw new Error("Adapter not found.");
    }
    return text({ success: true, adapters: filtered });
  }
);

server.tool(
  "execute_api",
  {
    api_slug: z.string().min(1),
    action: z.string().optional(),
    payload: z.unknown().optional(),
    include_hint: z.boolean().optional()
  },
  async (args) => {
    const action = await resolveAction(args.api_slug, args.action);
    const payload = args.payload ?? {};
    await validatePayloadBySnapshotHint(args.api_slug, action, payload);

    const client = await getClient();
    const data = await client.execute({
      api_slug: args.api_slug,
      action,
      payload,
      options: args.include_hint ? { include_hint: true } : undefined
    });

    return text({ success: true, data });
  }
);

server.tool(
  "secrets_set",
  {
    name: z.string().min(1),
    value: z.string().min(1)
  },
  async (args) => {
    const client = await getClient();
    await client.saveSecret({ name: args.name, value: args.value });
    const readiness = await refreshReadinessAfterSecretSet({
      cwd: process.cwd(),
      secret_name: args.name
    });
    return text({ success: true, readiness });
  }
);

server.tool(
  "logs_tail",
  {
    limit: z.number().int().min(1).max(100).default(10)
  },
  async (args) => {
    const client = await getClient();
    const data = await client.executions(args.limit);
    return text({ success: true, logs: data || [] });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
