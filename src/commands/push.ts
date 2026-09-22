import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir } from "../core/objects.js";
import { getRemoteUrl, copyMissingObjects } from "../core/remotes.js";
import { getCurrentBranch, getBranchCommit, updateRef } from "../core/refs.js";
import { findMergeBase } from "../core/mergeBase.js";

export interface PushOptions {
  remoteName?: string;
  branchName?: string;
  gitDir?: string;
}

/**
 * Updates remote refs along with associated objects.
 */
export function runPush(options: PushOptions = {}): string {
  const resolvedGitDir = options.gitDir || findGitDir();
  const remoteName = options.remoteName || "origin";
  const branch = options.branchName || getCurrentBranch(resolvedGitDir) || "main";

  const remoteUrl = getRemoteUrl(remoteName, resolvedGitDir);
  if (!remoteUrl) {
    throw new Error(`fatal: '${remoteName}' does not appear to be a git repository`);
  }

  const remoteGitDir = fs.existsSync(path.join(remoteUrl, ".git"))
    ? path.join(remoteUrl, ".git")
    : remoteUrl;

  const localCommitOid = getBranchCommit(branch, resolvedGitDir);
  if (!localCommitOid) {
    throw new Error(`fatal: src refspec ${branch} does not match any`);
  }

  // 1. Copy missing objects from local to remote
  copyMissingObjects(resolvedGitDir, remoteGitDir);

  // 2. Fast-forward safety check on remote branch
  const remoteCommitOid = getBranchCommit(branch, remoteGitDir);
  if (remoteCommitOid) {
    const lca = findMergeBase(localCommitOid, remoteCommitOid, remoteGitDir);
    if (lca !== remoteCommitOid) {
      throw new Error(
        "fatal: failed to push some refs to remote (non-fast-forward, pull first)"
      );
    }
  }

  // 3. Advance remote branch
  updateRef(`refs/heads/${branch}`, localCommitOid, remoteGitDir);

  // 4. Update local tracking branch
  updateRef(`refs/remotes/${remoteName}/${branch}`, localCommitOid, resolvedGitDir);

  const oldShort = remoteCommitOid ? remoteCommitOid.slice(0, 7) : "[new branch]";
  const newShort = localCommitOid.slice(0, 7);

  return `To ${remoteUrl}\n   ${oldShort}..${newShort}  ${branch} -> ${branch}\n`;
}
