#!/usr/bin/env node

/**
 * PostToolUse hook that runs Biome (fast JS/TS linter and formatter) after
 * Write or Edit operations on supported file types.
 *
 * Hook Type: PostToolUse
 * Trigger: After Write or Edit tool calls
 *
 * Behavior:
 * 1. Reads hook input from stdin (JSON with tool_name, tool_input, tool_result)
 * 2. Extracts file_path from tool_input
 * 3. Checks if file extension is supported by Biome (.js, .jsx, .ts, .tsx, .json, .css)
 * 4. Runs `npx @biomejs/biome check --write` to auto-fix lint/format issues
 * 5. Reports unfixable errors as blocking failures
 *
 * Exit codes:
 * - 0: Validation passed (Biome check succeeded, file skipped, or Biome unavailable)
 * - 1: Validation failed (Biome found unfixable errors)
 *
 * Usage:
 *   echo '{"tool_name":"Write","tool_input":{"file_path":"src/index.ts"}}' | node biome-validator.mjs
 */

import { execSync } from "child_process";
import { extname } from "path";

const SUPPORTED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".json", ".css"]);
const BIOME_TIMEOUT_MS = 10_000;

function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }

    const chunks = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", chunk => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", () => resolve(""));
  });
}

function runBiomeCheck(filePath) {
  try {
    execSync(`npx @biomejs/biome check --write "${filePath}"`, {
      encoding: "utf-8",
      timeout: BIOME_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (error) {
    // Check if biome is not installed or npx failed to find it
    const stderr = error.stderr || "";
    const stdout = error.stdout || "";

    if (
      stderr.includes("not found") ||
      stderr.includes("ERR_MODULE_NOT_FOUND") ||
      stderr.includes("Cannot find package") ||
      stderr.includes("command not found") ||
      stderr.includes("is not recognized")
    ) {
      return { success: true, notInstalled: true };
    }

    // Biome ran but found unfixable errors
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { success: false, output };
  }
}

try {
  const stdinData = await readStdin();

  if (!stdinData) {
    console.log(JSON.stringify({ result: "continue" }));
    process.exit(0);
  }

  const hookInput = JSON.parse(stdinData);
  const toolName = hookInput.tool_name;

  // Only run for Write and Edit tools
  if (toolName !== "Write" && toolName !== "Edit") {
    console.log(JSON.stringify({ result: "continue" }));
    process.exit(0);
  }

  const filePath = hookInput.tool_input?.file_path;

  if (!filePath) {
    console.log(JSON.stringify({ result: "continue" }));
    process.exit(0);
  }

  // Check if the file extension is supported by Biome
  const ext = extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    console.log(JSON.stringify({ result: "continue" }));
    process.exit(0);
  }

  const { success, notInstalled, output } = runBiomeCheck(filePath);

  if (notInstalled) {
    console.log(
      JSON.stringify({
        result: "continue",
        message: "Biome not available, skipping validation",
      })
    );
    process.exit(0);
  }

  if (success) {
    console.log(
      JSON.stringify({
        result: "continue",
        message: `Biome check passed for ${filePath}`,
      })
    );
    process.exit(0);
  } else {
    console.log(
      JSON.stringify({
        result: "block",
        reason: `Biome check failed: ${output}`,
      })
    );
    process.exit(1);
  }
} catch (e) {
  console.log(
    JSON.stringify({
      result: "continue",
      message: `Validation error (allowing through): ${e.message}`,
    })
  );
  process.exit(0);
}
