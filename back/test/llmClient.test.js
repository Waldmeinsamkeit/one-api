import test from "node:test";
import assert from "node:assert/strict";
import { resolveProviderApiKey } from "../src/domain/llmClient.js";

test("resolveProviderApiKey prefers workspace secret key over env", () => {
  const key = resolveProviderApiKey({
    provider: "openai",
    resolveApiKey: () => "secret-openai",
    envApiKey: "env-openai"
  });
  assert.equal(key, "secret-openai");
});

test("resolveProviderApiKey falls back to env key", () => {
  const key = resolveProviderApiKey({
    provider: "deepseek",
    resolveApiKey: () => "",
    envApiKey: "env-deepseek"
  });
  assert.equal(key, "env-deepseek");
});
