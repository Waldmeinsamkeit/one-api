import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const FALLBACK_LIBRARY = {
  version: "1.0",
  skills: []
};

function loadSkillLibrary() {
  if (!config.enableSkillLibrary) {
    return FALLBACK_LIBRARY;
  }
  const filePath = path.resolve(process.cwd(), config.skillLibraryPath);
  if (!fs.existsSync(filePath)) {
    return FALLBACK_LIBRARY;
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.skills)) {
      return FALLBACK_LIBRARY;
    }
    return parsed;
  } catch {
    return FALLBACK_LIBRARY;
  }
}

export function getEnabledSkills() {
  const library = loadSkillLibrary();
  return library.skills.filter((skill) => skill.enabled);
}

export function buildSkillPromptInstructions() {
  const skills = getEnabledSkills();
  if (!skills.length) {
    return "";
  }
  const lines = skills.map((skill, index) => {
    return `${index + 1}. ${skill.name} (${skill.id})\nPurpose: ${skill.purpose}\nInstruction: ${skill.instruction}`;
  });
  return `Enabled Skill Library:\n${lines.join("\n")}`;
}
