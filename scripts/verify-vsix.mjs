import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles, PackageManager } from "@vscode/vsce";
import { runVSCodeCommand } from "@vscode/test-electron";
import yauzl from "yauzl";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vsixFiles = (await readdir(projectRoot)).filter(name => name.endsWith(".vsix"));
if (vsixFiles.length !== 1) {
  throw new Error(`Expected exactly one VSIX, found ${vsixFiles.length}`);
}

const vsixPath = resolve(projectRoot, vsixFiles[0]);
const archiveStat = await stat(vsixPath);
if (archiveStat.size < 1_000) {
  throw new Error(`VSIX is unexpectedly small: ${archiveStat.size} bytes`);
}

const listedFiles = await listFiles({
  cwd: projectRoot,
  packageManager: PackageManager.None,
  packagedDependencies: [],
});
const archiveEntries = new Set(await readArchiveEntries(vsixPath));

const requiredFiles = [
  "package.json",
  "readme.md",
  "changelog.md",
  "LICENSE.txt",
  "images/icon.png",
  "out/extension.js",
];
for (const file of requiredFiles) {
  if (!archiveEntries.has(`extension/${file}`)) {
    throw new Error(`VSIX is missing required file: ${file}`);
  }
}

for (const file of listedFiles) {
  if (!archiveEntries.has(toArchivePath(file))) {
    throw new Error(`VSIX is missing file selected by .vscodeignore: ${file}`);
  }
}

const forbiddenPrefixes = [
  "extension/src/",
  "extension/out/test/",
  "extension/out/unit/",
  "extension/node_modules/",
  "extension/.github/",
  "extension/.env",
];
const forbiddenNames = new Set(["extension/package-lock.json", "extension/sbom.json"]);
const forbiddenEntry = Array.from(archiveEntries).find(
  entry =>
    forbiddenNames.has(entry) ||
    forbiddenPrefixes.some(prefix => entry.startsWith(prefix)) ||
    /^extension\/.*\.(?:pem|key)$/i.test(entry)
);
if (forbiddenEntry) {
  throw new Error(`VSIX contains a forbidden development or secret file: ${forbiddenEntry}`);
}

const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const extensionId = `${packageJson.publisher}.${packageJson.name}@${packageJson.version}`;
const vscodeVersion = process.env.VSCODE_VERSION ?? "1.104.1";
await runVSCodeCommand(["--install-extension", vsixPath, "--force"], { version: vscodeVersion });
const installedExtensions = await runVSCodeCommand(["--list-extensions", "--show-versions"], {
  version: vscodeVersion,
});
if (!installedExtensions.stdout.split(/\r?\n/).includes(extensionId)) {
  throw new Error(`VS Code did not report the installed VSIX as ${extensionId}`);
}

console.log(
  `VSIX smoke check passed: ${vsixFiles[0]} (${archiveEntries.size} entries, ${archiveStat.size} bytes, installed in VS Code ${vscodeVersion})`
);

function readArchiveEntries(filePath) {
  return new Promise((resolveEntries, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error("Could not open VSIX archive"));
        return;
      }

      const entries = [];
      zipFile.on("error", reject);
      zipFile.on("entry", entry => {
        entries.push(entry.fileName);
        zipFile.readEntry();
      });
      zipFile.on("end", () => resolveEntries(entries));
      zipFile.readEntry();
    });
  });
}

function toArchivePath(file) {
  if (file.toLowerCase() === "readme.md") {
    return "extension/readme.md";
  }
  if (file.toLowerCase() === "changelog.md") {
    return "extension/changelog.md";
  }
  if (file === "LICENSE") {
    return "extension/LICENSE.txt";
  }
  return `extension/${file}`;
}
