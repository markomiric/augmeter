#!/usr/bin/env node
/**
 * ClaudeFast Backup Core Module
 *
 * Shared backup logic used by:
 * - statusline-monitor.mjs (threshold-based backups)
 * - conv-backup.mjs (PreCompact backups)
 *
 * Responsibilities:
 * - Parse transcript JSONL to extract session data
 * - Format session summary as markdown
 * - Save backup with numbered filename
 * - Update shared state file with current backup path
 *
 * Backup filename format: {number}-backup-{date}.md
 * Example: 3-backup-26th-Jan-2026-4-30pm.md
 *
 * State file: <project>/.claude/.claudefast-state-<sessionId>.json
 * (per-project, per-session to prevent cross-session/cross-project contamination)
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root: parent of .claude/hooks/ContextRecoveryHook
const PROJECT_DIR = join(__dirname, "..", "..", "..");

// Per-project, per-session state and lock files. Live alongside the backup
// markdown files under .claude/backups/ so all hook artifacts are colocated.
// Dotfile prefix keeps them out of the visible backup list.
// Previously these lived under ~/.claude/ which caused cross-project sessions
// to stomp each other's state (resetting lastBackupAtTokens to 0 -> duplicate
// `_first` triggers) and made the status line render paths from other projects.
function getStateDir() {
  return join(PROJECT_DIR, ".claude", "backups");
}

function getLockPath(sessionId) {
  const safe = (sessionId || "unknown").replace(/[^a-zA-Z0-9-]/g, "_");
  return join(getStateDir(), `.claudefast-backup-${safe}.lock`);
}

const BACKUP_MIN_INTERVAL_MS = 30000; // 30 seconds
const STATE_FILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Atomic write: write to a uniquely-named tmp file then rename. Rename is
// atomic on the same volume on POSIX and Windows, so a concurrent reader
// either sees the old contents or the new contents -- never a partial write.
// Tmp name carries pid+time+random so concurrent calls never share a path,
// and we unlink on rename failure to avoid leaking orphans on Windows where
// a brief source-handle lock can fail the rename.
function atomicWriteFileSync(targetPath, data) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const tmp = `${targetPath}.tmp.${suffix}`;
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, targetPath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

// Sweep stale per-session state and lock files older than STATE_FILE_TTL_MS.
// Skips the current session's files. Runs at most once per process via a
// module-level guard so it isn't repeated across statusline ticks.
let cleanupRanThisProcess = false;
function cleanupStaleStateFiles(currentSessionId) {
  if (cleanupRanThisProcess) return;
  cleanupRanThisProcess = true;
  try {
    const dir = getStateDir();
    if (!existsSync(dir)) return;
    const now = Date.now();
    const safeCurrent = (currentSessionId || "unknown").replace(/[^a-zA-Z0-9-]/g, "_");
    for (const name of readdirSync(dir)) {
      const isState = name.startsWith(".claudefast-state-") && name.endsWith(".json");
      const isLock = name.startsWith(".claudefast-backup-") && name.endsWith(".lock");
      if (!isState && !isLock) continue;
      // Never delete files for the active session.
      if (name.includes(safeCurrent)) continue;
      const fullPath = join(dir, name);
      try {
        const age = now - statSync(fullPath).mtimeMs;
        if (age > STATE_FILE_TTL_MS) unlinkSync(fullPath);
      } catch {
        /* per-file failures ignored */
      }
    }
  } catch {
    /* ignore */
  }
}

// ============================================================================
// LOGGING
// ============================================================================

