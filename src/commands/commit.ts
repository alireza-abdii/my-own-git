import { findGitDir } from "../core/objects.js";
import { buildTreeFromIndex } from "../core/tree.js";
import { resolveHead, getCurrentBranch, updateHead } from "../core/refs.js";
import { createCommit } from "../core/commit.js";

export interface CommitOptions {
  message: string;
  gitDir?: string;
  workTree?: string;
}

export interface CommitResult {
  commitOid: string;
  branch: string;
  isRoot: boolean;
  treeOid: string;
}

/**
 * High-level porcelain commit command:
 * 1. Creates a tree object from the staging area.
 * 2. Creates a commit pointing to that tree and the current HEAD commit as parent.
 * 3. Advances the current branch / HEAD to the new commit.
 */
export function runCommit(options: CommitOptions): CommitResult {
  if (!options.message || !options.message.trim()) {
    throw new Error("fatal: empty commit message");
  }

  const resolvedGitDir = options.gitDir || findGitDir();

  // 1. Build tree from current staging area
  const treeOid = buildTreeFromIndex(resolvedGitDir);

  // 2. Determine parent commit(s) and current branch
  const head = resolveHead(resolvedGitDir);
  const parentOids = head.commitOid ? [head.commitOid] : [];
  const isRoot = parentOids.length === 0;
  const branch = getCurrentBranch(resolvedGitDir) || "HEAD";

  // 3. Create the commit object
  const commitOid = createCommit(
    {
      treeOid,
      parentOids,
      message: options.message,
    },
    resolvedGitDir
  );

  // 4. Update the active branch / HEAD
  updateHead(commitOid, resolvedGitDir);

  return {
    commitOid,
    branch,
    isRoot,
    treeOid,
  };
}
