import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp } from "../src/lib/ssrf.js";

test("private IP detection", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.1.2.3"), true);
  assert.equal(isPrivateIp("192.168.1.9"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
  assert.equal(isPrivateIp("::1"), true);
});
