/**
 * ABOUTME: This file integrates the official Auggie CLI as an automatic usage source,
 * parsing `auggie account status` output so no session cookie is required.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { SecureLogger } from "../core/logging/secure-logger";
import { type AugmentUsageData } from "../core/types/augment";

const execFileAsync = promisify(execFile);

export type AuggieExecutor = (
  binary: string,
  args: string[],
  options: {
    timeout: number;
    maxBuffer: number;
    windowsHide: boolean;
    shell: boolean;
  }
) => Promise<{ stdout: string; stderr: string }>;

const defaultExecutor: AuggieExecutor = async (binary, args, options) => {
  const { stdout, stderr } = await execFileAsync(binary, args, options);
  return { stdout: String(stdout), stderr: String(stderr) };
};

export type AuggieParseResult =
  | { kind: "ok"; data: AugmentUsageData }
  | { kind: "unauthenticated" }
  | { kind: "unparsed" };

export type AuggieFetchResult =
  | { status: "ok"; data: AugmentUsageData }
  | { status: "unauthenticated" }
  | { status: "cli-missing" }
  | { status: "error"; error: string };

// ESC built via fromCharCode to keep control characters out of the source.
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
const BOX_DRAWING_PATTERN = /[─-╿]/g;

function sanitizeOutput(raw: string): string {
  return raw.replace(ANSI_PATTERN, " ").replace(BOX_DRAWING_PATTERN, " ");
}

function parseCount(text: string): number | null {
  const n = Number.parseInt(text.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseCycleEndDate(text: string): string | undefined {
  // CLI prints US-format dates, e.g. "ends 6/24/2026".
  const match = text.match(/ends\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!match) return undefined;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== month - 1) return undefined;
  return date.toISOString();
}

/**
 * Parse `auggie account status` output. Supports the current boxed format
 * ("74,722 credits remaining  Indie Plan" / "40,000 credits / month") and the
 * legacy format ("11,657 remaining · 953,170 / 964,827 credits used").
 */
export function parseAuggieAccountStatus(raw: string): AuggieParseResult {
  const text = sanitizeOutput(raw);

  if (/authentication failed/i.test(text) || /auggie login/i.test(text)) {
    return { kind: "unauthenticated" };
  }

  // Plan names are a single capitalized word followed by "Plan" (e.g. "Indie
  // Plan", "Max Plan"). Anchoring to one preceding word avoids swallowing
  // upstream text like "… credits remaining   Indie Plan".
  const planMatch = text.match(/\b([A-Z][A-Za-z]+)\s+Plan\b/);
  const subscriptionType = planMatch?.[1] ? `${planMatch[1]} Plan` : undefined;
  const renewalDate = parseCycleEndDate(text);

  const base: AugmentUsageData = {};
  if (subscriptionType) base.subscriptionType = subscriptionType;
  if (renewalDate) base.renewalDate = renewalDate;

  // Legacy format reports used/total directly.
  const usedMatch = text.match(/([\d,]+)\s*\/\s*([\d,]+)\s+credits used/i);
  if (usedMatch?.[1] && usedMatch[2]) {
    const used = parseCount(usedMatch[1]);
    const total = parseCount(usedMatch[2]);
    if (used !== null && total !== null) {
      return { kind: "ok", data: { ...base, totalUsage: used, usageLimit: total } };
    }
  }

  const remainingMatch = text.match(/([\d,]+)\s+credits remaining/i);
  const remaining = remainingMatch?.[1] ? parseCount(remainingMatch[1]) : null;
  if (remaining === null) {
    return { kind: "unparsed" };
  }

  const monthlyMatch = text.match(/([\d,]+)\s+credits\s*\/\s*month/i);
  const monthly = monthlyMatch?.[1] ? parseCount(monthlyMatch[1]) : null;

  // Rollover can push remaining above the monthly allotment; widen the limit so
  // the displayed "remaining" value stays exact.
  const usageLimit = monthly !== null ? Math.max(monthly, remaining) : remaining;
  const totalUsage = Math.max(usageLimit - remaining, 0);

  return { kind: "ok", data: { ...base, totalUsage, usageLimit } };
}

function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function isExecutableFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function binaryNames(): string[] {
  return process.platform === "win32" ? ["auggie.cmd", "auggie.exe", "auggie"] : ["auggie"];
}

