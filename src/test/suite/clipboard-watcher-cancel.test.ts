import * as assert from "assert";
import * as vscode from "vscode";
import { watchClipboardForCookie } from "../../core/auth/clipboard-cookie-watcher";

suite("Clipboard Watcher (integration)", () => {
  test("returns null when cancelled via external token (simulates ESC)", async function () {
    this.timeout(5000);

    // Ensure clipboard state won't immediately resolve as a valid cookie
    await vscode.env.clipboard.writeText("");

    const cts = new vscode.CancellationTokenSource();

    // Start watcher with a long timeout but cancel almost immediately
    const promise = watchClipboardForCookie(300_000, 50, cts.token);

    // Simulate user pressing ESC on the progress notification by cancelling externally
    setTimeout(() => cts.cancel(), 100);

    const result = await promise;
    assert.strictEqual(result.cookie, null, "Watcher should resolve with null cookie on cancel");
  });
});
