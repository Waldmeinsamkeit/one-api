import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepositories } from "../src/domain/repositories.js";
import { ModelRegistry } from "../src/domain/modelRegistry.js";
import { PlatformService } from "../src/domain/platformService.js";
import { config } from "../src/config.js";

test("publish validates adapter schema before activation", () => {
  const repositories = new InMemoryRepositories();
  const service = new PlatformService({ repositories, modelRegistry: new ModelRegistry() });
  const bad = repositories.createAdapter({
    workspace_id: "default",
    api_slug: "demo_api",
    action: "execute_demo",
    adapter_schema_version: "1.0",
    logic_version: 1,
    spec: {
      api_slug: "demo_api",
      action: "execute_demo",
      adapter_schema_version: "1.0",
      target: {
        url: "https://example.com",
        method: "GET",
        headers: { Accept: "application/json" }
      },
      response_mapping: {
        success: "if(eq($.status, 200), true, false)"
      }
    }
  });
  assert.throws(
    () => service.publishAdapter({ workspaceId: "default", adapterId: bad.id }),
    /Use JSONPath only/
  );
});

test("model api_key_configured is workspace-scoped with env fallback", () => {
  const originalOpenai = config.openaiApiKey;
  const originalGemini = config.geminiApiKey;
  const originalDeepseek = config.deepseekApiKey;
  try {
    config.openaiApiKey = "";
    config.geminiApiKey = "";
    config.deepseekApiKey = "";

    const repositories = new InMemoryRepositories();
    const service = new PlatformService({ repositories, modelRegistry: new ModelRegistry() });

    const before = service.listModelProfiles("ws-a");
    assert.equal(before.some((item) => item.provider === "openai" && item.api_key_configured), false);

    service.saveSecret({
      workspaceId: "ws-a",
      name: "openai_api_key",
      value: "sk-test-openai"
    });

    const wsA = service.listModelProfiles("ws-a");
    const wsB = service.listModelProfiles("ws-b");
    assert.equal(wsA.some((item) => item.provider === "openai" && item.api_key_configured), true);
    assert.equal(wsB.some((item) => item.provider === "openai" && item.api_key_configured), false);
  } finally {
    config.openaiApiKey = originalOpenai;
    config.geminiApiKey = originalGemini;
    config.deepseekApiKey = originalDeepseek;
  }
});
