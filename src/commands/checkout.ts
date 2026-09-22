import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir, readObject } from "../core/objects.js";
import { parseCommit } from "../core/commit.js";
import { restoreTreeToWorkTree } from "../core/checkout.js";
import { createBranch } from "./branch.js";

export interface CheckoutOptions {
  target: string;
  createBranch?: boolean;
  gitDir?: string;
  workTree?: string;
}

/**
 * Checks out a branch or specific commit into the working directory.
 */
export function runCheckout(options: CheckoutOptions): string {
  const resolvedGitDir = options.gitDir || findGitDir();
  const resolvedWorkTree = options.workTree || path.dirname(resolvedGitDir);
  const headFile = path.join(resolvedGitDir, "HEAD");

  // Case 1: checkout -b <new-branch>
  if (options.createBranch) {
    createBranch(options.target, undefined, resolvedGitDir);
    fs.writeFileSync(headFile, `ref: refs/heads/${options.target}\n`, "utf-8");
    return `Switched to a new branch '${options.target}'\n`;
  }

  // Case 2: Checkout existing branch
  const branchPath = path.join(resolvedGitDir, "refs", "heads", options.target);
  if (fs.existsSync(branchPath)) {
    const commitOid = fs.readFileSync(branchPath, "utf-8").trim();
    const commitObj = readObject(commitOid, resolvedGitDir);
    const parsed = parseCommit(commitObj.data);

    restoreTreeToWorkTree(parsed.treeOid, resolvedGitDir, resolvedWorkTree);
    fs.writeFileSync(headFile, `ref: refs/heads/${options.target}\n`, "utf-8");

    return `Switched to branch '${options.target}'\n`;
  }

  // Case 3: Checkout by commit OID (Detached HEAD)
  try {
    const commitObj = readObject(options.target, resolvedGitDir);
    if (commitObj.type !== "commit") {
      throw new Error(`fatal: reference is not a tree/commit: ${options.target}`);
    }

    const parsed = parseCommit(commitObj.data);
    restoreTreeToWorkTree(parsed.treeOid, resolvedGitDir, resolvedWorkTree);

    // Set HEAD directly to commit OID
    fs.writeFileSync(headFile, `${options.target}\n`, "utf-8");

    return `Note: switching to '${options.target}'. You are in 'detached HEAD' state.\n`;
  } catch (err: any) {
    if (err.message && err.message.startsWith("fatal:")) {
      throw err;
    }
    throw new Error(
      `error: pathspec '${options.target}' did not match any file(s) known to git`
    );
  }
}
