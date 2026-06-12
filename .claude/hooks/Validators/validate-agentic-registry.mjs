#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..", "..");
const claudeDir = join(repoRoot, ".claude");
const agentsDir = join(claudeDir, "agents");
const skillsDir = join(claudeDir, "skills");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function rel(path) {
  return relative(repoRoot, path);
}

function frontmatterName(path) {
  const content = readFileSync(path, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const nameMatch = match[1].match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m);
  return nameMatch?.[1]?.trim() ?? null;
}

function markdownAgents() {
  return readdirSync(agentsDir)
    .filter(entry => entry.endsWith(".md"))
    .map(entry => ({
      key: entry.replace(/\.md$/, ""),
      path: join(agentsDir, entry),
    }));
}

function skillDirs() {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      key: entry.name,
      path: join(skillsDir, entry.name, "SKILL.md"),
    }))
    .filter(entry => {
      try {
        readFileSync(entry.path, "utf8");
        return true;
      } catch {
        return false;
      }
    });
}

function compareRegistry(kind, registryKeys, fileEntries, errors) {
  const fileKeys = new Set(fileEntries.map(entry => entry.key));
  const registry = new Set(registryKeys);

  for (const key of registry) {
    if (!fileKeys.has(key)) {
      errors.push(`${kind} registry entry has no matching file/folder: ${key}`);
    }
  }

  for (const entry of fileEntries) {
    if (!registry.has(entry.key)) {
      errors.push(`${kind} file/folder is missing from registry: ${entry.key}`);
    }

    const name = frontmatterName(entry.path);
    if (name !== entry.key) {
      errors.push(
        `${rel(entry.path)} frontmatter name "${name ?? "<missing>"}" must equal "${entry.key}"`
      );
    }
  }
}

function validateSettingsSkills(settingsPath, skillKeys, errors) {
  const settings = readJson(settingsPath);
  const allow = settings.permissions?.allow ?? [];

  for (const permission of allow) {
    const match = /^Skill\(([^)]+)\)$/.exec(permission);
    if (!match) continue;

    const skill = match[1];
    if (!skillKeys.has(skill)) {
      errors.push(`settings.json allows missing skill: Skill(${skill})`);
    }
  }
}

try {
  const errors = [];
  const agentRules = readJson(join(agentsDir, "agent-rules.json"));
  const skillRules = readJson(join(skillsDir, "skill-rules.json"));

  compareRegistry("agent", Object.keys(agentRules.agents ?? {}), markdownAgents(), errors);

  const skillEntries = skillDirs();
  compareRegistry("skill", Object.keys(skillRules.skills ?? {}), skillEntries, errors);

  validateSettingsSkills(
    join(claudeDir, "settings.json"),
    new Set(skillEntries.map(entry => entry.key)),
    errors
  );

  if (errors.length > 0) {
    const reason = `Agentic registry validation failed:\n${errors
      .map(error => `- ${error}`)
      .join("\n")}`;
    console.log(JSON.stringify({ result: "block", reason }));
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      result: "continue",
      message: "Agent and skill registries match filesystem entries.",
    })
  );
} catch (error) {
  console.log(
    JSON.stringify({
      result: "continue",
      message: `Agentic registry validation skipped: ${error.message}`,
    })
  );
}
