import * as fs from "node:fs";
import * as path from "node:path";
import { readObject } from "./objects.js";
import { readIndex, writeIndex, IndexEntry } from "./index.js";
import { getTreeFiles } from "./status.js";

/**
 * Removes empty directories recursively up to workTree.
 */
function removeEmptyParentDirs(filePath: string, workTree: string): void {
  let dir = path.dirname(filePath);
  while (dir !== workTree && dir.startsWith(workTree)) {
    try {
      const files = fs.readdirSync(dir);
      if (files.length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

/**
 * Restores a snapshot defined by treeOid onto the working directory and rebuilds .git/index.
 */
export function restoreTreeToWorkTree(
  treeOid: string,
  gitDir: string,
  workTree: string
): void {
  const targetFiles = getTreeFiles(treeOid, gitDir);
  const currentIndex = readIndex(gitDir);

  // 1. Delete files in current index that do not exist in the target tree
  for (const entry of currentIndex) {
    if (!targetFiles.has(entry.path)) {
      const absPath = path.join(workTree, entry.path);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
        removeEmptyParentDirs(absPath, workTree);
      }
    }
  }

  // 2. Write/update files from target tree to working directory
  const newIndexEntries: IndexEntry[] = [];

  for (const [relPath, info] of targetFiles.entries()) {
    const absPath = path.join(workTree, relPath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const blob = readObject(info.oid, gitDir);
    fs.writeFileSync(absPath, blob.data);

    const modeNum = parseInt(info.mode, 8);
    if ((modeNum & 0o111) !== 0) {
      try {
        fs.chmodSync(absPath, 0o755);
      } catch {
        // Ignore chmod errors on systems without posix permissions
      }
    }

    const stat = fs.statSync(absPath);
    newIndexEntries.push({
      ctimeSec: Math.floor(stat.ctimeMs / 1000),
      ctimeNano: Math.floor((stat.ctimeMs % 1000) * 1_000_000),
      mtimeSec: Math.floor(stat.mtimeMs / 1000),
      mtimeNano: Math.floor((stat.mtimeMs % 1000) * 1_000_000),
      dev: stat.dev,
      ino: stat.ino,
      mode: modeNum,
      uid: stat.uid,
      gid: stat.gid,
      size: stat.size,
      oid: info.oid,
      flags: 0,
      path: relPath,
    });
  }

  // 3. Update index to exactly match the target tree
  writeIndex(newIndexEntries, gitDir);
}
