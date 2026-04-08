import crypto from "node:crypto";

function toKeyBuffer(value) {
  if (!value) {
    return crypto.createHash("sha256").update("dev-master-key").digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  return crypto.createHash("sha256").update(value).digest();
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  platformToken: process.env.PLATFORM_TOKEN ?? "dev-token",
  masterKey: toKeyBuffer(process.env.MASTER_KEY),
  traceRetentionDays: Number.parseInt(process.env.TRACE_RETENTION_DAYS ?? "7", 10),
  defaultWorkspaceId: process.env.DEFAULT_WORKSPACE_ID ?? "default",
  requestTimeoutMs: Number.parseInt(process.env.REQUEST_TIMEOUT_MS ?? "8000", 10),
  maxRedirects: Number.parseInt(process.env.MAX_REDIRECTS ?? "3", 10),
  allowPrivateUpstream: process.env.ALLOW_PRIVATE_UPSTREAM === "true",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  geminiBaseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1"
};
