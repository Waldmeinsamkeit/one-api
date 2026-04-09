import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepositories } from "../src/domain/repositories.js";
import { ModelRegistry } from "../src/domain/modelRegistry.js";
import { PlatformService } from "../src/domain/platformService.js";

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
