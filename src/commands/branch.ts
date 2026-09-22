import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir } from "../core/objects.js";
import { resolveHead, getCurrentBranch, updateRef } from "../core/refs.js";

export interface BranchList {
  current?: string;
  branches: string[];
}

export interface BranchOptions {
  list?: boolean;
  create?: string;
  delete?: string;
  startPoint?: string;
  gitDir?: string;
}

/**
 * Lists all local branch names and indicates the currently active branch.
 */
export function listBranches(gitDir?: string): BranchList {
  const resolvedGitDir = gitDir || findGitDir();
  const headsDir = path.join(resolvedGitDir, "refs", "heads");

  if (!fs.existsSync(headsDir)) {
    return { branches: [] };
  }

  const branches = fs
    .readdirSync(headsDir)
    .filter((file) => fs.statSync(path.join(headsDir, file)).isFile());

  const current = getCurrentBranch(resolvedGitDir);

  return {
    current,
    branches: branches.sort(),
  };
}

/**
 * Creates a new branch pointing to a given commit or current HEAD.
 */
export function createBranch(name: string, startPoint?: string, gitDir?: string): void {
  const resolvedGitDir = gitDir || findGitDir();
  const branchPath = path.join(resolvedGitDir, "refs", "heads", name);

  if (fs.existsSync(branchPath)) {
    throw new Error(`fatal: A branch named '${name}' already exists.`);
  }

  let targetCommit = startPoint;
  if (!targetCommit) {
    const head = resolveHead(resolvedGitDir);
    if (!head.commitOid) {
      throw new Error("fatal: Not a valid object name: 'HEAD'");
    }
    targetCommit = head.commitOid;
  }

  updateRef(`refs/heads/${name}`, targetCommit, resolvedGitDir);
}

/**
 * Deletes a local branch.
 */
export function deleteBranch(name: string, gitDir?: string): void {
  const resolvedGitDir = gitDir || findGitDir();
  const branchPath = path.join(resolvedGitDir, "refs", "heads", name);

  if (!fs.existsSync(branchPath)) {
    throw new Error(`fatal: branch '${name}' not found.`);
  }

  const current = getCurrentBranch(resolvedGitDir);
  if (current === name) {
    throw new Error(`fatal: Cannot delete branch '${name}' checked out.`);
  }

  fs.unlinkSync(branchPath);
}

/**
 * CLI command runner for mygit branch.
 */
export function runBranch(options: BranchOptions = {}): string {
  const resolvedGitDir = options.gitDir || findGitDir();

  if (options.delete) {
    deleteBranch(options.delete, resolvedGitDir);
    return `Deleted branch ${options.delete}.\n`;
  }

  if (options.create) {
    createBranch(options.create, options.startPoint, resolvedGitDir);
    return "";
  }

  const { current, branches } = listBranches(resolvedGitDir);
  if (branches.length === 0) {
    return "";
  }

  return (
    branches
      .map((b) => (b === current ? `* ${b}` : `  ${b}`))
      .join("\n") + "\n"
  );
}
