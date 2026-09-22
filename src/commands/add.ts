import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir, hashObject } from "../core/objects.js";
import { readIndex, writeIndex, IndexEntry } from "../core/index.js";

export interface AddOptions {
  paths: string[];
  workTree?: string;
  gitDir?: string;
}

/**
 * Recursively collects all file paths if a directory is given.
 */
function collectFiles(targetPath: string): string[] {
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return [targetPath];
  }

  const results: string[] = [];
  const entries = fs.readdirSync(targetPath);

  for (const entry of entries) {
    if (entry === ".git") continue; // Skip .git directory
    const full = path.join(targetPath, entry);
    const subStat = fs.statSync(full);
    if (subStat.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (subStat.isFile()) {
      results.push(full);
    }
  }

  return results;
}

/**
 * Adds file contents to the staging area (.git/index) as blobs.
 */
export function runAdd(options: AddOptions): void {
  const resolvedGitDir = options.gitDir || findGitDir();
  const resolvedWorkTree = options.workTree || path.dirname(resolvedGitDir);

  const existingEntries = readIndex(resolvedGitDir);
  const entryMap = new Map<string, IndexEntry>();

  for (const entry of existingEntries) {
    entryMap.set(entry.path, entry);
  }

  for (const inputPath of options.paths) {
    const absPath = path.resolve(resolvedWorkTree, inputPath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`fatal: pathspec '${inputPath}' did not match any files`);
    }

    const filesToAdd = collectFiles(absPath);

    for (const filePath of filesToAdd) {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath);

      // 1. Store blob in .git/objects/
      const { oid } = hashObject(content, "blob", true, resolvedGitDir);

      // 2. Relative path in git index format (always forward slash)
      let relPath = path.relative(resolvedWorkTree, filePath);
      relPath = relPath.split(path.sep).join("/");

      // 3. Determine file mode (regular 100644 vs executable 100755)
      const isExecutable = Boolean(stat.mode & 0o111);
      const mode = isExecutable ? 0o100755 : 0o100644;

      const ctimeSec = Math.floor(stat.ctimeMs / 1000);
      const ctimeNano = Math.floor((stat.ctimeMs % 1000) * 1_000_000);
      const mtimeSec = Math.floor(stat.mtimeMs / 1000);
      const mtimeNano = Math.floor((stat.mtimeMs % 1000) * 1_000_000);

      const entry: IndexEntry = {
        ctimeSec,
        ctimeNano,
        mtimeSec,
        mtimeNano,
        dev: stat.dev,
        ino: stat.ino,
        mode,
        uid: stat.uid,
        gid: stat.gid,
        size: stat.size,
        oid,
        flags: 0,
        path: relPath,
      };

      entryMap.set(relPath, entry);
    }
  }

  writeIndex(Array.from(entryMap.values()), resolvedGitDir);
}
