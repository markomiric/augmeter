import { type ProviderAdapter, type ProviderAdapterResult } from "../provider-adapter";
import { promises as fs } from "node:fs";
import { collectFilesRecursive, directoryExists, resolveHomePath } from "../local-file-utils";
import { JsonlSessionScanner, asRecord, toTimestamp } from "./jsonl-session-scanner";

/**
 * Codex session logs mark user turns with an `event_msg` whose payload is a
 * `user_message`; count those.
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

async function isSubagentSession(filePath: string): Promise<boolean> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/, 1)[0];
    if (!firstLine) {
      return false;
    }
    const event = asRecord(JSON.parse(firstLine));
    if (event?.type !== "session_meta") {
      return false;
    }
    const payload = asRecord(event.payload);
    const source = asRecord(payload?.source);
    return source !== null && Object.hasOwn(source, "subagent");
  } catch {
    return false;
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
  private readonly scanner = new JsonlSessionScanner(extractCodexTimestamp);

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

    const userSessionFiles: string[] = [];
    for (const file of files) {
      if (!(await isSubagentSession(file))) {
        userSessionFiles.push(file);
      }
    }

    const cutoffFiveHour = nowMs - 5 * 60 * 60 * 1000;
    const cutoffWeekly = nowMs - 7 * 24 * 60 * 60 * 1000;
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

  private cache(result: ProviderAdapterResult, nowMs: number): void {
    this.lastCollectedAt = nowMs;
    this.lastResult = result;
  }
}
