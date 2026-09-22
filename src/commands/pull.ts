import * as path from "node:path";
import { findGitDir } from "../core/objects.js";
import { getCurrentBranch } from "../core/refs.js";
import { runFetch } from "./fetch.js";
import { runMerge } from "./merge.js";

export interface PullOptions {
  remoteName?: string;
  branchName?: string;
  gitDir?: string;
  workTree?: string;
}

/**
 * Fetches from and integrates with another repository or a local branch.
 */
export function runPull(options: PullOptions = {}): string {
  const resolvedGitDir = options.gitDir || findGitDir();
  const resolvedWorkTree = options.workTree || path.dirname(resolvedGitDir);
  const remoteName = options.remoteName || "origin";
  const branch = options.branchName || getCurrentBranch(resolvedGitDir) || "main";

  // 1. Fetch objects and update refs/remotes/<remoteName>/<branch>
  const fetchOutput = runFetch({ remoteName, gitDir: resolvedGitDir });

  // 2. Merge remote-tracking branch into current branch
  const remoteRef = path.join(resolvedGitDir, "refs", "remotes", remoteName, branch);
  const mergeResult = runMerge({
    branchName: remoteRef,
    gitDir: resolvedGitDir,
    workTree: resolvedWorkTree,
  });

  return fetchOutput + mergeResult.message;
}
