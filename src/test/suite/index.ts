import * as path from "path";
import * as fs from "fs";
import Mocha from "mocha";

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  const testsRoot = path.resolve(__dirname, "..");

  return new Promise((c, e) => {
    // Simple recursive file finder to replace glob
    const findTestFiles = (dir: string): string[] => {
      const files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...findTestFiles(fullPath));
        } else if (entry.name.endsWith(".test.js")) {
          files.push(path.relative(testsRoot, fullPath));
        }
      }
      return files;
    };

    try {
      const files = findTestFiles(testsRoot);
      // Add files to the test suite
      files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run((failures: number) => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (err) {
        console.error("Test execution failed:", err);
        e(err);
      }
    } catch (err) {
      console.error("Test file discovery failed:", err);
      e(err);
    }
  });
}
