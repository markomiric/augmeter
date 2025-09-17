import * as vscode from "vscode";
import { SecureLogger } from "./core/logging/secure-logger";
import { ExtensionBootstrap } from "./bootstrap/extension-bootstrap";

let bootstrap: ExtensionBootstrap;

export async function activate(context: vscode.ExtensionContext) {
  // Initialize secure logging
  SecureLogger.init("Augmeter");
  SecureLogger.info("Extension activation started");

  try {
    // Initialize bootstrap
    bootstrap = new ExtensionBootstrap();
    await bootstrap.initialize(context);

    // Register all disposables
    const disposables = bootstrap.getDisposables();
    disposables.forEach(disposable => context.subscriptions.push(disposable));

    SecureLogger.info("Extension activation completed successfully");
  } catch (error) {
    SecureLogger.error("Extension activation failed", error);
    throw error;
  }
}

export function deactivate() {
  SecureLogger.info("Extension deactivation started");

  if (bootstrap) {
    bootstrap.dispose();
  }

  // Dispose secure logger last
  SecureLogger.dispose();
}
