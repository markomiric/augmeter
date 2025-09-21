import * as assert from "assert";
import * as vscode from "vscode";
import { AuthCommands } from "../commands/auth-commands";

suite("Smart Sign In (unit)", () => {
  function makeMocks() {
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
      getSmartSignInWebsiteWatchMs: () => 500,
    } as any;
    const auth = new AuthCommands(augmentDetector, usageTracker, statusBarManager, configManager);
    const disposables = auth.registerCommands();

    return { apiClient, augmentDetector, usageTracker, statusBarManager, calls, disposables };
  }

  test("Uses clipboard cookie to sign in and fetch without opening website", async function () {
    this.timeout(5000);
    const { calls, disposables } = makeMocks();

    // Put a valid-looking cookie in clipboard
    const token = "A".repeat(64);
    await vscode.env.clipboard.writeText(token);

    // Register a sentinel for fallback command
    let fallbackCalled = false;
    vscode.commands.registerCommand("augmeter.openWebsiteAndSignIn", async () => {
      fallbackCalled = true;
    });

    await vscode.commands.executeCommand("augmeter.smartSignIn");

    assert.strictEqual(calls.setSessionCookie > 0, true, "should set session cookie");
    assert.strictEqual(calls.testConnection > 0, true, "should validate connection");
    assert.strictEqual(calls.refreshNow > 0, true, "should refresh usage data");
    assert.strictEqual(calls.updateDisplay > 0, true, "should update status bar");
    assert.strictEqual(
      fallbackCalled,
      false,
      "should not fall back to website when clipboard is valid"
    );

    disposables.forEach(d => d.dispose?.());
  });

  test("Opens website and shows manual input when no cookie available", async function () {
    this.timeout(2000);
    const { calls, disposables } = makeMocks();

    // Empty clipboard
    await vscode.env.clipboard.writeText("");

    await vscode.commands.executeCommand("augmeter.smartSignIn");

    assert.strictEqual(calls.setSessionCookie, 0, "should not set cookie when no input provided");
    assert.strictEqual(
      calls.clearSessionCookie > 0,
      true,
      "should clear session before starting consistent flow"
    );

    disposables.forEach(d => d.dispose?.());
  });

  test("Allows repeated sign-in attempts sequentially (lock releases)", async function () {
    this.timeout(5000);
    const { calls, disposables } = makeMocks();

    const token = "B".repeat(64);
    await vscode.env.clipboard.writeText(token);

    await vscode.commands.executeCommand("augmeter.smartSignIn");
    await vscode.commands.executeCommand("augmeter.smartSignIn");

    assert.ok(
      calls.setSessionCookie >= 2,
      `expected multiple cookie sets, got ${calls.setSessionCookie}`
    );
    assert.ok(
      calls.testConnection >= 2,
      `expected multiple validations, got ${calls.testConnection}`
    );

    disposables.forEach((d: any) => d.dispose?.());
  });
});
