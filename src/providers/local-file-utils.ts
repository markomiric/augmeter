import { promises as fs, type Dirent } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function resolveHomePath(
  customPath: string | undefined,
  fallbackSegments: string[]
): string {
  const normalized = customPath?.trim() ?? "";
  if (normalized.length > 0) {
    if (normalized.startsWith("~/")) {
      return path.join(os.homedir(), normalized.slice(2));
    }
    return normalized;
  }
  return path.join(os.homedir(), ...fallbackSegments);
}

export async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function collectFilesRecursive(
  rootDir: string,
  includeFile: (fileName: string) => boolean,
  skipDirectories: Set<string> = new Set()
): Promise<string[]> {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    const entries: Array<Dirent<string> | Dirent<Buffer>> = await fs.readdir(currentDir, {
      withFileTypes: true,
      encoding: "utf8",
    });

    for (const entry of entries) {
      const entryName = typeof entry.name === "string" ? entry.name : entry.name.toString("utf8");
      const fullPath = path.join(currentDir, entryName);
      if (entry.isDirectory()) {
        if (!skipDirectories.has(entryName)) {
          stack.push(fullPath);
        }
        continue;
      }
      if (entry.isFile() && includeFile(entryName)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}
