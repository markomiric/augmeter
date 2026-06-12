#!/usr/bin/env node
/**
 * ClaudeFast Backup Compactor
 *
 * Summarizes old backup entries (>14 days) into consolidated summary files.
 * Uses Claude CLI in print mode (`claude -p`) for text-only summarization.
 * Runs as a detached background process, spawned by backup-core.mjs.
 *
 * Each summary file contains paragraph-length summaries per session,
 * preserving session IDs for `claude --resume <session-id>` access.
 *
 * Originals are deleted after summarization. Session IDs are preserved
 * in summaries so full context is always accessible via `claude --resume`.
 *
 * Usage: node backup-compactor.mjs
 * Env: CLAUDE_INVOKED_BY=backup_compactor (set automatically to prevent hook recursion)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { homedir } from "os";
import { log } from "./backup-core.mjs";

// Recursion prevention: set BEFORE any Claude invocation so hooks skip
process.env.CLAUDE_INVOKED_BY = "backup_compactor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const STALE_THRESHOLD_DAYS = 14;
const BATCH_SIZE = 7;
const MAX_BATCHES_PER_RUN = 5;
const MAX_CONTENT_PER_BACKUP = 4000; // chars per backup sent to Claude
const DELAY_BETWEEN_BATCHES_MS = 5000;
// Global compactor lock: only one compactor runs at a time across all projects.
// Each compactor invocation calls `claude -p` (expensive), and per-project
// compactors operate on different backup dirs anyway -- nothing to gain from
// parallelism, and serialization caps API cost.
const COMPACTOR_LOCK_PATH = join(homedir(), ".claude", "claudefast-compactor.lock");

// ============================================================================
// PATH HELPERS
// ============================================================================

function getProjectDir() {
  return join(__dirname, "..", "..", "..");
}

function getBackupDir() {
  return join(getProjectDir(), ".claude", "backups");
}

function getArchiveDir() {
  const dir = join(getBackupDir(), "archived");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function deleteOriginals(backupDir, files) {
  for (const f of files) {
    try {
      unlinkSync(join(backupDir, f));
    } catch (err) {
      log(`Failed to delete ${f}: ${err.message}`);
    }
  }
}

// ============================================================================
// FILENAME PARSING
// ============================================================================

const MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function parseDateFromFilename(filename) {
  // Format: {num}-backup-{day}{ordinal}-{Mon}-{Year}-{hour}-{min}{ampm}.md
  const match = filename.match(/\d+-backup-(\d+)\w+-(\w+)-(\d+)-(\d+)-(\d+)(am|pm)\.md/);
  if (!match) return null;

  const [, day, monthStr, year, hour, min, ampm] = match;
  const month = MONTHS[monthStr];
  if (month === undefined) return null;

  let h = parseInt(hour);
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;

  return new Date(parseInt(year), month, parseInt(day), h, parseInt(min));
}

function getBackupNumber(filename) {
  const match = filename.match(/^(\d+)-/);
  return match ? parseInt(match[1]) : 0;
}

// ============================================================================
// CONTENT PROCESSING
// ============================================================================

function trimBackupContent(content) {
  const lines = content.split("\n");
  const trimmed = [];
  let inClaudeResponses = false;
  let responseCount = 0;

  for (const line of lines) {
    if (line.startsWith("## Claude's Key Responses")) {
      inClaudeResponses = true;
      trimmed.push(line);
      continue;
    }
    if (line.startsWith("## ") && inClaudeResponses) {
      inClaudeResponses = false;
    }

    if (inClaudeResponses) {
      if (line.startsWith("- ")) {
        responseCount++;
        if (responseCount <= 3) {
          trimmed.push(line.slice(0, 200) + (line.length > 200 ? "..." : ""));
        }
      }
      continue;
    }

    trimmed.push(line);
  }

  const result = trimmed.join("\n");
  return result.slice(0, MAX_CONTENT_PER_BACKUP);
}

function extractSessionId(content) {
  const match = content.match(/\*\*Session ID:\*\*\s*(\S+)/);
  return match ? match[1] : "unknown";
}

function extractSessionDates(content) {
  const start = content.match(/\*\*Session Start:\*\*\s*(.+)/);
  const end = content.match(/\*\*Session End:\*\*\s*(.+)/);
  return {
    start: start ? start[1].trim() : null,
    end: end ? end[1].trim() : null,
  };
}

// ============================================================================
// SUMMARIZATION
// ============================================================================

function buildPrompt(batchFiles, batchContents) {
  let prompt = `You are summarizing Claude Code session backups for long-term archival. For each session below, write a substantive paragraph (4-6 sentences) that captures:
- What the user was working on and why
- Key actions taken, files changed, or decisions made
- The outcome or state when the session ended
- Any notable patterns, tools used, or agents dispatched

Format your response as a series of markdown sections. Each section MUST use this exact heading format:
## Backup #N -- Session: <full-session-id>

Where N is the backup number and the session ID is copied exactly from the data below.

Write flowing paragraphs under each heading. Be specific and concrete, not vague. Do not use bullet points.

Here are the ${batchFiles.length} session backups to summarize:\n\n`;

  for (let i = 0; i < batchFiles.length; i++) {
    const num = getBackupNumber(batchFiles[i]);
    const sessionId = extractSessionId(batchContents[i]);
    const dates = extractSessionDates(batchContents[i]);
    const trimmed = trimBackupContent(batchContents[i]);

    prompt += `=== Backup #${num} | Session: ${sessionId} | Start: ${dates.start || "unknown"} | End: ${dates.end || "unknown"} ===\n`;
    prompt += trimmed;
    prompt += "\n\n";
  }

  return prompt;
}

function callClaude(prompt) {
  log(`Calling Claude CLI for summarization (prompt length: ${prompt.length} chars)...`);

  const result = spawnSync("claude", ["-p", "--model", "claude-sonnet-4-6"], {
    input: prompt,
    encoding: "utf-8",
    timeout: 180000, // 3 minutes
    env: { ...process.env, CLAUDE_INVOKED_BY: "backup_compactor" },
    cwd: getProjectDir(),
    windowsHide: true,
  });

  if (result.error) {
    log(`CLI error: ${result.error.message}`);
    return null;
  }

  if (result.status !== 0) {
    log(`CLI exited with status ${result.status}: ${(result.stderr || "").slice(0, 300)}`);
    return null;
  }

  return (result.stdout || "").trim() || null;
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function formatSummaryFile(batchFiles, batchContents, summaryText) {
  const firstNum = getBackupNumber(batchFiles[0]);
  const lastNum = getBackupNumber(batchFiles[batchFiles.length - 1]);
  const firstDate = parseDateFromFilename(batchFiles[0]);
  const lastDate = parseDateFromFilename(batchFiles[batchFiles.length - 1]);

  const dateRange =
    firstDate && lastDate
      ? `${firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : "unknown range";

  // Build session index table
  let sessionTable = "| # | Session ID | Date | Resume Command |\n";
  sessionTable += "|---|-----------|------|----------------|\n";
  for (let i = 0; i < batchFiles.length; i++) {
    const num = getBackupNumber(batchFiles[i]);
    const sessionId = extractSessionId(batchContents[i]);
    const date = parseDateFromFilename(batchFiles[i]);
    const dateStr = date
      ? date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "unknown";
    sessionTable += `| ${num} | ${sessionId} | ${dateStr} | \`claude --resume ${sessionId}\` |\n`;
  }

  let output = `# Session Summary (Backups #${firstNum}-${lastNum})\n\n`;
  output += `**Date Range:** ${dateRange}\n`;
  output += `**Sessions Compacted:** ${batchFiles.length}\n`;
  output += `**Generated:** ${new Date().toISOString()}\n\n`;
  output += `## Session Index\n\n`;
  output += sessionTable;
  output += `\n---\n\n`;
  output += summaryText;
  output += "\n";

  return output;
}

// ============================================================================
// LOCK MANAGEMENT
// ============================================================================

function acquireLock() {
  try {
    if (existsSync(COMPACTOR_LOCK_PATH)) {
      const lockAge = Date.now() - new Date(readFileSync(COMPACTOR_LOCK_PATH, "utf-8")).getTime();
      if (lockAge < 600000) {
        // 10 minutes
        log(`Compactor already running (lock ${Math.round(lockAge / 1000)}s old), exiting`);
        return false;
      }
    }
    writeFileSync(COMPACTOR_LOCK_PATH, new Date().toISOString());
    return true;
  } catch (err) {
    log(`Lock acquisition failed: ${err.message}`);
    return false;
  }
}

function releaseLock() {
  try {
    if (existsSync(COMPACTOR_LOCK_PATH)) {
      unlinkSync(COMPACTOR_LOCK_PATH);
    }
  } catch {
    // Ignore
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  log("Backup compactor started");

  if (!acquireLock()) return;

  try {
    const backupDir = getBackupDir();

    if (!existsSync(backupDir)) {
      log("No backup directory found");
      return;
    }

    // Get all individual backup files (skip summaries and non-backup files)
    const allFiles = readdirSync(backupDir)
      .filter(f => f.endsWith(".md") && /^\d+-backup-/.test(f))
      .sort((a, b) => getBackupNumber(a) - getBackupNumber(b));

    // Filter to files older than threshold
    const now = new Date();
    const threshold = new Date(now.getTime() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    const staleFiles = allFiles.filter(f => {
      const date = parseDateFromFilename(f);
      return date && date < threshold;
    });

    if (staleFiles.length < BATCH_SIZE) {
      log(
        `Only ${staleFiles.length} stale backups (need ${BATCH_SIZE} for a full batch), skipping`
      );
      return;
    }

    log(`Found ${staleFiles.length} stale backups (older than ${STALE_THRESHOLD_DAYS} days)`);

    // Group into full batches only (drop partial remainder)
    const batches = [];
    for (let i = 0; i + BATCH_SIZE <= staleFiles.length; i += BATCH_SIZE) {
      batches.push(staleFiles.slice(i, i + BATCH_SIZE));
    }

    const batchesToProcess = batches.slice(0, MAX_BATCHES_PER_RUN);
    log(`Processing ${batchesToProcess.length} of ${batches.length} batches this run`);

    let processedCount = 0;

    for (let b = 0; b < batchesToProcess.length; b++) {
      const batch = batchesToProcess[b];
      log(
        `Batch ${b + 1}/${batchesToProcess.length}: ${batch.length} files (#${getBackupNumber(batch[0])}-${getBackupNumber(batch[batch.length - 1])})`
      );

      // Read all files in batch
      const contents = batch.map(f => {
        try {
          return readFileSync(join(backupDir, f), "utf-8");
        } catch {
          return "";
        }
      });

      // Build prompt and get summary
      const prompt = buildPrompt(batch, contents);
      const summary = callClaude(prompt);

      if (!summary) {
        log(`Batch ${b + 1} summarization failed, skipping`);
        continue;
      }

      // Write summary to archived/ folder
      const archiveDir = getArchiveDir();
      const firstNum = getBackupNumber(batch[0]);
      const lastNum = getBackupNumber(batch[batch.length - 1]);
      const summaryContent = formatSummaryFile(batch, contents, summary);
      const summaryFilename = `summary-${firstNum}-to-${lastNum}.md`;
      const summaryPath = join(archiveDir, summaryFilename);

      writeFileSync(summaryPath, summaryContent);
      log(`Summary written: archived/${summaryFilename}`);

      // Delete originals (session IDs preserved in summary for --resume access)
      deleteOriginals(backupDir, batch);

      processedCount += batch.length;

      // Delay between batches
      if (b < batchesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    log(`Compaction complete: ${processedCount} backups -> ${batchesToProcess.length} summaries`);
    if (batches.length > MAX_BATCHES_PER_RUN) {
      log(`${batches.length - MAX_BATCHES_PER_RUN} batches remaining for next run`);
    }
  } finally {
    releaseLock();
  }
}

main().catch(err => {
  log(`Compactor error: ${err.message}`);
  releaseLock();
  process.exit(0);
});
