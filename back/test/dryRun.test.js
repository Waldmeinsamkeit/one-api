import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

function createUpstreamServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ weather: { temp: 20, city: "Paris" } }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

test("dry run executes without persisting secrets", async () => {
  process.env.ALLOW_PRIVATE_UPSTREAM = "true";
  const { InMemoryRepositories } = await import("../src/domain/repositories.js");
  const { ModelRegistry } = await import("../src/domain/modelRegistry.js");
  const { PlatformService } = await import("../src/domain/platformService.js");
  const { server, port } = await createUpstreamServer();
  try {
    const repos = new InMemoryRepositories();
    const service = new PlatformService({ repositories: repos, modelRegistry: new ModelRegistry() });
    const adapter = {
      api_slug: "weather",
      action: "now",
      adapter_schema_version: "1.0",
      target: {
        url: `http://127.0.0.1:${port}/weather`,
        method: "GET",
        headers: {
          Authorization: "Bearer {{secrets.api_key}}"
        }
      },
      response_mapping: {
        temp: "$.weather.temp"
      },
      auth_ref: {
        secret_name: "api_key"
      }
    };
    const response = await service.dryRun({
      workspaceId: "w1",
      adapter,
      payload: {},
      tempSecrets: { api_key: "tmp" }
    });
    assert.equal(response.success, true);
    assert.equal(response.data.temp, 20);
    assert.equal(repos.secrets.length, 0);
    assert.equal(repos.executions.length, 1);
    assert.equal(repos.executions[0].dry_run, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dry run works without api_key when adapter has no secret placeholders", async () => {
  process.env.ALLOW_PRIVATE_UPSTREAM = "true";
  const { InMemoryRepositories } = await import("../src/domain/repositories.js");
  const { ModelRegistry } = await import("../src/domain/modelRegistry.js");
  const { PlatformService } = await import("../src/domain/platformService.js");
  const { server, port } = await createUpstreamServer();
  try {
    const repos = new InMemoryRepositories();
    const service = new PlatformService({ repositories: repos, modelRegistry: new ModelRegistry() });
    const adapter = {
      api_slug: "country",
      action: "lookup",
      adapter_schema_version: "1.0",
      target: {
        url: `http://127.0.0.1:${port}/country`,
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      },
      response_mapping: {
        temp: "$.weather.temp"
      }
    };
    const response = await service.dryRun({
      workspaceId: "w1",
      adapter,
      payload: {},
      tempSecrets: {}
    });
    assert.equal(response.success, true);
    assert.equal(response.data.temp, 20);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("execute includes schema_hint only when options.include_hint is true", async () => {
  process.env.ALLOW_PRIVATE_UPSTREAM = "true";
  const { InMemoryRepositories } = await import("../src/domain/repositories.js");
  const { ModelRegistry } = await import("../src/domain/modelRegistry.js");
  const { PlatformService } = await import("../src/domain/platformService.js");
  const { server, port } = await createUpstreamServer();
  try {
    const repos = new InMemoryRepositories();
    const service = new PlatformService({ repositories: repos, modelRegistry: new ModelRegistry() });
    const created = repos.createAdapter({
      workspace_id: "w1",
      api_slug: "weather",
      action: "current",
      adapter_schema_version: "1.0",
      logic_version: 1,
      status: "active",
      spec: {
        api_slug: "weather",
        action: "current",
        adapter_schema_version: "1.0",
        target: {
          url: `http://127.0.0.1:${port}/weather`,
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        },
        response_mapping: {
          temp: "$.weather.temp"
        },
        schema_hint: {
          temp: { type: "number", desc: "Current temperature", unit: "Celsius" }
        }
      }
    });
    repos.publishAdapter("w1", created.id);

    const withoutHint = await service.execute({
      workspaceId: "w1",
      apiSlug: "weather",
      action: "current",
      payload: {},
      options: {}
    });
    assert.equal(withoutHint.meta.schema_hint, undefined);

    const withHint = await service.execute({
      workspaceId: "w1",
      apiSlug: "weather",
      action: "current",
      payload: {},
      options: { include_hint: true }
    });
    assert.equal(withHint.meta.schema_hint?.temp?.type, "number");
    assert.equal(withHint.meta.schema_hint?.temp?.unit, "Celsius");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