export function log(message) {
  const logDir = join(__dirname, "logs");
  mkdirSync(logDir, { recursive: true });

  const logFile = join(logDir, "backup-core.log");
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  try {
    const existing = existsSync(logFile) ? readFileSync(logFile, "utf-8") : "";
    const lines = existing
      .split("\n")
      .filter(l => l)
      .slice(-99);
    lines.push(logLine.trim());
    writeFileSync(logFile, lines.join("\n") + "\n");
  } catch (err) {
    // Fail silently
  }
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

export function getStatePath(sessionId) {
  // Per-project, per-session state file. Sanitize sessionId for filesystem.
  const safe = (sessionId || "unknown").replace(/[^a-zA-Z0-9-]/g, "_");
  return join(getStateDir(), `.claudefast-state-${safe}.json`);
}

export function readState(sessionId) {
  try {
    const statePath = getStatePath(sessionId);
    if (existsSync(statePath)) {
      return JSON.parse(readFileSync(statePath, "utf-8"));
    }
  } catch (err) {
    // Ignore errors, return default state
  }
  return {
    lastFreeUntilCompact: 100,
    lastBackupThreshold: null,
    sessionId: sessionId || null,
    currentBackupPath: null,
    lastBackupAtTokens: 0,
  };
}

export function writeState(sessionId, state) {
  try {
    mkdirSync(getStateDir(), { recursive: true });
    atomicWriteFileSync(getStatePath(sessionId), JSON.stringify(state, null, 2));
  } catch (err) {
    // Fail silently
  }
}

export function updateStateWithBackupPath(sessionId, relativePath) {
  const state = readState(sessionId);
  state.currentBackupPath = relativePath;
  state.sessionId = sessionId;
  writeState(sessionId, state);
}

// ============================================================================
// TRANSCRIPT PARSING
// ============================================================================

export function parseTranscript(transcriptPath) {
  const summary = {
    userRequests: [],
    claudeResponses: [],
    filesModified: new Set(),
    tasksCreated: [],
    tasksCompleted: [],
    tasksPending: [],
    subAgentCalls: [],
    skillsLoaded: new Set(),
    mcpToolCalls: [],
    buildTestResults: [],
    sessionStart: null,
    sessionEnd: null,
  };

  if (!existsSync(transcriptPath)) {
    log(`Transcript not found: ${transcriptPath}`);
    return null;
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Track session timing
        if (entry.timestamp) {
          if (!summary.sessionStart) {
            summary.sessionStart = entry.timestamp;
          }
          summary.sessionEnd = entry.timestamp;
        }

        // Extract user requests (skip tool results and system messages)
        if (entry.type === "user" && entry.message?.content) {
          const content = entry.message.content;

          if (Array.isArray(content) || typeof content !== "string") {
            continue;
          }

          const trimmed = content.trim();
          if (!trimmed) continue;

          // Skip tool results and system messages
          if (
            trimmed.startsWith("[{") ||
            trimmed.startsWith('{"tool_use_id"') ||
            trimmed.startsWith("Caveat:") ||
            trimmed.startsWith("<command-") ||
            trimmed.startsWith("<local-command-") ||
            trimmed.includes("<local-command-stdout>") ||
            trimmed.includes("<command-name>") ||
            trimmed.startsWith("[?") ||
            trimmed.startsWith("\x1b[") ||
            trimmed.startsWith("This session is being continued from") ||
            (trimmed.length < 10 && !trimmed.includes(" "))
          ) {
            continue;
          }

          summary.userRequests.push(trimmed);
        }

        // Extract from assistant messages
        if (entry.type === "assistant" && entry.message?.content) {
          const contentArray = Array.isArray(entry.message.content)
            ? entry.message.content
            : [entry.message.content];

          for (const block of contentArray) {
            // Claude's text responses
            if (block.type === "text" && block.text) {
              const text = block.text.trim();
              if (text.length > 50) {
                summary.claudeResponses.push(text);
              }
            }

            if (block.type === "tool_use") {
              const toolName = block.name;
              const toolInput = block.input || {};

              // Files modified
              if (toolName === "Write" || toolName === "Edit") {
                if (toolInput.file_path) {
                  summary.filesModified.add(toolInput.file_path);
                }
              }

              // TaskCreate (Anthropic's task system)
              if (toolName === "TaskCreate") {
                summary.tasksCreated.push({
                  subject: toolInput.subject || "No subject",
                  description: toolInput.description || "",
                });
              }

              // TaskUpdate (track status changes)
              if (toolName === "TaskUpdate") {
                if (toolInput.status === "completed") {
                  summary.tasksCompleted.push({
                    taskId: toolInput.taskId,
                  });
                } else if (toolInput.status === "pending" || toolInput.status === "in_progress") {
                  summary.tasksPending.push({
                    taskId: toolInput.taskId,
                    status: toolInput.status,
                  });
                }
              }

              // Sub-agent calls
              if (toolName === "Task") {
                summary.subAgentCalls.push({
                  agent: toolInput.subagent_type || "unknown",
                  description: toolInput.description || "No description",
                });
              }

              // Skills loaded
              if (toolName === "Skill" && toolInput.skill) {
                summary.skillsLoaded.add(toolInput.skill);
              }

              // MCP tool calls
              if (toolName && toolName.startsWith("mcp__")) {
                const existingCall = summary.mcpToolCalls.find(c => c.tool === toolName);
                if (existingCall) {
                  existingCall.count++;
                } else {
                  summary.mcpToolCalls.push({ tool: toolName, count: 1 });
                }
              }

              // Build/test results
              if (toolName === "Bash" && toolInput.command) {
                const cmd = toolInput.command.toLowerCase();
                if (
                  cmd.includes("build") ||
                  cmd.includes("test") ||
                  cmd.includes("pnpm") ||
                  cmd.includes("npm run")
                ) {
                  summary.buildTestResults.push({
                    command: toolInput.command,
                    result: "executed",
                  });
                }
              }
            }
          }
        }
      } catch (parseErr) {
        continue;
      }
    }

    // Convert Sets to Arrays
    summary.filesModified = Array.from(summary.filesModified);
    summary.skillsLoaded = Array.from(summary.skillsLoaded);

    return summary;
  } catch (err) {
    log(`Error parsing transcript: ${err.message}`);
    return null;
  }
}

