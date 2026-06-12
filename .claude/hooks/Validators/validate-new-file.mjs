#!/usr/bin/env node

/**
 * Generic validator that checks if a new file was created in a specified directory.
 *
 * Checks:
 * 1. Git status for untracked/new files matching the pattern
 * 2. File modification time within the specified age
 *
 * Exit codes:
 * - 0: Validation passed (new file found) or validation error (allow through)
 * - 1: Validation failed (no new file found)
 *
 * Usage:
 *   node validate-new-file.mjs --directory specs --extension .md
 *   node validate-new-file.mjs -d output -e .json --max-age 10
 */

import { execFileSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { isAbsolute, join, relative, resolve } from "path";
import { parseArgs } from "util";

const DEFAULT_DIRECTORY = ".claude/tasks";
const DEFAULT_EXTENSION = ".md";
const DEFAULT_MAX_AGE_MINUTES = 5;

const NO_FILE_ERROR = (pattern, directory) =>
  `VALIDATION FAILED: No new file found matching ${pattern}.\n\n` +
  `ACTION REQUIRED: Use the Write tool to create a new file in the ${directory}/ directory. ` +
  `The file must match the expected pattern (${pattern}). ` +
  `Do not stop until the file has been created.`;

function getProjectRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return resolve(process.env.CLAUDE_PROJECT_DIR);
  }

  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    return process.cwd();
  }
}

const PROJECT_ROOT = getProjectRoot();

function resolveDirectory(directory) {
  return isAbsolute(directory) ? directory : join(PROJECT_ROOT, directory);
}

function toGitPath(directory) {
  const absoluteDirectory = resolveDirectory(directory);
  const repoRelative = relative(PROJECT_ROOT, absoluteDirectory);
  if (repoRelative && !repoRelative.startsWith("..") && !isAbsolute(repoRelative)) {
    return repoRelative;
  }
  return absoluteDirectory;
}

function displayPath(filepath) {
  const repoRelative = relative(PROJECT_ROOT, filepath);
  if (repoRelative && !repoRelative.startsWith("..") && !isAbsolute(repoRelative)) {
    return repoRelative;
  }
  return filepath;
}

function getGitUntrackedFiles(directory, extension) {
  try {
    const gitPath = toGitPath(directory);
    const result = execFileSync(
      "git",
      ["-C", PROJECT_ROOT, "status", "--porcelain", "--", `${gitPath}/`],
      {
        encoding: "utf-8",
        timeout: 5000,
      }
    );

    const untracked = [];
    for (const line of result.trim().split("\n")) {
      if (!line) continue;
      const status = line.substring(0, 2);
      const filepath = line.substring(3).trim();

      if (["??", "A ", " A", "AM"].includes(status) && filepath.endsWith(extension)) {
        untracked.push(resolve(PROJECT_ROOT, filepath));
      }
    }
    return untracked;
  } catch {
    return [];
  }
}

function getRecentFiles(directory, extension, maxAgeMinutes) {
  try {
    const absoluteDirectory = resolveDirectory(directory);
    const files = readdirSync(absoluteDirectory);
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    const ext = extension.startsWith(".") ? extension : `.${extension}`;

    return files
      .filter(f => f.endsWith(ext))
      .map(f => join(absoluteDirectory, f))
      .filter(filepath => {
        try {
          const mtime = statSync(filepath).mtimeMs;
          return now - mtime <= maxAgeMs;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function validateNewFile(directory, extension, maxAgeMinutes) {
  const absoluteDirectory = resolveDirectory(directory);
  const directoryDisplay = displayPath(absoluteDirectory);
  const pattern = `${directoryDisplay}/*${extension}`;

  const gitNew = getGitUntrackedFiles(directory, extension);
  if (gitNew.length > 0) {
    return { success: true, message: `New file(s) found: ${gitNew.map(displayPath).join(", ")}` };
  }

  const recentFiles = getRecentFiles(directory, extension, maxAgeMinutes);
  if (recentFiles.length > 0) {
    return {
      success: true,
      message: `Recently created file(s) found: ${recentFiles.map(displayPath).join(", ")}`,
    };
  }

  return { success: false, message: NO_FILE_ERROR(pattern, directoryDisplay) };
}

try {
  // Read stdin (hook input) - consume it but we don't need it
  let stdin = "";
  if (!process.stdin.isTTY) {
    const chunks = [];
    process.stdin.setEncoding("utf-8");
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    stdin = chunks.join("");
  }

  const { values } = parseArgs({
    options: {
      directory: { type: "string", short: "d", default: DEFAULT_DIRECTORY },
      extension: { type: "string", short: "e", default: DEFAULT_EXTENSION },
      "max-age": { type: "string", default: String(DEFAULT_MAX_AGE_MINUTES) },
    },
    strict: false,
  });

  const directory = values.directory || DEFAULT_DIRECTORY;
  const extension = values.extension || DEFAULT_EXTENSION;
  const maxAge = parseInt(values["max-age"] || String(DEFAULT_MAX_AGE_MINUTES), 10);

  const { success, message } = validateNewFile(directory, extension, maxAge);

  if (success) {
    console.log(JSON.stringify({ result: "continue", message }));
    process.exit(0);
  } else {
    console.log(JSON.stringify({ result: "block", reason: message }));
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
