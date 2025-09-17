import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Extension should be present", () => {
    assert.ok(vscode.extensions.getExtension("kamacode.augmeter"));
  });

  test("Extension should activate", async () => {
    const extension = vscode.extensions.getExtension("kamacode.augmeter");
    if (extension) {
      await extension.activate();
      assert.ok(extension.isActive);
    }
  });

  test("Commands should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      "augmeter.signIn",
      "augmeter.signOut",
      "augmeter.manualRefresh",
      "augmeter.openSettings",
    ];

    for (const command of expectedCommands) {
      assert.ok(commands.includes(command), `Command ${command} should be registered`);
    }
  });
});
