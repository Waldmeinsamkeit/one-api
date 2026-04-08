import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { InMemoryRepositories } from "../src/domain/repositories.js";
import { ModelRegistry } from "../src/domain/modelRegistry.js";

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

test("dry run executes without persisting secrets or execution", async () => {
  process.env.ALLOW_PRIVATE_UPSTREAM = "true";
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
    assert.equal(repos.executions.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
