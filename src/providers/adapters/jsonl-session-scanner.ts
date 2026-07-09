/**
 * ABOUTME: Shared JSONL incremental-scan + timestamp-rollup engine for local
 * session-log providers (Claude Code, Codex). Each provider injects only its
 * per-line timestamp extractor; the directory-scan, incremental read, trailing
 * fragment carry-forward, retention cutoff, and 5h/weekly rollup are identical.
 */
import { promises as fs, createReadStream } from "node:fs";

/**
 * Extracts a user-message timestamp (epoch ms) from one JSONL line, or `null`
 * when the line is not a countable user message. Providers embed their own
 * quick-check + JSON shape validation here.
 */
export type ExtractTimestamp = (line: string) => number | null;

export interface JsonlScanCounts {
  rollingFiveHourMessages: number;
  weeklyMessages: number;
  filesScanned: number;
}

interface FileScanState {
  mtimeMs: number;
  sizeBytes: number;
  weeklyTimestamps: number[];
  trailingFragment: string;
}

/**
 * Incrementally scans a set of JSONL files, remembering per-file read offsets
 * so appended lines are read once, and rolls matching timestamps up into
 * rolling-5h and weekly-7d counts. One instance per provider adapter (holds
 * that provider's per-file scan state).
 */
export class JsonlSessionScanner {
  private fileScanState = new Map<string, FileScanState>();

  constructor(private readonly extractTimestamp: ExtractTimestamp) {}

  async countMessages(
    files: string[],
    cutoffFiveHour: number,
    cutoffWeekly: number
  ): Promise<JsonlScanCounts> {
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
    previous: FileScanState | undefined
  ): Promise<FileScanState> {
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
          this.collectTimestamp(line, timestamps);
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

  private collectTimestamp(line: string, target: number[]): void {
    const timestamp = this.extractTimestamp(line);
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
    this.collectTimestamp(trimmed, target);
    if (target.length > beforeCount) {
      return "";
    }

    return fragment.length > 4096 ? fragment.slice(-4096) : fragment;
  }
}

/**
 * Narrows an unknown value to a plain object record (not array, not null).
 * Shared by provider timestamp extractors.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Parses an ISO-8601 string field into epoch ms, or `null` when it is not a
 * parseable string.
 */
export function toTimestamp(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}
