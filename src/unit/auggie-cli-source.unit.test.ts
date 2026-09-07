import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuggieCliSource,
  parseAuggieAccountStatus,
  type AuggieExecutor,
} from "../services/auggie-cli-source";

const ESC = String.fromCharCode(27);

const CURRENT_OUTPUT = [
  "╭ Account ───────────────────────────────────────────────╮",
  "│                                                        │",
  `│ ${ESC}[1m74,722 credits remaining${ESC}[0m                    Indie Plan │`,
  "│                                 40,000 credits / month │",
  "│                                                        │",
  "╰────────────────────────────────────────────────────────╯",
  "",
  " 11 days remaining in this billing cycle (ends 6/24/2026)",
  " For more detail, visit https://app.augmentcode.com/account",
].join("\n");

const LEGACY_OUTPUT = [
  "Max Plan 450,000 credits / month",
  "11,657 remaining · 953,170 / 964,827 credits used",
  "2 days remaining in this billing cycle (ends 1/8/2026)",
].join("\n");

describe("parseAuggieAccountStatus", () => {
  it("parses the current boxed format with ANSI and box-drawing characters", () => {
    const result = parseAuggieAccountStatus(CURRENT_OUTPUT);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.usageLimit).toBe(74722);
    expect(result.data.totalUsage).toBe(0);
    expect(result.data.remainingCredits).toBe(74722);
    expect(result.data.monthlyAllowance).toBe(40000);
    expect(result.data.usageKnown).toBe(false);
    expect(result.data.subscriptionType).toBe("Indie Plan");
    expect(result.data.renewalDate).toBe("2026-06-24T00:00:00.000Z");
  });

  it("keeps remaining exact when below the monthly allotment", () => {
    const result = parseAuggieAccountStatus(
      "12,000 credits remaining  Indie Plan\n40,000 credits / month"
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // remaining = limit - used = 40,000 - 28,000 = 12,000
    expect(result.data.usageLimit).toBe(40000);
    expect(result.data.totalUsage).toBe(28000);
    expect(result.data.remainingCredits).toBe(12000);
    expect(result.data.monthlyAllowance).toBe(40000);
    expect(result.data.usageKnown).toBe(false);
  });

  it("parses the legacy used/total format directly", () => {
    const result = parseAuggieAccountStatus(LEGACY_OUTPUT);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.totalUsage).toBe(953170);
    expect(result.data.usageLimit).toBe(964827);
    expect(result.data.remainingCredits).toBe(11657);
    expect(result.data.usageKnown).toBe(true);
    expect(result.data.subscriptionType).toBe("Max Plan");
    expect(result.data.renewalDate).toBe("2026-01-08T00:00:00.000Z");
  });

  it("detects unauthenticated output", () => {
    expect(parseAuggieAccountStatus("Authentication failed. Please retry.").kind).toBe(
      "unauthenticated"
    );
    expect(parseAuggieAccountStatus("Run `auggie login` to get started.").kind).toBe(
      "unauthenticated"
    );
  });

  it("returns unparsed for unrecognized output", () => {
    expect(parseAuggieAccountStatus("Welcome to Auggie 1.0").kind).toBe("unparsed");
    expect(parseAuggieAccountStatus("").kind).toBe("unparsed");
  });

  it("handles remaining without a monthly line", () => {
    const result = parseAuggieAccountStatus("500 credits remaining");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.usageLimit).toBe(500);
    expect(result.data.totalUsage).toBe(0);
  });

  it("handles zero remaining", () => {
    const result = parseAuggieAccountStatus("0 credits remaining\n40,000 credits / month");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.usageLimit).toBe(40000);
    expect(result.data.totalUsage).toBe(40000);
  });

  it("omits the renewal date when invalid", () => {
    const result = parseAuggieAccountStatus(
      "100 credits remaining\nbilling cycle (ends 13/45/2026)"
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.renewalDate).toBeUndefined();
  });
});

