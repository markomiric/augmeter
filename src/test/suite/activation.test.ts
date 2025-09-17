import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Activation Test Suite", () => {
  test("Extension should activate on command execution", async () => {
    const extension = vscode.extensions.getExtension("kamacode.augmeter");
    assert.ok(extension, "Extension should be found");

    // Extension should not be active initially (lazy activation)
    if (!extension.isActive) {
      // Try to activate by executing a command
      try {
        await vscode.commands.executeCommand("augmeter.manualRefresh");
        // After command execution, extension should be active
        assert.ok(extension.isActive, "Extension should be active after command execution");
      } catch (error) {
        // Command execution might fail due to missing dependencies in test environment
        // but the extension should still activate
        assert.ok(extension.isActive, "Extension should be active even if command fails");
      }
    }
  });

  test("All expected commands should be registered after activation", async () => {
    const extension = vscode.extensions.getExtension("kamacode.augmeter");
    if (extension && !extension.isActive) {
      await extension.activate();
    }

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

  test("Extension should have correct metadata", () => {
    const extension = vscode.extensions.getExtension("kamacode.augmeter");
    assert.ok(extension, "Extension should be found");

    const packageJSON = extension.packageJSON;
    assert.strictEqual(packageJSON.name, "augmeter", "Extension name should be 'augmeter'");
    assert.strictEqual(
      packageJSON.displayName,
      "Augmeter",
      "Extension display name should be 'Augmeter'"
    );
    assert.ok(packageJSON.version, "Extension should have a version");
    // Extension should activate on startup to ensure status bar is available immediately
    assert.ok(packageJSON.activationEvents, "activationEvents should be present");
    assert.ok(
      Array.isArray(packageJSON.activationEvents),
      "activationEvents must be an array when present"
    );
    assert.ok(
      packageJSON.activationEvents.includes("onStartupFinished"),
      "Should include onStartupFinished activation for immediate status bar"
    );
  });

  test("Extension should have proper contribution points", () => {
    const extension = vscode.extensions.getExtension("kamacode.augmeter");
    assert.ok(extension, "Extension should be found");

    const packageJSON = extension.packageJSON;
    const contributes = packageJSON.contributes;

    assert.ok(contributes, "Extension should have contributes section");
    assert.ok(Array.isArray(contributes.commands), "Extension should contribute commands");
    assert.ok(contributes.configuration, "Extension should contribute configuration");

    // Verify configuration properties exist (reduced, simplified set)
    const configProps = contributes.configuration.properties;
    assert.ok(configProps["augmeter.enabled"], "Should have enabled configuration");
    assert.ok(configProps["augmeter.refreshInterval"], "Should have refreshInterval configuration");
    assert.ok(configProps["augmeter.clickAction"], "Should have clickAction configuration");
    assert.ok(configProps["augmeter.displayMode"], "Should have displayMode configuration");
    assert.ok(configProps["augmeter.apiBaseUrl"], "Should have apiBaseUrl configuration");
  });
});
