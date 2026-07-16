import { type ProviderAdapter, type ProviderAdapterResult } from "../provider-adapter";
import { collectFilesRecursive, directoryExists, resolveHomePath } from "../local-file-utils";
import { JsonlSessionScanner, asRecord, toTimestamp } from "./jsonl-session-scanner";

/** Claude logs also use `type: "user"` for tool results; count human input only. */
function extractClaudeTimestamp(line: string): number | null {
  if (!line.includes('"type":"user"') || !line.includes('"timestamp"')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const event = asRecord(parsed);
  if (!event || event.type !== "user" || event.isMeta === true) {
    return null;
  }

  const message = asRecord(event.message);
  const content = message?.content;
  const hasHumanInput =
    (typeof content === "string" && content.trim().length > 0) ||
    (Array.isArray(content) &&
      content.some(block => {
        const item = asRecord(block);
        return item?.type === "text" || item?.type === "image";
      }));
  if (!hasHumanInput) {
    return null;
  }

  return toTimestamp(event.timestamp);
}

export class ClaudeProviderAdapter implements ProviderAdapter {
  readonly id = "claude";
  readonly displayName = "Claude Code";

  private readonly minRefreshMs = 5 * 60 * 1000;
  private lastCollectedAt = 0;
  private lastResult: ProviderAdapterResult | null = null;
  private readonly scanner = new JsonlSessionScanner(extractClaudeTimestamp);

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
          message: "Claude Code activity is not read in untrusted workspaces.",
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

    const projectsPath = resolveHomePath(this.resolveCustomPath(), [".claude", "projects"]);
    if (!(await directoryExists(projectsPath))) {
      const result: ProviderAdapterResult = {
        snapshots: [],
        health: {
          providerId: this.id,
          status: "unavailable",
          checkedAt: context.now.toISOString(),
          canCollectInCurrentWorkspace: true,
          sourceKind: "file",
          message: "No Claude Code history was found at the configured projects path.",
          errorCode: "CLAUDE_PATH_MISSING",
        },
      };
      this.cache(result, nowMs);
      return result;
    }

    const files = await collectFilesRecursive(
      projectsPath,
      fileName => fileName.endsWith(".jsonl"),
      new Set(["subagents"])
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
          message: "No Claude Code activity has been recorded at the configured path yet.",
          errorCode: "CLAUDE_NO_LOGS",
        },
      };
      this.cache(result, nowMs);
      return result;
    }

    const cutoffFiveHour = nowMs - 5 * 60 * 60 * 1000;
    const cutoffWeekly = nowMs - 7 * 24 * 60 * 60 * 1000;

    const counts = await this.scanner.countMessages(files, cutoffFiveHour, cutoffWeekly);
    const nowIso = context.now.toISOString();

    const result: ProviderAdapterResult = {
      snapshots: [
        {
          providerId: this.id,
          timestamp: nowIso,
          windowType: "rolling_5h",
          metricType: "messages",
          sourceKind: "file",
          source: projectsPath,
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
          source: projectsPath,
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
        message: `Read ${counts.filesScanned} Claude Code log ${counts.filesScanned === 1 ? "file" : "files"} for local user turns.`,
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
