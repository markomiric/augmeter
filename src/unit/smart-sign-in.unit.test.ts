import { describe, it, expect, vi } from "vitest";
import * as vscode from "vscode";
import { AuthCommands } from "../commands/auth-commands";

describe("Smart Sign In (unit)", () => {
  function makeMocks(options?: {
    quickWatchMs?: number;
    websiteWatchMs?: number;
    refreshSucceeded?: boolean;
    providerHealth?: Array<Record<string, unknown>>;
    dataSource?: "cookie" | "auto" | "auggie-cli";
    cliBinary?: string | null;
    cliResult?: Record<string, unknown>;
  }) {
    const calls: any = {
      setSessionCookie: 0,
      testConnection: 0,
      clearSessionCookie: 0,
      refreshNow: 0,
      updateDisplay: 0,
    };

    const apiClient = {
      hasCookie: () => false,
      setSessionCookie: (_c: string) => {
        calls.setSessionCookie++;
      },
      testConnection: async () => {
        calls.testConnection++;
        return { success: true } as any;
      },
      clearSessionCookie: async () => {
        calls.clearSessionCookie++;
      },
    } as any;

    const usageTracker = {
      refreshNow: async () => {
        calls.refreshNow++;
        return options?.refreshSucceeded ?? true;
      },
      getProviderHealthSnapshots: async () => options?.providerHealth ?? [],
    } as any;

    const statusBarManager = {
      showLoading: () => {},
      updateDisplay: async () => {
        calls.updateDisplay++;
      },
    } as any;

    const configManager = {
      getSmartSignInQuickWatchMs: () => options?.quickWatchMs ?? 0,
      getSmartSignInWebsiteWatchMs: () => options?.websiteWatchMs ?? 500,
      getDataSource: () => options?.dataSource ?? "cookie",
    } as any;

    const auggieCliSource = {
      detectBinary: async () => options?.cliBinary ?? null,
      fetchUsage: async () => options?.cliResult ?? { status: "cli-missing" },
      isAuthenticatedCached: () => false,
      reset: () => {},
    } as any;

    const storageManager = {
      isCliAuthDisabled: () => false,
      setCliAuthDisabled: async () => {},
    } as any;

    const auth = new AuthCommands(
      apiClient,
      usageTracker,
      statusBarManager,
      configManager,
      auggieCliSource,
      storageManager
    );
    const disposables = auth.registerCommands();

    return { apiClient, usageTracker, statusBarManager, calls, disposables };
  }

  it("Uses clipboard cookie to sign in and fetch without opening website", async () => {
    const { calls, disposables } = makeMocks({ quickWatchMs: 200, websiteWatchMs: 500 });

    // Put a valid-looking cookie in clipboard
    const token = "A".repeat(64);
    await vscode.env.clipboard.writeText(token);

    // Register a sentinel for fallback command
    let fallbackCalled = false;
    vscode.commands.registerCommand("augmeter.openWebsiteAndSignIn", async () => {
      fallbackCalled = true;
    });

    await vscode.commands.executeCommand("augmeter.smartSignIn");

    expect(calls.setSessionCookie).toBeGreaterThan(0);
    expect(calls.testConnection).toBeGreaterThan(0);
    expect(calls.refreshNow).toBeGreaterThan(0);
    expect(calls.updateDisplay).toBeGreaterThan(0);
    expect(fallbackCalled).toBe(false);

    disposables.forEach(d => d.dispose?.());
  }, 5000);

  it("Uses quick clipboard watch before opening the website", async () => {
    const { calls, disposables } = makeMocks({ quickWatchMs: 200, websiteWatchMs: 500 });

    await vscode.env.clipboard.writeText("");
    setTimeout(() => {
      void vscode.env.clipboard.writeText("C".repeat(64));
    }, 50);

    await vscode.commands.executeCommand("augmeter.smartSignIn");

    expect(calls.setSessionCookie).toBeGreaterThan(0);
    expect(calls.clearSessionCookie).toBe(0);

    disposables.forEach(d => d.dispose?.());
  }, 5000);

  it("Opens website and shows manual input when no cookie available", async () => {
    const { calls, disposables } = makeMocks({ quickWatchMs: 0, websiteWatchMs: 500 });

    // Empty clipboard
    await vscode.env.clipboard.writeText("");

    await vscode.commands.executeCommand("augmeter.smartSignIn");

    expect(calls.setSessionCookie).toBe(0);
    expect(calls.clearSessionCookie).toBeGreaterThan(0);

    disposables.forEach(d => d.dispose?.());
  }, 2000);

  it("Allows repeated sign-in attempts sequentially (lock releases)", async () => {
    const { calls, disposables } = makeMocks({ quickWatchMs: 200, websiteWatchMs: 500 });

    const token = "B".repeat(64);
    await vscode.env.clipboard.writeText(token);

    await vscode.commands.executeCommand("augmeter.smartSignIn");
    await vscode.commands.executeCommand("augmeter.smartSignIn");

    expect(calls.setSessionCookie).toBeGreaterThanOrEqual(2);
    expect(calls.testConnection).toBeGreaterThanOrEqual(2);

    disposables.forEach((d: any) => d.dispose?.());
  }, 5000);

  it("does not claim credits loaded when the authenticated refresh fails", async () => {
    vi.clearAllMocks();
    const { disposables } = makeMocks({
      quickWatchMs: 200,
      refreshSucceeded: false,
      providerHealth: [
        {
          providerId: "augment",
          status: "degraded",
          checkedAt: new Date().toISOString(),
          canCollectInCurrentWorkspace: true,
          message: "Augment credits couldn't be refreshed. Showing the last known data.",
        },
      ],
    });
    const token = "D".repeat(64);
    await vscode.env.clipboard.writeText(token);

    await vscode.commands.executeCommand("augmeter.smartSignIn");

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Augment connected, but Augment credits couldn't be refreshed. Try again.",
      "Retry"
    );
    expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalledWith(
      "✅ Augment connected",
      expect.any(Number)
    );

    disposables.forEach(d => d.dispose?.());
  }, 5000);

  it("keeps a healthy credit result separate from unrelated activity failure", async () => {
    vi.clearAllMocks();
    const { disposables } = makeMocks({
      quickWatchMs: 200,
      refreshSucceeded: false,
      providerHealth: [
        {
          providerId: "augment",
          status: "connected",
          checkedAt: new Date().toISOString(),
          canCollectInCurrentWorkspace: true,
        },
        {
          providerId: "claude",
          status: "degraded",
          checkedAt: new Date().toISOString(),
          canCollectInCurrentWorkspace: true,
        },
      ],
    });
    await vscode.env.clipboard.writeText("E".repeat(64));

    await vscode.commands.executeCommand("augmeter.smartSignIn");

    expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
      "✅ Augment connected; some assistant activity couldn't be refreshed",
      expect.any(Number)
    );
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();

    disposables.forEach(d => d.dispose?.());
  }, 5000);

  it("shows a retry action for a CLI-only read error", async () => {
    vi.clearAllMocks();
    const { disposables } = makeMocks({
      dataSource: "auggie-cli",
      cliBinary: "auggie",
      cliResult: { status: "error", error: "private CLI detail" },
    });

    await vscode.commands.executeCommand("augmeter.signIn");

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Augmeter couldn't read Auggie CLI credits. Check the CLI and try again.",
      "Retry"
    );

    disposables.forEach(d => d.dispose?.());
  }, 5000);
});
