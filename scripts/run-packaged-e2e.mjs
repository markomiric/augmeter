import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runVSCodeCommand, VSCodeCommandError } from "@vscode/test-electron";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const testCliEntry = require.resolve("@vscode/test-cli");
const extensionTestsPath = resolve(dirname(testCliEntry), "runner.cjs");
const testExtensionPath = resolve(projectRoot, "scripts/packaged-test-extension");
const userDataDir = await mkdtemp(join(tmpdir(), "augmeter-packaged-e2e-"));
const vscodeVersion = process.env.VSCODE_VERSION ?? "1.104.1";
const files = [
  resolve(projectRoot, "out/test/packaged/artifact-startup.test.js"),
  resolve(projectRoot, "out/test/suite/lifecycle.e2e.test.js"),
];
const testEnvironment = {
  ...process.env,
  AUGMETER_SOURCE_ROOT: projectRoot,
  VSCODE_TEST_OPTIONS: JSON.stringify({
    mochaOpts: {
      ui: "tdd",
      timeout: 20_000,
      reporter: "spec",
    },
    colorDefault: false,
    preload: [],
    files,
  }),
};
delete testEnvironment.ELECTRON_RUN_AS_NODE;

const launchArgs = [
  projectRoot,
  "--no-sandbox",
  "--disable-gpu-sandbox",
  "--disable-updates",
  "--skip-welcome",
  "--skip-release-notes",
  "--disable-workspace-trust",
  `--extensions-dir=${resolve(projectRoot, ".vscode-test/extensions")}`,
  `--user-data-dir=${userDataDir}`,
  `--extensionDevelopmentPath=${testExtensionPath}`,
  `--extensionTestsPath=${extensionTestsPath}`,
];

try {
  const result = await runVSCodeCommand(launchArgs, {
    version: vscodeVersion,
    spawn: { env: testEnvironment },
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  console.log(`Packaged extension-host E2E passed in VS Code ${vscodeVersion}`);
} catch (error) {
  if (error instanceof VSCodeCommandError) {
    process.stdout.write(error.stdout);
    process.stderr.write(error.stderr);
  }
  throw error;
} finally {
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
