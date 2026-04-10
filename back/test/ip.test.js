import test from "node:test";
import assert from "node:assert/strict";
import { isLocalhostIp } from "../src/lib/ip.js";

test("isLocalhostIp supports ipv4/ipv6 localhost", () => {
  assert.equal(isLocalhostIp("127.0.0.1"), true);
  assert.equal(isLocalhostIp("::1"), true);
  assert.equal(isLocalhostIp("::ffff:127.0.0.1"), true);
  assert.equal(isLocalhostIp("192.168.1.10"), false);
  assert.equal(isLocalhostIp("8.8.8.8"), false);
});
