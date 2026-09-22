import * as fs from "node:fs";
import * as path from "node:path";
import { initRepo } from "./init.js";
import { addRemote, copyMissingObjects } from "../core/remotes.js";
import { resolveHead, getCurrentBranch, updateRef } from "../core/refs.js";
import { readObject } from "../core/objects.js";
import { parseCommit } from "../core/commit.js";
import { restoreTreeToWorkTree } from "../core/checkout.js";

export interface CloneOptions {
  remotePath: string;
  targetDir?: string;
}

/**
 * Clones a repository into a newly created directory.
 */
export function runClone(options: CloneOptions): string {
  const resolvedRemote = path.resolve(options.remotePath);
  if (!fs.existsSync(resolvedRemote)) {
    throw new Error(`fatal: repository '${options.remotePath}' does not exist`);
  }

  const remoteGitDir = fs.existsSync(path.join(resolvedRemote, ".git"))
    ? path.join(resolvedRemote, ".git")
    : resolvedRemote;

  const targetDir =
    options.targetDir ||
    path.resolve(process.cwd(), path.basename(resolvedRemote).replace(/\.git$/, ""));

  // 1. Initialize local repository
  const { gitDir: localGitDir } = initRepo(targetDir);

  // 2. Add remote origin
  addRemote("origin", resolvedRemote, localGitDir);

  // 3. Copy all objects
  copyMissingObjects(remoteGitDir, localGitDir);

  // 4. Discover remote HEAD and active branch
  const remoteHead = resolveHead(remoteGitDir);
  const remoteBranch = getCurrentBranch(remoteGitDir) || "main";
  const remoteCommitOid = remoteHead.commitOid;

  if (remoteCommitOid) {
    // 5. Create remote-tracking branch
    updateRef(`refs/remotes/origin/${remoteBranch}`, remoteCommitOid, localGitDir);

    // 6. Create local branch and update HEAD
    updateRef(`refs/heads/${remoteBranch}`, remoteCommitOid, localGitDir);
    fs.writeFileSync(path.join(localGitDir, "HEAD"), `ref: refs/heads/${remoteBranch}\n`, "utf-8");

    // 7. Extract working tree files
    const commitObj = readObject(remoteCommitOid, localGitDir);
    const parsed = parseCommit(commitObj.data);
    restoreTreeToWorkTree(parsed.treeOid, localGitDir, targetDir);
  }

  return `Cloning into '${path.basename(targetDir)}'...\ndone.\n`;
}