// ============================================================================
// MARKDOWN FORMATTING
// ============================================================================

export function formatSummaryMarkdown(summary, trigger, sessionId, contextPct) {
  const lines = [];
  const timestamp = new Date().toISOString();

  lines.push(`# Session Backup`);
  lines.push(``);
  lines.push(`**Session ID:** ${sessionId}`);
  lines.push(`**Trigger:** ${trigger}`);
  if (contextPct !== undefined) {
    lines.push(`**Context Remaining:** ${contextPct.toFixed(1)}%`);
  }
  lines.push(`**Generated:** ${timestamp}`);
  if (summary.sessionStart) {
    lines.push(`**Session Start:** ${summary.sessionStart}`);
  }
  if (summary.sessionEnd) {
    lines.push(`**Session End:** ${summary.sessionEnd}`);
  }
  lines.push(``);

  // User Requests
  if (summary.userRequests.length > 0) {
    lines.push(`## User Requests`);
    for (const req of summary.userRequests) {
      lines.push(`- ${req}`);
    }
    lines.push(``);
  }

  // Claude's Key Responses
  if (summary.claudeResponses.length > 0) {
    lines.push(`## Claude's Key Responses`);
    for (const resp of summary.claudeResponses) {
      const indentedResp = resp.replace(/\n/g, "\n  ");
      lines.push(`- ${indentedResp}`);
    }
    lines.push(``);
  }

  // Files Modified
  if (summary.filesModified.length > 0) {
    lines.push(`## Files Modified`);
    const escapedProjectDir = PROJECT_DIR.replace(/[\\/]/g, "[\\\\/]");
    const projectDirRe = new RegExp("^" + escapedProjectDir + "[\\\\/]?");
    for (const file of summary.filesModified) {
      const displayPath = file.replace(projectDirRe, "");
      lines.push(`- ${displayPath}`);
    }
    lines.push(``);
  }

  // Tasks (Anthropic's task system)
  if (
    summary.tasksCreated.length > 0 ||
    summary.tasksCompleted.length > 0 ||
    summary.tasksPending.length > 0
  ) {
    lines.push(`## Tasks`);
    if (summary.tasksCreated.length > 0) {
      lines.push(`### Created`);
      for (const task of summary.tasksCreated) {
        lines.push(`- **${task.subject}**`);
        if (task.description) {
          lines.push(`  ${task.description.slice(0, 200)}...`);
        }
      }
    }
    if (summary.tasksCompleted.length > 0) {
      lines.push(`### Completed`);
      lines.push(`- ${summary.tasksCompleted.length} tasks completed`);
    }
    if (summary.tasksPending.length > 0) {
      lines.push(`### Pending/In Progress`);
      lines.push(`- ${summary.tasksPending.length} tasks remaining`);
    }
    lines.push(``);
  }

  // Sub-Agents Invoked
  if (summary.subAgentCalls.length > 0) {
    lines.push(`## Sub-Agents Invoked`);
    for (const call of summary.subAgentCalls) {
      lines.push(`- **${call.agent}**: ${call.description}`);
    }
    lines.push(``);
  }

  // Skills Loaded
  if (summary.skillsLoaded.length > 0) {
    lines.push(`## Skills Loaded`);
    for (const skill of summary.skillsLoaded) {
      lines.push(`- ${skill}`);
    }
    lines.push(``);
  }

  // MCP Tools Used
  if (summary.mcpToolCalls.length > 0) {
    lines.push(`## MCP Tools Used`);
    for (const call of summary.mcpToolCalls) {
      lines.push(`- ${call.tool} (${call.count} calls)`);
    }
    lines.push(``);
  }

  // Build/Test Commands
  if (summary.buildTestResults.length > 0) {
    lines.push(`## Build/Test Commands`);
    for (const result of summary.buildTestResults) {
      lines.push(`- \`${result.command}\`: ${result.result}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatFriendlyDate(date) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = date.getDate();
  const ordinal = getOrdinalSuffix(day);
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${day}${ordinal}-${month}-${year}-${hours}-${minutes}${ampm}`;
}

function getNextBackupNumber(backupDir) {
  try {
    if (!existsSync(backupDir)) return 1;
    const files = readdirSync(backupDir).filter(f => f.endsWith(".md") && /^\d+-/.test(f));
    if (files.length === 0) return 1;

    const numbers = files.map(f => {
      const match = f.match(/^(\d+)-/);
      return match ? parseInt(match[1], 10) : 0;
    });
    return Math.max(...numbers) + 1;
  } catch (err) {
    log(`Error getting backup number: ${err.message}`);
    return 1;
  }
}

export function saveBackup(summaryMarkdown, existingRelativePath = null) {
  try {
    const backupDir = join(PROJECT_DIR, ".claude", "backups");
    mkdirSync(backupDir, { recursive: true });

    // If a backup already exists for this session, overwrite it
    if (existingRelativePath) {
      const existingFullPath = join(PROJECT_DIR, existingRelativePath);
      if (existsSync(existingFullPath)) {
        writeFileSync(existingFullPath, summaryMarkdown);
        log(`Backup updated (overwrite): ${existingFullPath}`);
        return { fullPath: existingFullPath, relativePath: existingRelativePath };
      }
    }

    // Otherwise create a new numbered backup
    const now = new Date();
    const backupNumber = getNextBackupNumber(backupDir);
    const friendlyDate = formatFriendlyDate(now);
    const backupName = `${backupNumber}-backup-${friendlyDate}.md`;
    const backupPath = join(backupDir, backupName);
    const relativePath = `.claude/backups/${backupName}`;

    writeFileSync(backupPath, summaryMarkdown);

    log(`Backup saved (new): ${backupPath}`);
    return { fullPath: backupPath, relativePath };
  } catch (err) {
    log(`Failed to save backup: ${err.message}`);
    return null;
  }
}

// ============================================================================
// TRANSCRIPT DISCOVERY
// ============================================================================

export function findTranscriptPath(sessionId) {
  try {
    const claudeDir = join(homedir(), ".claude", "projects");
    if (!existsSync(claudeDir)) return null;

    const projectDirs = readdirSync(claudeDir);
    for (const projectDir of projectDirs) {
      const projectPath = join(claudeDir, projectDir);
      const sessionFile = join(projectPath, `${sessionId}.jsonl`);
      if (existsSync(sessionFile)) {
        return sessionFile;
      }
    }
    return null;
  } catch (err) {
    log(`Error finding transcript: ${err.message}`);
    return null;
  }
}

// ============================================================================
// MAIN BACKUP FUNCTION
// ============================================================================

/**
 * Run a backup operation
 *
 * @param {string} sessionId - The session ID
 * @param {string} trigger - What triggered the backup (e.g., "crossed_30pct", "precompact_auto")
 * @param {string} transcriptPath - Path to transcript (optional, will search if not provided)
 * @param {number} contextPct - Current context percentage (optional)
 * @returns {string|null} - Relative path to backup file, or null on failure
 */
export function runBackup(sessionId, trigger, transcriptPath = null, contextPct = undefined) {
  // Skip entirely for compactor-invoked sessions (recursion prevention)
  if (process.env.CLAUDE_INVOKED_BY === "backup_compactor") {
    return null;
  }

  log(`Running backup: trigger=${trigger}, session=${sessionId.slice(0, 8)}...`);

  // Sweep state files older than STATE_FILE_TTL_MS (once per process).
  cleanupStaleStateFiles(sessionId);

  // Race condition protection: prevent concurrent statusline processes from creating duplicates.
  // Multiple statusline processes can read the same state before any writes, all triggering backups.
  // This lock ensures only one backup is created per 30-second window per session.
  const lockPath = getLockPath(sessionId);
  try {
    mkdirSync(getStateDir(), { recursive: true });
    if (existsSync(lockPath)) {
      const lockAge = Date.now() - statSync(lockPath).mtimeMs;
      if (lockAge < BACKUP_MIN_INTERVAL_MS) {
        log(
          `Backup skipped: lock is ${Math.round(lockAge / 1000)}s old (min ${BACKUP_MIN_INTERVAL_MS / 1000}s)`
        );
        const currentState = readState(sessionId);
        return currentState.currentBackupPath || null;
      }
    }
    // Touch the lock immediately to block concurrent processes
    writeFileSync(lockPath, String(Date.now()));
  } catch (lockErr) {
    log(`Lock check failed (proceeding): ${lockErr.message}`);
  }

  // Find transcript if not provided
  const actualTranscriptPath = transcriptPath || findTranscriptPath(sessionId);
  if (!actualTranscriptPath) {
    log(`No transcript found for session ${sessionId}`);
    return null;
  }

  // Parse transcript
  const summary = parseTranscript(actualTranscriptPath);
  if (!summary) {
    log(`Failed to parse transcript`);
    return null;
  }

  // Format as markdown
  const markdown = formatSummaryMarkdown(summary, trigger, sessionId, contextPct);

  // Check if a backup already exists for this session (overwrite instead of creating new)
  const state = readState(sessionId);
  const existingPath =
    state.sessionId === sessionId && state.currentBackupPath ? state.currentBackupPath : null;

  // Save backup (overwrites existing if same session, otherwise creates new)
  const result = saveBackup(markdown, existingPath);
  if (!result) {
    return null;
  }

  // Update state
  updateStateWithBackupPath(sessionId, result.relativePath);

  log(`Backup complete: ${result.relativePath}`);

  // Check if old backups need compaction (spawns detached background process)
  maybeSpawnCompactor();

  return result.relativePath;
}

// ============================================================================
// BACKUP COMPACTION TRIGGER
// ============================================================================

// Compactor lock stays GLOBAL: only one compactor should run at a time
// across all projects, since each invocation calls `claude -p` which is
// expensive. Per-project state and per-session backup locks are isolated
// elsewhere; this single lock just serializes the heavy summarization step.
const COMPACTOR_LOCK_PATH = join(homedir(), ".claude", "claudefast-compactor.lock");
const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const MONTHS_LOOKUP = {
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

function maybeSpawnCompactor() {
  try {
    const backupDir = join(PROJECT_DIR, ".claude", "backups");

    if (!existsSync(backupDir)) return;

    // Quick scan: at least 7 individual backup files older than 14 days?
    const now = Date.now();
    const files = readdirSync(backupDir).filter(f => f.endsWith(".md") && /^\d+-backup-/.test(f));

    let staleCount = 0;
    for (const f of files) {
      const match = f.match(/\d+-backup-(\d+)\w+-(\w+)-(\d+)/);
      if (!match) continue;
      const month = MONTHS_LOOKUP[match[2]];
      if (month === undefined) continue;
      const date = new Date(parseInt(match[3]), month, parseInt(match[1]));
      if (now - date.getTime() > STALE_THRESHOLD_MS) {
        staleCount++;
        if (staleCount >= 7) break; // Found enough, no need to count more
      }
    }

    if (staleCount < 7) return;

    // Check if compactor is already running (10 min cooldown)
    if (existsSync(COMPACTOR_LOCK_PATH)) {
      const lockAge = Date.now() - statSync(COMPACTOR_LOCK_PATH).mtimeMs;
      if (lockAge < 600000) {
        log(`Compactor already running (lock ${Math.round(lockAge / 1000)}s old), skipping`);
        return;
      }
    }

    // Spawn compactor as detached background process
    const compactorPath = join(__dirname, "backup-compactor.mjs");
    if (!existsSync(compactorPath)) {
      log("Compactor script not found, skipping");
      return;
    }

    log("Stale backups detected, spawning compactor...");

    // detached: true is required on all platforms so the child survives
    // after the parent (hook process) exits. On Windows this creates a
    // console window, but windowsHide: true suppresses it.
    const child = spawn("node", [compactorPath], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, CLAUDE_INVOKED_BY: "backup_compactor" },
      cwd: PROJECT_DIR,
      windowsHide: true,
    });
    child.unref();
    log(`Compactor spawned (PID: ${child.pid})`);
  } catch (err) {
    log(`Compactor spawn failed: ${err.message}`);
  }
}
