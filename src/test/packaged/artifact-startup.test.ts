import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

suite("Packaged VSIX Test Suite", () => {
  test("activates from the isolated installed extension directory", async () => {
    const extension = vscode.extensions.getExtension("kamacode.augmeter");
    assert.ok(extension, "The packaged Augmeter extension should be installed");

    const sourceRoot = process.env.AUGMETER_SOURCE_ROOT;
    assert.ok(sourceRoot, "The packaged test runner should identify the source checkout");
    assert.notStrictEqual(
      path.resolve(extension.extensionPath),
      path.resolve(sourceRoot),
      "The extension host must load the installed VSIX, not the development checkout"
    );
    assert.match(
      extension.extensionPath,
      /[\\/]\.vscode-test[\\/]extensions[\\/]/,
      "The extension should run from the isolated VS Code test profile"
    );

    await extension.activate();
    assert.strictEqual(extension.isActive, true, "The packaged extension should activate");

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("augmeter.openUsageDashboard"));
    await vscode.commands.executeCommand("augmeter.openUsageDashboard");
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });
});
