import { describe, it, expect } from "vitest";
import * as vscode from "vscode";
import { AuthCommands } from "../commands/auth-commands";

describe("Smart Sign In (unit)", () => {
  function makeMocks(options?: { quickWatchMs?: number; websiteWatchMs?: number }) {
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

    const augmentDetector = {
      getApiClient: () => apiClient,
      clearAuthCache: () => {},
    } as any;

    const usageTracker = {
      refreshNow: async () => {
        calls.refreshNow++;
      },
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
      getDataSource: () => "cookie",
    } as any;

    const auggieCliSource = {
      detectBinary: async () => null,
      fetchUsage: async () => ({ status: "cli-missing" }),
      isAuthenticatedCached: () => false,
      reset: () => {},
    } as any;

    const storageManager = {
      isCliAuthDisabled: () => false,
      setCliAuthDisabled: async () => {},
    } as any;

    const auth = new AuthCommands(
      augmentDetector,
      usageTracker,
      statusBarManager,
      configManager,
      auggieCliSource,
      storageManager
    );
    const disposables = auth.registerCommands();

    return { apiClient, augmentDetector, usageTracker, statusBarManager, calls, disposables };
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
});
