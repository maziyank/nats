import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function listFilesRecursively(rootDir: string): string[] {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(entryPath));
      continue;
    }
    files.push(entryPath);
  }

  return files;
}

function isSourceFile(filePath: string) {
  return /\.(ts|tsx|js|jsx|mts)$/.test(filePath);
}

// Known exceptions: files that legitimately need to import from app/ until refactored
const KNOWN_EXCEPTIONS = new Set([
  // AI report tools call app-layer report actions; will be refactored to use services directly
  "lib/ai/tools/report-tools.ts",
]);

describe("Architecture boundaries", () => {
  it("prevents lib/ from importing from app/", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const libRoot = path.join(repoRoot, "lib");
    const files = listFilesRecursively(libRoot).filter(isSourceFile);

    const offenders: Array<{ file: string; line: string }> = [];
    const importPattern = /from\s+["']@\/app\//;
    const requirePattern = /require\(\s*["']@\/app\//;

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (importPattern.test(line) || requirePattern.test(line)) {
          const relativePath = path.relative(repoRoot, file);
          if (!KNOWN_EXCEPTIONS.has(relativePath)) {
            offenders.push({
              file: relativePath,
              line: line.trim(),
            });
          }
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

