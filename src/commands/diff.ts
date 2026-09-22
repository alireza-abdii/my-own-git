import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir, readObject } from "../core/objects.js";
import { readIndex } from "../core/index.js";
import { resolveHead } from "../core/refs.js";
import { parseCommit } from "../core/commit.js";
import { getTreeFiles } from "../core/status.js";
import { formatUnifiedDiff } from "../core/diff.js";

export interface DiffOptions {
  staged?: boolean;
  gitDir?: string;
  workTree?: string;
}

/**
 * Computes and prints unified diff either between WorkTree and Index,
 * or between Index and HEAD (when staged=true).
 */
export function runDiff(options: DiffOptions = {}): string {
  const resolvedGitDir = options.gitDir || findGitDir();
  const resolvedWorkTree = options.workTree || path.dirname(resolvedGitDir);

  const diffChunks: string[] = [];

  const indexEntries = readIndex(resolvedGitDir);
  const indexMap = new Map(indexEntries.map((e) => [e.path, e]));

  if (options.staged) {
    // Staged diff: Index vs HEAD
    const head = resolveHead(resolvedGitDir);
    const headFiles = new Map<string, { mode: string; oid: string }>();

    if (head.commitOid) {
      const commitObj = readObject(head.commitOid, resolvedGitDir);
      const parsed = parseCommit(commitObj.data);
      const files = getTreeFiles(parsed.treeOid, resolvedGitDir);
      for (const [p, val] of files.entries()) {
        headFiles.set(p, val);
      }
    }

    // Check all files in index
    for (const [indexPath, indexEntry] of indexMap.entries()) {
      const headFile = headFiles.get(indexPath);
      if (!headFile || headFile.oid !== indexEntry.oid) {
        const oldContent = headFile
          ? readObject(headFile.oid, resolvedGitDir).data.toString("utf-8")
          : "";
        const newContent = readObject(indexEntry.oid, resolvedGitDir).data.toString("utf-8");

        const diff = formatUnifiedDiff(indexPath, oldContent, newContent);
        if (diff) {
          diffChunks.push(diff);
        }
      }
    }
  } else {
    // Unstaged diff: WorkTree vs Index
    for (const [indexPath, indexEntry] of indexMap.entries()) {
      const absPath = path.join(resolvedWorkTree, indexPath);
      if (fs.existsSync(absPath)) {
        const oldContent = readObject(indexEntry.oid, resolvedGitDir).data.toString("utf-8");
        const newContent = fs.readFileSync(absPath, "utf-8");

        const diff = formatUnifiedDiff(indexPath, oldContent, newContent);
        if (diff) {
          diffChunks.push(diff);
        }
      }
    }
  }

  return diffChunks.join("\n");
}
