import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir } from "../core/objects.js";
import { getRemoteUrl, copyMissingObjects } from "../core/remotes.js";
import { updateRef } from "../core/refs.js";

export interface FetchOptions {
  remoteName?: string;
  gitDir?: string;
}

/**
 * Downloads objects and refs from another repository.
 */
export function runFetch(options: FetchOptions = {}): string {
  const resolvedGitDir = options.gitDir || findGitDir();
  const remoteName = options.remoteName || "origin";

  const remoteUrl = getRemoteUrl(remoteName, resolvedGitDir);
  if (!remoteUrl) {
    throw new Error(`fatal: '${remoteName}' does not appear to be a git repository`);
  }

  const remoteGitDir = fs.existsSync(path.join(remoteUrl, ".git"))
    ? path.join(remoteUrl, ".git")
    : remoteUrl;

  // 1. Copy missing objects from remote
  copyMissingObjects(remoteGitDir, resolvedGitDir);

  // 2. Update remote-tracking branches (refs/remotes/<remoteName>/<branch>)
  const remoteHeadsDir = path.join(remoteGitDir, "refs", "heads");
  const updatedRefs: string[] = [];

  if (fs.existsSync(remoteHeadsDir)) {
    const branches = fs.readdirSync(remoteHeadsDir);
    for (const b of branches) {
      const commitOid = fs
        .readFileSync(path.join(remoteHeadsDir, b), "utf-8")
        .trim();
      updateRef(`refs/remotes/${remoteName}/${b}`, commitOid, resolvedGitDir);
      updatedRefs.push(`${b} -> ${remoteName}/${b}`);
    }
  }

  return `From ${remoteUrl}\n` + updatedRefs.map((r) => ` * [updated] ${r}`).join("\n") + "\n";
}
