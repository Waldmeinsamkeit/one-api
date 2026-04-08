import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret } from "../src/lib/cryptoVault.js";

test("encrypt/decrypt secret", () => {
  const key = crypto.createHash("sha256").update("abc").digest();
  const input = "super-secret";
  const encrypted = encryptSecret(input, key);
  const plain = decryptSecret(encrypted, key);
  assert.equal(plain, input);
});