function findInDirectory(dir: string): string | null {
  for (const name of binaryNames()) {
    const candidate = path.join(dir, name);
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

function pathDirectories(): string[] {
  return (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
}

function nvmVersionBinDirectories(): string[] {
  const versionsDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    return fs
      .readdirSync(versionsDir)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map(version => path.join(versionsDir, version, "bin"));
  } catch {
    return [];
  }
}

function wellKnownDirectories(): string[] {
  const home = os.homedir();
  const dirs = [
    path.join(home, ".nvm", "current", "bin"),
    ...nvmVersionBinDirectories(),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".volta", "bin"),
  ];
  if (process.platform === "win32" && process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, "npm"));
  }
  return dirs;
}

/**
 * Fetches Augment usage by running `auggie account status`. The CLI performs
 * its own authenticated call; this source never reads or stores credentials.
 */
export class AuggieCliSource {
  private static readonly resultCacheMs = 5_000;
  private static readonly commandTimeoutMs = 15_000;

  private detectedBinary: string | null | undefined;
  private inFlight: Promise<AuggieFetchResult> | null = null;
  private lastResult: { at: number; result: AuggieFetchResult } | null = null;

  constructor(
    private readonly resolveCliPath: () => string = () => "",
    private readonly exec: AuggieExecutor = defaultExecutor
  ) {}

  /** Invalidate cached detection and results (e.g. after a config change). */
  reset(): void {
    this.detectedBinary = undefined;
    this.lastResult = null;
  }

  isCliDetectedCached(): boolean {
    return typeof this.detectedBinary === "string";
  }

  isAuthenticatedCached(): boolean {
    return this.lastResult?.result.status === "ok";
  }

  async detectBinary(): Promise<string | null> {
    if (this.detectedBinary !== undefined) {
      return this.detectedBinary;
    }

    const override = expandHome(this.resolveCliPath().trim());
    if (override) {
      // An explicit override must not silently fall back to another binary.
      this.detectedBinary = isExecutableFile(override) ? override : null;
      if (!this.detectedBinary) {
        SecureLogger.warn("Configured auggieCli.path does not exist", { path: override });
      }
      return this.detectedBinary;
    }

    for (const dir of [...pathDirectories(), ...wellKnownDirectories()]) {
      const found = findInDirectory(dir);
      if (found) {
        this.detectedBinary = found;
        SecureLogger.info("Auggie CLI detected", { path: found });
        return found;
      }
    }

    this.detectedBinary = null;
    return null;
  }

  async fetchUsage(): Promise<AuggieFetchResult> {
    const cached = this.lastResult;
    if (cached && Date.now() - cached.at < AuggieCliSource.resultCacheMs) {
      return cached.result;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.doFetch().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doFetch(): Promise<AuggieFetchResult> {
    const binary = await this.detectBinary();
    if (!binary) {
      return this.store({ status: "cli-missing" });
    }

    try {
      // Node >= 20.12 refuses to execFile .cmd/.bat without a shell
      // (CVE-2024-27980). Args are constant literals; only the binary path
      // needs quoting for the shell case.
      const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(binary);
      const command = useShell ? `"${binary}"` : binary;
      const { stdout, stderr } = await this.exec(command, ["account", "status"], {
        timeout: AuggieCliSource.commandTimeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        shell: useShell,
      });

      const parsed = parseAuggieAccountStatus(`${stdout}\n${stderr}`);
      if (parsed.kind === "ok") {
        return this.store({ status: "ok", data: parsed.data });
      }
      if (parsed.kind === "unauthenticated") {
        return this.store({ status: "unauthenticated" });
      }
      SecureLogger.warn("Unrecognized auggie account status output", {
        preview: sanitizeOutput(stdout).slice(0, 120),
      });
      return this.store({ status: "error", error: "Unrecognized CLI output" });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        this.detectedBinary = undefined;
        return this.store({ status: "cli-missing" });
      }
      const message = error instanceof Error ? error.message : String(error);
      SecureLogger.warn("Auggie CLI invocation failed", { code, message: message.slice(0, 200) });
      return this.store({ status: "error", error: message });
    }
  }

  private store(result: AuggieFetchResult): AuggieFetchResult {
    this.lastResult = { at: Date.now(), result };
    return result;
  }
}
