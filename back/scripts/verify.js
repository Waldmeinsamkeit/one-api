import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { evaluateExpression } from "../src/lib/expression.js";
import { encryptSecret, decryptSecret } from "../src/lib/cryptoVault.js";
import { validateAdapterSchema } from "../src/domain/adapterSchema.js";
import { isPrivateIp } from "../src/lib/ssrf.js";

async function run() {
  const context = { payload: { units: "celsius", city: "Paris" }, secrets: {}, meta: {} };
  assert.equal(evaluateExpression("if(eq(payload.units,'celsius'),'C','F')", context), "C");

  const key = crypto.createHash("sha256").update("abc").digest();
  const encrypted = encryptSecret("secret", key);
  assert.equal(decryptSecret(encrypted, key), "secret");

  validateAdapterSchema({
    api_slug: "weather",
    action: "get",
    adapter_schema_version: "1.0",
    target: { url: "https://example.com", method: "GET", headers: {} },
    response_mapping: { data: "$" }
  });

  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);

  process.env.ALLOW_PRIVATE_UPSTREAM = "true";
  const { InMemoryRepositories } = await import("../src/domain/repositories.js");
  const { ModelRegistry } = await import("../src/domain/modelRegistry.js");
  const { PlatformService } = await import("../src/domain/platformService.js");

  const upstream = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ weather: { temp: 20 } }));
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const addr = upstream.address();
    const repos = new InMemoryRepositories();
    const service = new PlatformService({ repositories: repos, modelRegistry: new ModelRegistry() });
    const result = await service.dryRun({
      workspaceId: "w1",
      adapter: {
        api_slug: "weather",
        action: "now",
        adapter_schema_version: "1.0",
        target: {
          url: `http://127.0.0.1:${addr.port}/`,
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
      },
      payload: {},
      tempSecrets: { api_key: "tmp" }
    });
    assert.equal(result.success, true);
    assert.equal(repos.executions.length, 1);
    assert.equal(repos.executions[0].dry_run, true);
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("verify ok");
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  });
