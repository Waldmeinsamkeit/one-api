import http from "node:http";
import { config } from "./config.js";
import { InMemoryRepositories } from "./domain/repositories.js";
import { ModelRegistry } from "./domain/modelRegistry.js";
import { PlatformService } from "./domain/platformService.js";

const repositories = new InMemoryRepositories();
const modelRegistry = new ModelRegistry();
const service = new PlatformService({ repositories, modelRegistry });

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-workspace-id, x-role",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requireAuth(req, res) {
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${config.platformToken}`) {
    sendJson(res, 401, { success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } });
    return null;
  }
  return req.headers["x-workspace-id"] || config.defaultWorkspaceId;
}

function requireAdmin(req, res) {
  const role = req.headers["x-role"];
  if (role !== "admin") {
    sendJson(res, 403, { success: false, error: { code: "FORBIDDEN", message: "Admin role required" } });
    return false;
  }
  return true;
}

function safeError(res, error) {
  sendJson(res, 400, { success: false, error: { code: "BAD_REQUEST", message: error.message } });
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method ?? "GET";
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-workspace-id, x-role",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      });
      res.end();
      return;
    }

    if (path === "/healthz" && method === "GET") {
      sendJson(res, 200, { ok: true });
      return;
    }

    const workspaceId = requireAuth(req, res);
    if (!workspaceId) {
      return;
    }

    if (path === "/v1/models" && method === "GET") {
      sendJson(res, 200, { success: true, data: service.listModelProfiles() });
      return;
    }

    if (path === "/v1/models/activate" && method === "POST") {
      const body = await readJson(req);
      const activated = service.activateModelProfile({
        workspaceId,
        modelProfileId: body.model_profile_id
      });
      sendJson(res, 200, { success: true, data: activated });
      return;
    }

    if (path === "/v1/models/prompt" && method === "POST") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const body = await readJson(req);
      const updated = service.updateModelPrompt({
        modelProfileId: body.model_profile_id,
        systemPrompt: body.system_prompt
      });
      sendJson(res, 200, { success: true, data: updated });
      return;
    }

    if (path === "/v1/adapters/generate" && method === "POST") {
      const body = await readJson(req);
      const created = await service.generateAdapter({
        workspaceId,
        apiSlug: body.api_slug,
        action: body.action,
        sourceType: body.source_type,
        sourceContent: body.source_content,
        sourceUrl: body.source_url,
        targetFormat: body.target_format
      });
      sendJson(res, 201, { success: true, data: created });
      return;
    }

    if (path === "/v1/adapters" && method === "GET") {
      sendJson(res, 200, { success: true, data: service.listAdapters(workspaceId) });
      return;
    }

    if (path === "/v1/adapters/validate" && method === "POST") {
      const body = await readJson(req);
      const result = service.validateAdapter(body.adapter);
      sendJson(res, 200, { success: true, data: result });
      return;
    }

    if (path === "/v1/adapters/publish" && method === "POST") {
      const body = await readJson(req);
      const published = service.publishAdapter({ workspaceId, adapterId: body.adapter_id });
      sendJson(res, 200, { success: true, data: published });
      return;
    }

    if (path === "/v1/adapters/submit-public" && method === "POST") {
      const body = await readJson(req);
      const updated = service.submitPublicAdapter({ workspaceId, adapterId: body.adapter_id });
      sendJson(res, 200, { success: true, data: updated });
      return;
    }

    if (path === "/v1/adapters/dry-run" && method === "POST") {
      const body = await readJson(req);
      const result = await service.dryRun({
        workspaceId,
        adapter: body.adapter,
        payload: body.payload,
        tempSecrets: body.temp_secrets
      });
      sendJson(res, 200, result);
      return;
    }

    if (path === "/v1/secrets" && method === "POST") {
      const body = await readJson(req);
      const result = service.saveSecret({
        workspaceId,
        name: body.name,
        value: body.value
      });
      sendJson(res, 201, { success: true, data: result });
      return;
    }

    if (path === "/v1/secrets" && method === "GET") {
      sendJson(res, 200, { success: true, data: service.listSecrets(workspaceId) });
      return;
    }

    if (path === "/v1/execute" && method === "POST") {
      const body = await readJson(req);
      const result = await service.execute({
        workspaceId,
        apiSlug: body.api_slug,
        action: body.action,
        payload: body.payload
      });
      sendJson(res, 200, result);
      return;
    }

    if (path.startsWith("/v1/executions/") && method === "GET") {
      const executionId = path.split("/").at(-1);
      const execution = service.getExecution(executionId);
      if (!execution) {
        sendJson(res, 404, { success: false, error: { code: "NOT_FOUND", message: "Execution not found" } });
        return;
      }
      sendJson(res, 200, { success: true, data: execution });
      return;
    }

    if (path === "/v1/executions" && method === "GET") {
      const parsed = new URL(req.url ?? "/", "http://localhost");
      const limit = Number(parsed.searchParams.get("limit") || "100");
      sendJson(res, 200, { success: true, data: service.listExecutions(workspaceId, limit) });
      return;
    }

    if (path === "/v1/gallery/adapters" && method === "GET") {
      sendJson(res, 200, { success: true, data: service.listGallery() });
      return;
    }

    if (path === "/v1/gallery/review" && method === "POST") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const body = await readJson(req);
      const result = service.reviewPublicAdapter({
        adapterId: body.adapter_id,
        approved: Boolean(body.approved)
      });
      sendJson(res, 200, { success: true, data: result });
      return;
    }

    if (path.startsWith("/v1/gallery/adapters/") && path.endsWith("/clone") && method === "POST") {
      const parts = path.split("/");
      const adapterId = parts[4];
      const clone = service.cloneFromGallery({ workspaceId, adapterId });
      sendJson(res, 201, { success: true, data: clone });
      return;
    }

    sendJson(res, 404, { success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (error) {
    safeError(res, error);
  }
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`one-api listening on ${config.port}`);
});
