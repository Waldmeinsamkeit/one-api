import test from "node:test";
import assert from "node:assert/strict";
import { executeHttpRequest } from "../src/lib/httpExecutor.js";

test("network failures include request context", async () => {
  await assert.rejects(
    () =>
      executeHttpRequest({
        method: "GET",
        url: "https://nonexistent.invalid/example",
        headers: {},
        body: null,
        timeoutMs: 1000,
        maxRedirects: 0,
        retryAttempts: 0,
        allowPrivateIp: false
      }),
    (error) => {
      assert.match(error.message, /Upstream (DNS lookup failed|fetch failed)/);
      assert.match(error.message, /GET https:\/\/nonexistent\.invalid\/example/);
      return true;
    }
  );
});

test("network access denied reports EACCES clearly", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const err = new TypeError("fetch failed");
    err.cause = { code: "EACCES", message: "connect EACCES 146.190.198.121:443" };
    throw err;
  };
  try {
    await assert.rejects(
      () =>
        executeHttpRequest({
          method: "GET",
          url: "https://example.com/blocked",
          headers: {},
          body: null,
          timeoutMs: 1000,
          maxRedirects: 0,
          retryAttempts: 0,
          allowPrivateIp: true
        }),
      (error) => {
        assert.match(error.message, /Upstream network access denied \(EACCES\)/);
        assert.match(error.message, /GET https:\/\/example\.com\/blocked/);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
