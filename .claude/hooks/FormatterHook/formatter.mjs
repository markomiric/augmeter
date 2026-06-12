#!/usr/bin/env node
/**
 * ClaudeFast Formatter Hook (PostToolUse)
 *
 * Runs after Write or Edit tool completes.
 *
 * What it does:
 * 1. Detects the file type from the tool input
 * 2. Runs Prettier on supported file types
 * 3. Optionally runs ESLint --fix for JS/TS files
 *
 * Supported file types: .js, .ts, .jsx, .tsx, .json, .md, .mdx, .css, .scss, .html
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// File extensions that Prettier can format
const PRETTIER_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".vue",
  ".svelte",
  ".yaml",
  ".yml",
];

// File extensions for ESLint
const ESLINT_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];

function log(message) {
  const logDir = join(__dirname, "logs");
  mkdirSync(logDir, { recursive: true });

  const logFile = join(logDir, "formatter.log");
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  try {
    const existing = existsSync(logFile) ? readFileSync(logFile, "utf-8") : "";
    // Keep log file from growing too large (last 1000 lines)
    const lines = existing.split("\n").slice(-1000);
    writeFileSync(logFile, lines.join("\n") + logLine);
  } catch (err) {
    // Fail silently
  }
}

function runPrettier(filePath) {
  try {
    execSync(`npx prettier --write "${filePath}"`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function runEslint(filePath) {
  try {
    execSync(`npx eslint --fix "${filePath}"`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });
    return { success: true };
  } catch (err) {
    // ESLint returns non-zero for unfixable errors, which is fine
    return { success: true, hadWarnings: true };
  }
}

async function main() {
  try {
    // Read input from stdin
    const input = readFileSync(0, "utf-8");
    const data = JSON.parse(input);

    const toolName = data.tool_name || "";
    const toolInput = data.tool_input || {};

    // Only process Write and Edit tools
    if (toolName !== "Write" && toolName !== "Edit") {
      process.exit(0);
    }

    const filePath = toolInput.file_path || "";
    if (!filePath) {
      process.exit(0);
    }

    const ext = extname(filePath).toLowerCase();

    // Check if file type is supported
    if (!PRETTIER_EXTENSIONS.includes(ext)) {
      log(`Skipping unsupported file type: ${ext}`);
      process.exit(0);
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      log(`File not found: ${filePath}`);
      process.exit(0);
    }

    log(`Formatting: ${filePath}`);

    // Run Prettier
    const prettierResult = runPrettier(filePath);
    if (prettierResult.success) {
      log(`Prettier: success`);
    } else {
      log(`Prettier: failed - ${prettierResult.error}`);
    }

    // Run ESLint for JS/TS files (optional, comment out if not wanted)
    // if (ESLINT_EXTENSIONS.includes(ext)) {
    //     const eslintResult = runEslint(filePath);
    //     if (eslintResult.success) {
    //         log(`ESLint: success`);
    //     }
    // }

    // Exit successfully - formatting is silent to Claude
    process.exit(0);
  } catch (err) {
    log(`Error: ${err.message}`);
    // Exit gracefully - don't break the workflow
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Uncaught error:", err);
  process.exit(0);
});
