import { config } from "../config.js";

function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new Error("LLM returned empty text");
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1]);
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error("Unable to parse JSON from model output");
}

async function callOpenAI({ model, systemPrompt, userPrompt }) {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail}`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return extractJson(text);
}

async function callDeepSeek({ model, systemPrompt, userPrompt }) {
  if (!config.deepseekApiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  const response = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.deepseekApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${detail}`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return extractJson(text);
}

async function callGemini({ model, systemPrompt, userPrompt }) {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const url = `${config.geminiBaseUrl}/models/${model}:generateContent?key=${config.geminiApiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      },
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }]
        }
      ]
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${detail}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return extractJson(text);
}

export async function generateAdapterByLlm({ profile, systemPrompt, userPrompt }) {
  if (!profile) {
    throw new Error("No model profile available");
  }
  if (profile.provider === "openai") {
    return callOpenAI({ model: profile.model, systemPrompt, userPrompt });
  }
  if (profile.provider === "google") {
    return callGemini({ model: profile.model, systemPrompt, userPrompt });
  }
  if (profile.provider === "deepseek") {
    return callDeepSeek({ model: profile.model, systemPrompt, userPrompt });
  }
  throw new Error(`Unsupported model provider: ${profile.provider}`);
}
