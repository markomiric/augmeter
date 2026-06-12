/**
 * ABOUTME: This file reads local Augment session files to count prompts and sessions
 * per day. It is read-only and gated behind the sessionTracking.enabled config flag.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface SessionActivity {
  promptCount: number;
  sessionCount: number;
}

interface SessionExchange {
  finishedAt?: unknown;
}

/**
 * Read-only parser for Augment session files (~/.augment/sessions/*.json).
 *
 * Each JSON file represents one session and contains an array of exchanges,
 * each with a `finishedAt` ISO timestamp. We count exchanges whose
 * `finishedAt` falls within the requested day.
 */
export class SessionReader {
  private sessionsDir: string;

  constructor(customPath?: string) {
    if (customPath && customPath.trim().length > 0) {
      this.sessionsDir = customPath.trim();
    } else {
      this.sessionsDir = path.join(os.homedir(), ".augment", "sessions");
    }
  }

  /**
   * Count prompts and sessions for a given date (default: today).
   * Gracefully returns zeros on any error.
   */
  getTodayActivity(referenceDate?: Date): SessionActivity {
    return SessionReader.computeActivity(this.sessionsDir, referenceDate);
  }

  /**
   * Pure, static computation for testability. Reads the given directory
   * and counts exchanges whose finishedAt matches the reference date.
   */
  static computeActivity(sessionsDir: string, referenceDate?: Date): SessionActivity {
    const targetDate = (referenceDate ?? new Date()).toISOString().split("T")[0]!;
    let promptCount = 0;
    let sessionCount = 0;

    let files: string[];
    try {
      files = fs.readdirSync(sessionsDir).filter(f => f.endsWith(".json"));
    } catch {
      return { promptCount: 0, sessionCount: 0 };
    }

    for (const file of files) {
      try {
        const filePath = path.join(sessionsDir, file);
        const raw = fs.readFileSync(filePath, "utf-8");
        const data: unknown = JSON.parse(raw);
        const exchanges = this.getExchanges(data);

        let sessionHadActivity = false;
        for (const exchange of exchanges) {
          const finishedAt = exchange?.finishedAt;
          if (typeof finishedAt === "string" && finishedAt.startsWith(targetDate)) {
            promptCount++;
            sessionHadActivity = true;
          }
        }
        if (sessionHadActivity) {
          sessionCount++;
        }
      } catch {
        // Skip malformed files
        continue;
      }
    }

    return { promptCount, sessionCount };
  }

  private static getExchanges(data: unknown): SessionExchange[] {
    if (Array.isArray(data)) {
      return data.filter(value => this.isSessionExchange(value));
    }

    if (this.isRecord(data) && Array.isArray(data.exchanges)) {
      return data.exchanges.filter(value => this.isSessionExchange(value));
    }

    return [];
  }

  private static isSessionExchange(value: unknown): value is SessionExchange {
    return this.isRecord(value);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
