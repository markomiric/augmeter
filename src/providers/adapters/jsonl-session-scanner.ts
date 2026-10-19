/**
 * ABOUTME: Shared JSONL incremental-scan + timestamp-rollup engine for local
 * session-log providers (Claude Code, Codex). Each provider injects only its
 * per-line timestamp extractor; the directory-scan, incremental read, trailing
 * fragment carry-forward, retention cutoff, and 5h/weekly rollup are identical.
 */
import { promises as fs, createReadStream } from "node:fs";

/**
 * Largest unfinished trailing line kept between scans. A longer fragment is
 * dropped whole: a tail alone would never parse as the record it came from.
 */
const MAX_TRAILING_FRAGMENT_CHARS = 1024 * 1024;

/**
 * Extracts a user-message timestamp (epoch ms) from one JSONL line, or `null`
 * when the line is not a countable user message. Providers embed their own
 * quick-check + JSON shape validation here.
 */
export type ExtractTimestamp = (line: string) => number | null;

/**
 * Returned by a primary extractor for a primary record that must not be counted
 * (for example an automated turn). It still marks the file as containing primary
 * records, so the fallback extractor's timestamps are ignored for that file.
 */
export const PRIMARY_RECORD_SEEN = "seen";

/** A primary extractor: a countable timestamp, a seen-but-not-countable record, or `null`. */
export type ExtractPrimaryTimestamp = (line: string) => number | typeof PRIMARY_RECORD_SEEN | null;

export interface JsonlScanCounts {
  rollingFiveHourMessages: number;
  weeklyMessages: number;
  filesScanned: number;
}

interface LineMatches {
  weeklyTimestamps: number[];
  fallbackTimestamps: number[];
  hasPrimary: boolean;
}

interface FileScanState extends LineMatches {
  mtimeMs: number;
  sizeBytes: number;
  trailingFragment: string;
}

/**
 * Incrementally scans a set of JSONL files, remembering per-file read offsets
 * so appended lines are read once, and rolls matching timestamps up into
 * rolling-5h and weekly-7d counts. One instance per provider adapter (holds
 * that provider's per-file scan state).
 *
 * With a fallback extractor, each file counts its primary timestamps when it
 * contains any primary record, and its fallback timestamps otherwise.
 */
export class JsonlSessionScanner {
  private fileScanState = new Map<string, FileScanState>();

  constructor(
    private readonly extractTimestamp: ExtractTimestamp | ExtractPrimaryTimestamp,
    private readonly extractFallbackTimestamp?: ExtractTimestamp
  ) {}

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

    const withinWeek = (timestamps: number[]): number[] =>
      timestamps.filter(timestamp => timestamp >= cutoffWeekly).sort((a, b) => a - b);

    for (const filePath of files) {
      const stats = await this.getStats(filePath);
      if (!stats) {
        continue;
      }

      const previous = this.fileScanState.get(filePath);
      if (!previous && stats.mtimeMs < cutoffWeekly) {
        continue;
      }

      let next: FileScanState;
      try {
        next = await this.readTimestampsIncremental(filePath, stats, previous);
      } catch (error) {
        // A file read before keeps its last counts, and a file deleted since stat is
        // skipped. DECISION: any other read failure on a file never read is rethrown so
        // the provider keeps its saved readings with degraded health instead of
        // publishing counts that silently leave the file out.
        if (previous) {
          next = previous;
        } else if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
          continue;
        } else {
          throw error;
        }
      }
      filesScanned += 1;

      const state: FileScanState = {
        mtimeMs: next.mtimeMs,
        sizeBytes: next.sizeBytes,
        weeklyTimestamps: withinWeek(next.weeklyTimestamps),
        fallbackTimestamps: withinWeek(next.fallbackTimestamps),
        hasPrimary: next.hasPrimary,
        trailingFragment: next.trailingFragment,
      };
      this.fileScanState.set(filePath, state);

      const counted = state.hasPrimary ? state.weeklyTimestamps : state.fallbackTimestamps;
      weeklyMessages += counted.length;
      for (const timestamp of counted) {
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
      const full = await this.readChunk(filePath, 0, stats.sizeBytes, "");
      return { ...full, mtimeMs: stats.mtimeMs, sizeBytes: stats.sizeBytes };
    }

    if (stats.sizeBytes === previous.sizeBytes && stats.mtimeMs === previous.mtimeMs) {
      return previous;
    }

    const delta = await this.readChunk(
      filePath,
      previous.sizeBytes,
      stats.sizeBytes,
      previous.trailingFragment
    );
    return {
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.sizeBytes,
      weeklyTimestamps: previous.weeklyTimestamps.concat(delta.weeklyTimestamps),
      fallbackTimestamps: previous.fallbackTimestamps.concat(delta.fallbackTimestamps),
      hasPrimary: previous.hasPrimary || delta.hasPrimary,
      trailingFragment: delta.trailingFragment,
    };
  }

  /**
   * Reads bytes `[startByte, endByte)`. `endByte` is the size captured by `stat`,
   * so bytes appended during the read are left for the next scan instead of being
   * counted now and again from the stored offset.
   */
  private async readChunk(
    filePath: string,
    startByte: number,
    endByte: number,
    initialFragment: string
  ): Promise<LineMatches & { trailingFragment: string }> {
    const matches: LineMatches = {
      weeklyTimestamps: [],
      fallbackTimestamps: [],
      hasPrimary: false,
    };
    const start = Math.max(0, startByte);
    if (endByte <= start) {
      return { ...matches, trailingFragment: initialFragment };
    }

    return await new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, {
        encoding: "utf8",
        start,
        end: endByte - 1,
      });
      let buffer = initialFragment;
      let ended = false;

      stream.on("data", chunk => {
        buffer += chunk;
        let nextBreak = buffer.indexOf("\n");
        while (nextBreak >= 0) {
          const line = buffer.slice(0, nextBreak).replace(/\r$/, "");
          buffer = buffer.slice(nextBreak + 1);
          this.collectLine(line, matches);
          nextBreak = buffer.indexOf("\n");
        }
      });

      stream.on("error", reject);
      stream.on("end", () => {
        ended = true;
      });
      stream.on("close", () => {
        // Windows keeps the file locked until this event, after `end`.
        if (!ended) {
          return;
        }
        const trailingFragment = this.flushTrailingFragment(buffer, matches);
        resolve({ ...matches, trailingFragment });
      });
    });
  }

  /** Records what one line contributes; returns whether either extractor matched it. */
  private collectLine(line: string, target: LineMatches): boolean {
    const primary = this.extractTimestamp(line);
    if (primary === PRIMARY_RECORD_SEEN) {
      target.hasPrimary = true;
      return true;
    }
    if (primary !== null) {
      target.hasPrimary = true;
      target.weeklyTimestamps.push(primary);
      return true;
    }
    const fallback = this.extractFallbackTimestamp?.(line) ?? null;
    if (fallback !== null) {
      target.fallbackTimestamps.push(fallback);
      return true;
    }
    return false;
  }

  private flushTrailingFragment(fragment: string, target: LineMatches): string {
    if (fragment.length === 0) {
      return "";
    }

    const trimmed = fragment.trim();
    if (trimmed.length === 0) {
      return "";
    }

    if (this.collectLine(trimmed, target)) {
      return "";
    }

    return fragment.length > MAX_TRAILING_FRAGMENT_CHARS ? "" : fragment;
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
