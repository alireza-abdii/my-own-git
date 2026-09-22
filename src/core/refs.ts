import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir } from "./objects.js";

export interface ResolvedHead {
  isDetached: boolean;
  refPath?: string;
  commitOid?: string;
}

/**
 * Resolves .git/HEAD to discover whether HEAD is detached or pointing to a symbolic ref,
 * and what commit OID (if any) it currently refers to.
 */
export function resolveHead(gitDir?: string): ResolvedHead {
  const resolvedGitDir = gitDir || findGitDir();
  const headPath = path.join(resolvedGitDir, "HEAD");

  if (!fs.existsSync(headPath)) {
    throw new Error("fatal: HEAD file does not exist");
  }

  const content = fs.readFileSync(headPath, "utf-8").trim();

  if (content.startsWith("ref:")) {
    const refPath = content.slice(4).trim();
    const fullRefPath = path.join(resolvedGitDir, refPath);

    let commitOid: string | undefined = undefined;
    if (fs.existsSync(fullRefPath)) {
      commitOid = fs.readFileSync(fullRefPath, "utf-8").trim();
    }

    return {
      isDetached: false,
      refPath,
      commitOid,
    };
  }

  // Detached HEAD: content is directly a commit OID
  return {
    isDetached: true,
    commitOid: content,
  };
}

/**
 * Returns the short name of the currently active branch (e.g. 'main'),
 * or undefined if HEAD is detached.
 */
export function getCurrentBranch(gitDir?: string): string | undefined {
  const head = resolveHead(gitDir);
  if (head.isDetached || !head.refPath) {
    return undefined;
  }

  if (head.refPath.startsWith("refs/heads/")) {
    return head.refPath.slice("refs/heads/".length);
  }

  return head.refPath;
}

/**
 * Reads the commit OID of a given branch.
 */
export function getBranchCommit(branchName: string, gitDir?: string): string | undefined {
  const resolvedGitDir = gitDir || findGitDir();
  const branchPath = path.join(resolvedGitDir, "refs", "heads", branchName);

  if (fs.existsSync(branchPath)) {
    return fs.readFileSync(branchPath, "utf-8").trim();
  }

  return undefined;
}

/**
 * Updates a reference file to point to a new commit OID.
 */
export function updateRef(refPath: string, commitOid: string, gitDir?: string): void {
  const resolvedGitDir = gitDir || findGitDir();
  const fullRefPath = path.join(resolvedGitDir, refPath);
  const dir = path.dirname(fullRefPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullRefPath, `${commitOid}\n`, "utf-8");
}

/**
 * Updates HEAD or the branch it currently points to with a new commit OID.
 */
export function updateHead(commitOid: string, gitDir?: string): void {
  const resolvedGitDir = gitDir || findGitDir();
  const head = resolveHead(resolvedGitDir);

  if (head.isDetached) {
    const headPath = path.join(resolvedGitDir, "HEAD");
    fs.writeFileSync(headPath, `${commitOid}\n`, "utf-8");
  } else if (head.refPath) {
    updateRef(head.refPath, commitOid, resolvedGitDir);
  }
}
