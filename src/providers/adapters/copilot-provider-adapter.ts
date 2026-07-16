import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { type ProviderAdapter, type ProviderAdapterResult } from "../provider-adapter";
import { fileExists } from "../local-file-utils";

const execFileAsync = promisify(execFile);
const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

interface SqliteRow {
  key: string;
  value: string;
}

export type SqliteJsonQueryExecutor = (databasePath: string, sql: string) => Promise<string>;
export type CopilotApiFetcher = (
  input: string | URL | globalThis.Request,
  init?: RequestInit
) => Promise<Response>;

export interface CopilotApiSettings {
  enabled: boolean;
  username: string;
  tokenEnvVar: string;
  baseUrl: string;
  timeoutMs: number;
}

async function defaultQueryExecutor(databasePath: string, sql: string): Promise<string> {
  const { stdout } = await execFileAsync("sqlite3", ["-json", databasePath, sql], {
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

export class CopilotProviderAdapter implements ProviderAdapter {
  readonly id = "copilot";
  readonly displayName = "GitHub Copilot";

  private readonly minRefreshMs = 5 * 60 * 1000;
  private lastCollectedAt = 0;
  private lastResult: ProviderAdapterResult | null = null;

  constructor(
    private readonly resolveStateDbPath: () => string = () => "",
    private readonly queryExecutor: SqliteJsonQueryExecutor = defaultQueryExecutor,
    private readonly resolveApiSettings: () => CopilotApiSettings = () => ({
      enabled: false,
      username: "",
      tokenEnvVar: "GITHUB_TOKEN",
      baseUrl: DEFAULT_GITHUB_API_BASE_URL,
      timeoutMs: 6000,
    }),
    private readonly fetcher: CopilotApiFetcher = (...args) => fetch(...args)
  ) {}

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
          message: "GitHub Copilot activity is not read in untrusted workspaces.",
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

    let apiFallbackMessage: string | null = null;
    const apiSettings = this.resolveApiSettings();
    if (apiSettings.enabled) {
      const apiResult = await this.tryCollectFromApi(apiSettings, context.now);
      if (apiResult.result) {
        this.cache(apiResult.result, nowMs);
        return apiResult.result;
      }
      if (apiResult.errorMessage) {
        apiFallbackMessage = apiResult.errorMessage;
      }
    }

    const stateDbPath = this.resolvePath();
    if (!(await fileExists(stateDbPath))) {
      const result: ProviderAdapterResult = {
        snapshots: [],
        health: {
          providerId: this.id,
          status: "unavailable",
          checkedAt: context.now.toISOString(),
          canCollectInCurrentWorkspace: true,
          sourceKind: "file",
          message: apiFallbackMessage
            ? `${apiFallbackMessage} Augmeter also couldn't find local Copilot counters in VS Code.`
            : "No local GitHub Copilot counters were found in VS Code.",
          errorCode: "COPILOT_STATE_DB_MISSING",
        },
      };
      this.cache(result, nowMs);
      return result;
    }

    const query = "SELECT key, value FROM ItemTable WHERE key LIKE 'languageModelStats.copilot-%';";

    try {
      const stdout = await this.queryExecutor(stateDbPath, query);
      const rows = this.parseRows(stdout);
      if (rows.length === 0) {
        const result: ProviderAdapterResult = {
          snapshots: [],
          health: {
            providerId: this.id,
            status: "degraded",
            checkedAt: context.now.toISOString(),
            canCollectInCurrentWorkspace: true,
            sourceKind: "file",
            message: "No GitHub Copilot requests have been recorded in VS Code yet.",
            errorCode: "COPILOT_COUNTERS_MISSING",
          },
        };
        this.cache(result, nowMs);
        return result;
      }

      const requestCount = this.computeRequestCount(rows);
      const nowIso = context.now.toISOString();

      const result: ProviderAdapterResult = {
        snapshots: [
          {
            providerId: this.id,
            timestamp: nowIso,
            windowType: "custom",
            metricType: "messages",
            sourceKind: "file",
            source: "vscode-state-vscdb",
            used: requestCount,
            freshnessAt: nowIso,
            confidence: 0.7,
            details: {
              mode: "cumulative",
            },
          },
        ],
        health: {
          providerId: this.id,
          status: "connected",
          checkedAt: nowIso,
          canCollectInCurrentWorkspace: true,
          sourceKind: "file",
          message: apiFallbackMessage
            ? `${apiFallbackMessage} Showing local VS Code request counters instead.`
            : "Read cumulative GitHub Copilot requests from VS Code.",
        },
      };

      this.cache(result, nowMs);
      return result;
    } catch (error) {
      const message = this.getErrorMessage(error);
      const combinedMessage = apiFallbackMessage
        ? `${apiFallbackMessage} Local fallback failed: ${message}`
        : message;
      const result: ProviderAdapterResult = {
        snapshots: [],
        health: {
          providerId: this.id,
          status: "degraded",
          checkedAt: context.now.toISOString(),
          canCollectInCurrentWorkspace: true,
          sourceKind: "file",
          message: combinedMessage,
          errorCode: "COPILOT_QUERY_FAILED",
        },
      };
      this.cache(result, nowMs);
      return result;
    }
  }

  private async tryCollectFromApi(
    settings: CopilotApiSettings,
    now: Date
  ): Promise<{ result: ProviderAdapterResult | null; errorMessage?: string }> {
    const username = settings.username.trim();
    if (!username) {
      return {
        result: null,
        errorMessage:
          "GitHub Copilot API tracking needs a username in augmeter.providers.copilot.api.username.",
      };
    }

    const tokenEnvVar = settings.tokenEnvVar.trim();
    if (!tokenEnvVar) {
      return {
        result: null,
        errorMessage: "GitHub Copilot API tracking needs a token environment variable name.",
      };
    }

    const token = process.env[tokenEnvVar];
    if (!token || token.trim().length === 0) {
      return {
        result: null,
        errorMessage: `GitHub Copilot API tracking can't find the ${tokenEnvVar} environment variable.`,
      };
    }

    const timeoutMs = Math.max(1000, Math.min(30000, settings.timeoutMs || 6000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const baseUrl = this.normalizeApiBaseUrl(settings.baseUrl);
      const endpoint = `${baseUrl}/users/${encodeURIComponent(username)}/settings/billing/premium_request/usage`;
      const response = await this.fetcher(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.trim()}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        return {
          result: null,
          errorMessage: `GitHub Copilot returned HTTP ${response.status}.`,
        };
      }

      const payload = await response.json();
      const usage = this.parseApiUsagePayload(payload);
      if (!usage || usage.used === null) {
        return {
          result: null,
          errorMessage: "GitHub Copilot returned premium-request data Augmeter couldn't read.",
        };
      }

      const nowIso = now.toISOString();
      const windowType = this.resolveApiWindowType(usage.startDate, usage.endDate);
      const snapshot: ProviderAdapterResult["snapshots"][number] = {
        providerId: this.id,
        timestamp: nowIso,
        windowType,
        metricType: "messages",
        sourceKind: "api",
        source: "github-rest",
        used: usage.used,
        confidence: 0.95,
        freshnessAt: nowIso,
        details: {
          mode: "premium_requests",
          tokenEnvVar,
        },
      };

      if (usage.limit !== null) {
        snapshot.limit = usage.limit;
      }
      if (usage.remaining !== null) {
        snapshot.remaining = usage.remaining;
      }
      if (usage.limit !== null && usage.used !== null && usage.limit > 0) {
        snapshot.percentUsed = Math.round((usage.used / usage.limit) * 100);
      }
      if (usage.endDate) {
        snapshot.resetAt = usage.endDate;
      }
      if (usage.startDate && snapshot.details) {
        snapshot.details.startDate = usage.startDate;
      }
      if (usage.endDate && snapshot.details) {
        snapshot.details.endDate = usage.endDate;
      }

      return {
        result: {
          snapshots: [snapshot],
          health: {
            providerId: this.id,
            status: "connected",
            checkedAt: nowIso,
            canCollectInCurrentWorkspace: true,
            sourceKind: "api",
            message: "Read GitHub Copilot premium requests from GitHub.",
          },
        },
      };
    } catch (error) {
      const message = this.getErrorMessage(error);
      return {
        result: null,
        errorMessage: `GitHub Copilot API is unavailable (${message}).`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private cache(result: ProviderAdapterResult, nowMs: number): void {
    this.lastCollectedAt = nowMs;
    this.lastResult = result;
  }

  private resolvePath(): string {
    const configured = this.resolveStateDbPath().trim();
    if (configured.length > 0) {
      if (configured.startsWith("~/")) {
        return path.join(os.homedir(), configured.slice(2));
      }
      return configured;
    }

    if (process.platform === "darwin") {
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        "state.vscdb"
      );
    }

    if (process.platform === "win32") {
      const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
      return path.join(appData, "Code", "User", "globalStorage", "state.vscdb");
    }

    return path.join(os.homedir(), ".config", "Code", "User", "globalStorage", "state.vscdb");
  }

  private normalizeApiBaseUrl(baseUrl: string): string {
    const fallback = DEFAULT_GITHUB_API_BASE_URL;
    const value = baseUrl.trim();
    if (!value) {
      return fallback;
    }
    try {
      const parsed = new URL(value);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      return pathname && pathname !== "/" ? `${parsed.origin}${pathname}` : parsed.origin;
    } catch {
      return fallback;
    }
  }

  private resolveApiWindowType(
    startDate: string | null,
    endDate: string | null
  ): "monthly" | "custom" {
    if (!startDate || !endDate) {
      return "custom";
    }
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return "custom";
    }
    const days = (end - start) / (24 * 60 * 60 * 1000);
    return days <= 45 ? "monthly" : "custom";
  }

  private parseApiUsagePayload(raw: unknown): {
    used: number | null;
    limit: number | null;
    remaining: number | null;
    startDate: string | null;
    endDate: string | null;
  } | null {
    const data = this.asRecord(raw);
    if (!data) {
      return null;
    }

    const used =
      this.toFiniteNumberOrNull(data.total_usage) ??
      this.toFiniteNumberOrNull(data.usage) ??
      this.toFiniteNumberOrNull(data.used_premium_requests) ??
      this.toFiniteNumberOrNull(data.used);

    const totalAvailable =
      this.toFiniteNumberOrNull(data.total_available) ??
      this.toFiniteNumberOrNull(data.remaining) ??
      this.toFiniteNumberOrNull(data.available);

    const quota =
      this.toFiniteNumberOrNull(data.annual_quota) ??
      this.toFiniteNumberOrNull(data.monthly_quota) ??
      this.toFiniteNumberOrNull(data.included_premium_requests) ??
      this.toFiniteNumberOrNull(data.quota);

    let limit: number | null = quota ?? null;
    if (limit === null && used !== null && totalAvailable !== null) {
      limit = used + totalAvailable;
    }

    let remaining: number | null = totalAvailable ?? null;
    if (remaining === null && limit !== null && used !== null) {
      remaining = Math.max(limit - used, 0);
    }

    const startDate = typeof data.start_date === "string" ? data.start_date : null;
    const endDate = typeof data.end_date === "string" ? data.end_date : null;

    return {
      used,
      limit,
      remaining,
      startDate,
      endDate,
    };
  }

  private parseRows(raw: string): SqliteRow[] {
    if (!raw || raw.trim().length === 0) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(row => this.asRecord(row))
      .filter((row): row is Record<string, unknown> => row !== null)
      .map(row => ({
        key: typeof row.key === "string" ? row.key : "",
        value: typeof row.value === "string" ? row.value : "",
      }))
      .filter(row => row.key.length > 0);
  }

  private computeRequestCount(rows: SqliteRow[]): number {
    let total = 0;

    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        continue;
      }

      const data = this.asRecord(parsed);
      if (!data || !Array.isArray(data.extensions)) {
        continue;
      }

      for (const extensionEntry of data.extensions) {
        const extension = this.asRecord(extensionEntry);
        if (!extension) {
          continue;
        }

        const extensionCount = this.toFiniteNumber(extension.requestCount);
        const participantCount = Array.isArray(extension.participants)
          ? extension.participants.reduce((sum, participantEntry) => {
              const participant = this.asRecord(participantEntry);
              if (!participant) {
                return sum;
              }
              return sum + this.toFiniteNumber(participant.requestCount);
            }, 0)
          : 0;

        total += Math.max(extensionCount, participantCount);
      }
    }

    return total;
  }

  private toFiniteNumber(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    return value;
  }

  private toFiniteNumberOrNull(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private getErrorMessage(error: unknown): string {
    const errorRecord = this.asRecord(error);
    if (errorRecord) {
      const code = errorRecord.code;
      if (code === "ENOENT") {
        return "Install sqlite3 to read local GitHub Copilot activity";
      }
      if (code === "ABORT_ERR") {
        return "the request timed out";
      }
      const short = typeof errorRecord.message === "string" ? errorRecord.message : null;
      if (short) {
        return short;
      }
    }
    return "Augmeter couldn't read local GitHub Copilot counters.";
  }
}
