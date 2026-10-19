import { type ProviderAdapter, type ProviderAdapterResult } from "../provider-adapter";
import { promises as fs } from "node:fs";
import { collectFilesRecursive, directoryExists, resolveHomePath } from "../local-file-utils";
import {
  JsonlSessionScanner,
  PRIMARY_RECORD_SEEN,
  asRecord,
  toTimestamp,
} from "./jsonl-session-scanner";

/**
 * `turn_attribution.turn_trigger` values for turns Codex starts on its own.
 * The field is free-form, so unknown triggers count (a denylist, not an allowlist).
 */
const AUTOMATED_TURN_TRIGGERS: ReadonlySet<string> = new Set([
  "automation_heartbeat_scheduled",
  "capacity_retry_automatic",
  "guardian_review",
  "resume_interrupted_task",
  "retry",
  "goal",
]);

/**
 * Current Codex rollouts write an `event_msg` / `task_started` record per turn.
 * Count root turns not started by an automated trigger; child and automated
 * turns are reported as seen so the legacy `user_message` fallback stays off
 * for this file.
 */
function extractCodexTurnStart(line: string): number | typeof PRIMARY_RECORD_SEEN | null {
  if (!line.includes('"type":"event_msg"') || !line.includes('"task_started"')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const event = asRecord(parsed);
  if (!event || event.type !== "event_msg") {
    return null;
  }

  const payload = asRecord(event.payload);
  if (!payload || payload.type !== "task_started") {
    return null;
  }

  const attribution = asRecord(payload.turn_attribution);
  if (attribution) {
    const parentTurnId = attribution.parent_turn_id;
    if (parentTurnId !== undefined && parentTurnId !== null) {
      return PRIMARY_RECORD_SEEN;
    }
    const trigger = attribution.turn_trigger;
    if (typeof trigger === "string" && AUTOMATED_TURN_TRIGGERS.has(trigger)) {
      return PRIMARY_RECORD_SEEN;
    }
  }

  return toTimestamp(event.timestamp) ?? PRIMARY_RECORD_SEEN;
}

/**
 * Legacy Codex history mode marks user turns with an `event_msg` whose payload
 * is a `user_message`. Used only for files without any `task_started` record,
 * because legacy rollouts write both records for the same turn.
 */
function extractCodexTimestamp(line: string): number | null {
  if (!line.includes('"type":"event_msg"') || !line.includes('"user_message"')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const event = asRecord(parsed);
  if (!event || event.type !== "event_msg") {
    return null;
  }

  const payload = asRecord(event.payload);
  if (!payload || payload.type !== "user_message") {
    return null;
  }

  return toTimestamp(event.timestamp);
}

/**
 * Classifies a session from its first line. Returns `null` when the head is
 * empty, partial, malformed, or not a `session_meta` record, so the caller
 * re-checks it later instead of caching an unconfirmed answer.
 */
async function isSubagentSession(filePath: string): Promise<boolean | null> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/, 1)[0];
    if (!firstLine) {
      return null;
    }
    const event = asRecord(JSON.parse(firstLine));
    if (event?.type !== "session_meta") {
      return null;
    }
    const payload = asRecord(event.payload);
    const source = asRecord(payload?.source);
    return source !== null && Object.hasOwn(source, "subagent");
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

export class CodexProviderAdapter implements ProviderAdapter {
  readonly id = "codex";
  readonly displayName = "Codex";

  private readonly minRefreshMs = 5 * 60 * 1000;
  private lastCollectedAt = 0;
  private lastResult: ProviderAdapterResult | null = null;
  private readonly scanner = new JsonlSessionScanner(extractCodexTurnStart, extractCodexTimestamp);
  /** Confirmed subagent classifications by path, with the file size last seen. */
  private readonly subagentCache = new Map<string, { isSubagent: boolean; sizeBytes: number }>();

  constructor(private readonly resolveCustomPath: () => string = () => "") {}

  async collectUsage(context: {
    now: Date;
    workspaceTrusted: boolean;
    forceRefresh?: boolean;
  }): Promise<ProviderAdapterResult> {
    if (!context.workspaceTrusted) {
      return {
        snapshots: [],
        health: {
          providerId: this.id,
          status: "restricted",
          checkedAt: context.now.toISOString(),
          canCollectInCurrentWorkspace: false,
          sourceKind: "file",
          message: "Codex activity is not read in untrusted workspaces.",
        },
      };
    }

    const nowMs = context.now.getTime();
    if (
      !context.forceRefresh &&
      this.lastResult &&
      nowMs - this.lastCollectedAt < this.minRefreshMs
    ) {
      return this.lastResult;
    }

    const sessionsPath = resolveHomePath(this.resolveCustomPath(), [".codex", "sessions"]);
    if (!(await directoryExists(sessionsPath))) {
      const result: ProviderAdapterResult = {
        snapshots: [],
        health: {
          providerId: this.id,
          status: "unavailable",
          checkedAt: context.now.toISOString(),
          canCollectInCurrentWorkspace: true,
          sourceKind: "file",
          message: "No Codex history was found at the configured sessions path.",
          errorCode: "CODEX_PATH_MISSING",
        },
      };
      this.cache(result, nowMs);
      return result;
    }

    const files = await collectFilesRecursive(sessionsPath, fileName =>
      fileName.endsWith(".jsonl")
    );
    if (files.length === 0) {
      const result: ProviderAdapterResult = {
        snapshots: [],
        health: {
          providerId: this.id,
          status: "degraded",
          checkedAt: context.now.toISOString(),
          canCollectInCurrentWorkspace: true,
          sourceKind: "file",
          message: "No Codex activity has been recorded at the configured path yet.",
          errorCode: "CODEX_NO_LOGS",
        },
      };
      this.cache(result, nowMs);
      return result;
    }

    const cutoffFiveHour = nowMs - 5 * 60 * 60 * 1000;
    const cutoffWeekly = nowMs - 7 * 24 * 60 * 60 * 1000;
    const userSessionFiles = await this.selectUserSessionFiles(files, cutoffWeekly);
    const counts = await this.scanner.countMessages(userSessionFiles, cutoffFiveHour, cutoffWeekly);

    const nowIso = context.now.toISOString();
    const result: ProviderAdapterResult = {
      snapshots: [
        {
          providerId: this.id,
          timestamp: nowIso,
          windowType: "rolling_5h",
          metricType: "messages",
          sourceKind: "file",
          source: sessionsPath,
          used: counts.rollingFiveHourMessages,
          freshnessAt: nowIso,
          confidence: 0.85,
          details: {
            filesScanned: counts.filesScanned,
          },
        },
        {
          providerId: this.id,
          timestamp: nowIso,
          windowType: "weekly_7d",
          metricType: "messages",
          sourceKind: "file",
          source: sessionsPath,
          used: counts.weeklyMessages,
          freshnessAt: nowIso,
          confidence: 0.85,
          details: {
            filesScanned: counts.filesScanned,
          },
        },
      ],
      health: {
        providerId: this.id,
        status: "connected",
        checkedAt: nowIso,
        canCollectInCurrentWorkspace: true,
        sourceKind: "file",
        message: `Read ${counts.filesScanned} Codex session ${counts.filesScanned === 1 ? "file" : "files"} for local user turns; agent sessions were excluded.`,
      },
    };

    this.cache(result, nowMs);
    return result;
  }

  /**
   * Drops files not modified within the weekly window before opening them, then
   * excludes subagent sessions. The subagent flag lives in the immutable first
   * line, so confirmed answers are cached until the file shrinks (truncated or
   * replaced).
   */
  private async selectUserSessionFiles(files: string[], cutoffWeekly: number): Promise<string[]> {
    const activeFiles = new Set(files);
    for (const cachedPath of Array.from(this.subagentCache.keys())) {
      if (!activeFiles.has(cachedPath)) {
        this.subagentCache.delete(cachedPath);
      }
    }

    const userSessionFiles: string[] = [];
    for (const file of files) {
      let stats: { mtimeMs: number; size: number };
      try {
        stats = await fs.stat(file);
      } catch {
        continue;
      }
      if (stats.mtimeMs < cutoffWeekly) {
        continue;
      }

      const cached = this.subagentCache.get(file);
      let isSubagent: boolean | null;
      if (cached && stats.size >= cached.sizeBytes) {
        isSubagent = cached.isSubagent;
      } else {
        isSubagent = await isSubagentSession(file);
      }

      if (isSubagent === null) {
        this.subagentCache.delete(file);
      } else {
        this.subagentCache.set(file, { isSubagent, sizeBytes: stats.size });
      }
      if (isSubagent !== true) {
        userSessionFiles.push(file);
      }
    }
    return userSessionFiles;
  }

  private cache(result: ProviderAdapterResult, nowMs: number): void {
    this.lastCollectedAt = nowMs;
    this.lastResult = result;
  }
}
