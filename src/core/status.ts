import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir, readObject, hashObject } from "./objects.js";
import { readIndex, IndexEntry } from "./index.js";
import { parseTree, TreeEntry } from "./tree.js";
import { resolveHead, getCurrentBranch } from "./refs.js";
import { parseCommit } from "./commit.js";

export interface StagedStatus {
  new: string[];
  modified: string[];
  deleted: string[];
}

export interface UnstagedStatus {
  modified: string[];
  deleted: string[];
}

export interface RepoStatus {
  branch: string;
  staged: StagedStatus;
  unstaged: UnstagedStatus;
  untracked: string[];
  clean: boolean;
}

/**
 * Recursively flattens a tree object into a Map of relative path -> { mode, oid }
 */
export function getTreeFiles(
  treeOid: string,
  gitDir: string,
  prefix: string = ""
): Map<string, { mode: string; oid: string }> {
  const result = new Map<string, { mode: string; oid: string }>();

  const treeObj = readObject(treeOid, gitDir);
  const entries = parseTree(treeObj.data);

  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === "tree") {
      const sub = getTreeFiles(entry.oid, gitDir, fullPath);
      for (const [p, val] of sub.entries()) {
        result.set(p, val);
      }
    } else {
      result.set(fullPath, { mode: entry.mode, oid: entry.oid });
    }
  }

  return result;
}

/**
 * Recursively scans working directory (excluding .git) and returns relative paths.
 */
export function scanWorkTree(workTree: string, subDir: string = ""): string[] {
  const currentDir = subDir ? path.join(workTree, subDir) : workTree;
  if (!fs.existsSync(currentDir)) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(currentDir);

  for (const entry of entries) {
    if (entry === ".git") continue;
    const full = path.join(currentDir, entry);
    const rel = subDir ? `${subDir}/${entry}` : entry;
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      results.push(...scanWorkTree(workTree, rel));
    } else if (stat.isFile()) {
      results.push(rel.split(path.sep).join("/"));
    }
  }

  return results;
}

/**
 * Computes status by comparing HEAD, Index, and Working Directory.
 */
export function computeStatus(gitDir?: string, workTree?: string): RepoStatus {
  const resolvedGitDir = gitDir || findGitDir();
  const resolvedWorkTree = workTree || path.dirname(resolvedGitDir);

  const branch = getCurrentBranch(resolvedGitDir) || "HEAD";
  const head = resolveHead(resolvedGitDir);

  // 1. Get HEAD tree files
  const headFiles = new Map<string, { mode: string; oid: string }>();
  if (head.commitOid) {
    const commitObj = readObject(head.commitOid, resolvedGitDir);
    const parsedCommit = parseCommit(commitObj.data);
    const files = getTreeFiles(parsedCommit.treeOid, resolvedGitDir);
    for (const [p, val] of files.entries()) {
      headFiles.set(p, val);
    }
  }

  // 2. Get Index files
  const indexEntries = readIndex(resolvedGitDir);
  const indexMap = new Map<string, IndexEntry>();
  for (const entry of indexEntries) {
    indexMap.set(entry.path, entry);
  }

  // 3. Compare HEAD vs Index (Staged changes)
  const staged: StagedStatus = { new: [], modified: [], deleted: [] };

  for (const [indexPath, indexEntry] of indexMap.entries()) {
    if (!headFiles.has(indexPath)) {
      staged.new.push(indexPath);
    } else {
      const headFile = headFiles.get(indexPath)!;
      if (headFile.oid !== indexEntry.oid) {
        staged.modified.push(indexPath);
      }
    }
  }

  for (const headPath of headFiles.keys()) {
    if (!indexMap.has(headPath)) {
      staged.deleted.push(headPath);
    }
  }

  // 4. Compare Index vs Working Tree (Unstaged changes)
  const unstaged: UnstagedStatus = { modified: [], deleted: [] };
  const workTreeFiles = scanWorkTree(resolvedWorkTree);
  const workTreeSet = new Set(workTreeFiles);

  for (const [indexPath, indexEntry] of indexMap.entries()) {
    const absPath = path.join(resolvedWorkTree, indexPath);
    if (!fs.existsSync(absPath)) {
      unstaged.deleted.push(indexPath);
    } else {
      // Check if file modified on disk
      const stat = fs.statSync(absPath);
      // Fast path: if size differs, it's definitely modified
      if (stat.size !== indexEntry.size) {
        unstaged.modified.push(indexPath);
      } else {
        // Slow path: hash the file
        const content = fs.readFileSync(absPath);
        const { oid } = hashObject(content, "blob", false, resolvedGitDir);
        if (oid !== indexEntry.oid) {
          unstaged.modified.push(indexPath);
        }
      }
    }
  }

  // 5. Untracked files
  const untracked: string[] = [];
  for (const filePath of workTreeFiles) {
    if (!indexMap.has(filePath)) {
      untracked.push(filePath);
    }
  }

  // Sort all lists
  staged.new.sort();
  staged.modified.sort();
  staged.deleted.sort();
  unstaged.modified.sort();
  unstaged.deleted.sort();
  untracked.sort();

  const clean =
    staged.new.length === 0 &&
    staged.modified.length === 0 &&
    staged.deleted.length === 0 &&
    unstaged.modified.length === 0 &&
    unstaged.deleted.length === 0 &&
    untracked.length === 0;

  return {
    branch,
    staged,
    unstaged,
    untracked,
    clean,
  };
}
