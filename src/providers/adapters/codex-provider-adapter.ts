import { promises as fs, createReadStream } from "node:fs";
import { type ProviderAdapter, type ProviderAdapterResult } from "../provider-adapter";
import { collectFilesRecursive, directoryExists, resolveHomePath } from "../local-file-utils";

interface CodexUsageCounts {
  rollingFiveHourMessages: number;
  weeklyMessages: number;
  filesScanned: number;
}

interface CodexFileScanState {
  mtimeMs: number;
  sizeBytes: number;
  weeklyTimestamps: number[];
  trailingFragment: string;
}

export class CodexProviderAdapter implements ProviderAdapter {
  readonly id = "codex";
  readonly displayName = "Codex";

  private readonly minRefreshMs = 5 * 60 * 1000;
  private lastCollectedAt = 0;
  private lastResult: ProviderAdapterResult | null = null;
  private fileScanState = new Map<string, CodexFileScanState>();

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
          message: "Workspace is untrusted; local provider scanning is disabled.",
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
          message: "Codex sessions directory was not found.",
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
          message: "No Codex session logs found.",
          errorCode: "CODEX_NO_LOGS",
        },
      };
      this.cache(result, nowMs);
      return result;
    }

    const cutoffFiveHour = nowMs - 5 * 60 * 60 * 1000;
    const cutoffWeekly = nowMs - 7 * 24 * 60 * 60 * 1000;
    const counts = await this.countMessages(files, cutoffFiveHour, cutoffWeekly);

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
        message: `Scanned ${counts.filesScanned} Codex session file(s) for local prompt counts.`,
      },
    };

    this.cache(result, nowMs);
    return result;
  }

  private cache(result: ProviderAdapterResult, nowMs: number): void {
    this.lastCollectedAt = nowMs;
    this.lastResult = result;
  }

  private async countMessages(
    files: string[],
    cutoffFiveHour: number,
    cutoffWeekly: number
  ): Promise<CodexUsageCounts> {
    let rollingFiveHourMessages = 0;
    let weeklyMessages = 0;
    let filesScanned = 0;

    const activeFiles = new Set(files);
    for (const existingPath of Array.from(this.fileScanState.keys())) {
      if (!activeFiles.has(existingPath)) {
        this.fileScanState.delete(existingPath);
      }
    }

    for (const filePath of files) {
      const stats = await this.getStats(filePath);
      if (!stats) {
        continue;
      }

      const previous = this.fileScanState.get(filePath);
      if (!previous && stats.mtimeMs < cutoffWeekly) {
        continue;
      }

      filesScanned += 1;

      const next = await this.readTimestampsIncremental(filePath, stats, previous);
      const weeklyTimestamps = next.weeklyTimestamps
        .filter(timestamp => timestamp >= cutoffWeekly)
        .sort((a, b) => a - b);

      this.fileScanState.set(filePath, {
        mtimeMs: next.mtimeMs,
        sizeBytes: next.sizeBytes,
        weeklyTimestamps,
        trailingFragment: next.trailingFragment,
      });

      weeklyMessages += weeklyTimestamps.length;
      for (const timestamp of weeklyTimestamps) {
        if (timestamp >= cutoffFiveHour) {
          rollingFiveHourMessages += 1;
        }
      }
    }

    return { rollingFiveHourMessages, weeklyMessages, filesScanned };
  }

  private async getStats(filePath: string): Promise<{ mtimeMs: number; sizeBytes: number } | null> {
    try {
      const stats = await fs.stat(filePath);
      return { mtimeMs: stats.mtimeMs, sizeBytes: stats.size };
    } catch {
      return null;
    }
  }

  private async readTimestampsIncremental(
    filePath: string,
    stats: { mtimeMs: number; sizeBytes: number },
    previous: CodexFileScanState | undefined
  ): Promise<CodexFileScanState> {
    if (
      !previous ||
      stats.sizeBytes < previous.sizeBytes ||
      stats.mtimeMs < previous.mtimeMs ||
      (stats.mtimeMs > previous.mtimeMs && stats.sizeBytes === previous.sizeBytes)
    ) {
      const full = await this.readChunk(filePath, 0, "");
      return {
        mtimeMs: stats.mtimeMs,
        sizeBytes: stats.sizeBytes,
        weeklyTimestamps: full.timestamps,
        trailingFragment: full.trailingFragment,
      };
    }

    if (stats.sizeBytes === previous.sizeBytes && stats.mtimeMs === previous.mtimeMs) {
      return previous;
    }

    const delta = await this.readChunk(filePath, previous.sizeBytes, previous.trailingFragment);
    return {
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.sizeBytes,
      weeklyTimestamps: previous.weeklyTimestamps.concat(delta.timestamps),
      trailingFragment: delta.trailingFragment,
    };
  }

  private async readChunk(
    filePath: string,
    startByte: number,
    initialFragment: string
  ): Promise<{ timestamps: number[]; trailingFragment: string }> {
    return await new Promise((resolve, reject) => {
      const timestamps: number[] = [];
      const stream = createReadStream(filePath, {
        encoding: "utf8",
        start: Math.max(0, startByte),
      });
      let buffer = initialFragment;

      stream.on("data", chunk => {
        buffer += chunk;
        let nextBreak = buffer.indexOf("\n");
        while (nextBreak >= 0) {
          const line = buffer.slice(0, nextBreak).replace(/\r$/, "");
          buffer = buffer.slice(nextBreak + 1);
          this.collectTimestampFromLine(line, timestamps);
          nextBreak = buffer.indexOf("\n");
        }
      });

      stream.on("error", reject);
      stream.on("end", () => {
        const trailingFragment = this.flushTrailingFragment(buffer, timestamps);
        resolve({ timestamps, trailingFragment });
      });
    });
  }

  private collectTimestampFromLine(line: string, target: number[]): void {
    if (!line.includes('"type":"event_msg"') || !line.includes('"user_message"')) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    const event = this.asRecord(parsed);
    if (!event || event.type !== "event_msg") {
      return;
    }

    const payload = this.asRecord(event.payload);
    if (!payload || payload.type !== "user_message") {
      return;
    }

    const timestamp = this.toTimestamp(event.timestamp);
    if (timestamp !== null) {
      target.push(timestamp);
    }
  }

  private flushTrailingFragment(fragment: string, target: number[]): string {
    if (fragment.length === 0) {
      return "";
    }

    const trimmed = fragment.trim();
    if (trimmed.length === 0) {
      return "";
    }

    const beforeCount = target.length;
    this.collectTimestampFromLine(trimmed, target);
    if (target.length > beforeCount) {
      return "";
    }

    return fragment.length > 4096 ? fragment.slice(-4096) : fragment;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toTimestamp(value: unknown): number | null {
    if (typeof value !== "string") {
      return null;
    }
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  }
}
