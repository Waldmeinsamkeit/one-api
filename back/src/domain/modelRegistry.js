import crypto from "node:crypto";
import { config } from "../config.js";

export class ModelRegistry {
  constructor() {
    this.profiles = new Map();
    this.activeByWorkspace = new Map();
    this.seedDefaults();
  }

  seedDefaults() {
    const defaults = [
      {
        provider: "openai",
        model: "gpt-4o-mini",
        system_prompt: "",
        schema_id: "adapter-schema-v1",
        status: "active"
      },
      {
        provider: "google",
        model: "gemini-1.5-flash",
        system_prompt: "",
        schema_id: "adapter-schema-v1",
        status: "standby"
      },
      {
        provider: "deepseek",
        model: "deepseek-chat",
        system_prompt: "",
        schema_id: "adapter-schema-v1",
        status: "standby"
      }
    ];
    for (const item of defaults) {
      const id = crypto.randomUUID();
      this.profiles.set(id, { id, ...item });
      if (item.status === "active") {
        this.activeByWorkspace.set("default", id);
      }
    }
  }

  getActive(workspaceId) {
    const id = this.activeByWorkspace.get(workspaceId) ?? this.activeByWorkspace.get("default");
    return this.profiles.get(id);
  }

  list() {
    return [...this.profiles.values()].map((item) => ({
      ...item,
      api_key_configured: this.isApiKeyConfigured(item.provider)
    }));
  }

  isApiKeyConfigured(provider) {
    if (provider === "openai") {
      return Boolean(config.openaiApiKey);
    }
    if (provider === "google") {
      return Boolean(config.geminiApiKey);
    }
    if (provider === "deepseek") {
      return Boolean(config.deepseekApiKey);
    }
    return false;
  }

  setActive(workspaceId, modelProfileId) {
    if (!this.profiles.has(modelProfileId)) {
      throw new Error("Model profile not found");
    }
    this.activeByWorkspace.set(workspaceId, modelProfileId);
    return this.profiles.get(modelProfileId);
  }

  updateSystemPrompt(modelProfileId, systemPrompt) {
    const profile = this.profiles.get(modelProfileId);
    if (!profile) {
      throw new Error("Model profile not found");
    }
    profile.system_prompt = String(systemPrompt ?? "").trim();
    return profile;
  }
}