describe("AuggieCliSource", () => {
  const tempDirs: string[] = [];

  function makeTempBinary(name = "auggie"): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-test-"));
    tempDirs.push(dir);
    const file = path.join(dir, name);
    fs.writeFileSync(file, "#!/bin/sh\n", { mode: 0o755 });
    return file;
  }

  function makeExec(
    impl: (binary: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
  ): { exec: AuggieExecutor; calls: { binary: string; args: string[]; options: unknown }[] } {
    const calls: { binary: string; args: string[]; options: unknown }[] = [];
    const exec: AuggieExecutor = async (binary, args, options) => {
      calls.push({ binary, args, options });
      return impl(binary, args);
    };
    return { exec, calls };
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the configured path override when it exists", async () => {
    const binary = makeTempBinary();
    const source = new AuggieCliSource(() => binary);
    expect(await source.detectBinary()).toBe(binary);
    expect(source.isCliDetectedCached()).toBe(true);
  });

  it("does not fall back when the configured override is missing", async () => {
    const source = new AuggieCliSource(() => "/nonexistent/path/auggie");
    expect(await source.detectBinary()).toBeNull();
  });

  it("finds the binary on PATH", async () => {
    const binary = makeTempBinary();
    const originalPath = process.env.PATH;
    process.env.PATH = path.dirname(binary);
    try {
      const source = new AuggieCliSource(() => "");
      expect(await source.detectBinary()).toBe(binary);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("fetches and parses usage via the injected executor", async () => {
    const binary = makeTempBinary();
    const { exec, calls } = makeExec(async () => ({ stdout: CURRENT_OUTPUT, stderr: "" }));
    const source = new AuggieCliSource(() => binary, exec);

    const result = await source.fetchUsage();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.usageLimit).toBe(74722);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["account", "status"]);
    expect(source.isAuthenticatedCached()).toBe(true);
  });

  it("debounces consecutive fetches via the result cache", async () => {
    const binary = makeTempBinary();
    const { exec, calls } = makeExec(async () => ({ stdout: CURRENT_OUTPUT, stderr: "" }));
    const source = new AuggieCliSource(() => binary, exec);

    await source.fetchUsage();
    await source.fetchUsage();
    expect(calls).toHaveLength(1);

    source.reset();
    await source.fetchUsage();
    expect(calls).toHaveLength(2);
  });

  it("discards an in-flight result after the source is reset", async () => {
    const binary = makeTempBinary();
    let release!: (value: { stdout: string; stderr: string }) => void;
    const exec: AuggieExecutor = async () =>
      await new Promise(resolve => {
        release = resolve;
      });
    const source = new AuggieCliSource(() => binary, exec);

    const pending = source.fetchUsage();
    await Promise.resolve();
    source.reset();
    release({ stdout: CURRENT_OUTPUT, stderr: "" });

    await expect(pending).resolves.toEqual({
      status: "error",
      error: "CLI refresh discarded after the data source changed.",
    });
    expect(source.isAuthenticatedCached()).toBe(false);
  });

  it("maps unauthenticated CLI output", async () => {
    const binary = makeTempBinary();
    const { exec } = makeExec(async () => ({
      stdout: "Authentication failed. Run auggie login.",
      stderr: "",
    }));
    const source = new AuggieCliSource(() => binary, exec);

    expect((await source.fetchUsage()).status).toBe("unauthenticated");
    expect(source.isAuthenticatedCached()).toBe(false);
  });

  it("maps ENOENT to cli-missing and unrecognized output to error", async () => {
    const binary = makeTempBinary();
    const enoent = Object.assign(new Error("spawn auggie ENOENT"), { code: "ENOENT" });
    const { exec: failingExec } = makeExec(async () => {
      throw enoent;
    });
    const missing = new AuggieCliSource(() => binary, failingExec);
    expect((await missing.fetchUsage()).status).toBe("cli-missing");

    const { exec: garbageExec } = makeExec(async () => ({ stdout: "boom", stderr: "" }));
    const erroring = new AuggieCliSource(() => binary, garbageExec);
    erroring.reset();
    expect((await erroring.fetchUsage()).status).toBe("error");
  });

  it("reports cli-missing when no binary can be found", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-dir-for-augmeter-tests";
    try {
      const source = new AuggieCliSource(() => "/nonexistent/override/auggie");
      expect((await source.fetchUsage()).status).toBe("cli-missing");
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
