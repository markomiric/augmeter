/**
 * ABOUTME: Main extension entry point that activates and deactivates the Augmeter extension,
 * initializing all services and registering commands through the bootstrap process.
 */
import type * as vscode from "vscode";
import { SecureLogger } from "./core/logging/secure-logger";
import { ExtensionBootstrap } from "./bootstrap/extension-bootstrap";

let bootstrap: ExtensionBootstrap;

/**
 * Activates the Augmeter extension.
 *
 * This function is called by VS Code when the extension is activated.
 * It initializes the bootstrap process, which sets up all services,
 * registers commands, and starts data fetching.
 *
 * @param context - The VS Code extension context
 * @throws {Error} When initialization fails
 *
 * @example
 * ```typescript
 * // Called automatically by VS Code
 * await activate(context);
 * ```
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
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

/**
 * Deactivates the Augmeter extension.
 *
 * This function is called by VS Code when the extension is deactivated.
 * It disposes of all resources, stops timers, and cleans up subscriptions.
 *
 * @example
 * ```typescript
 * // Called automatically by VS Code
 * deactivate();
 * ```
 */
export function deactivate(): void {
  SecureLogger.info("Extension deactivation started");

  if (bootstrap) {
    bootstrap.dispose();
  }

  // Dispose secure logger last
  SecureLogger.dispose();
}
