import { createCommit } from "../core/commit.js";

export interface CommitTreeOptions {
  treeOid: string;
  parents?: string[];
  message: string;
  gitDir?: string;
}

/**
 * Creates a new commit object from a given tree OID and optional parent(s).
 */
export function runCommitTree(options: CommitTreeOptions): string {
  if (!options.treeOid) {
    throw new Error("fatal: empty tree OID provided for commit-tree");
  }

  return createCommit(
    {
      treeOid: options.treeOid,
      parentOids: options.parents,
      message: options.message,
    },
    options.gitDir
  );
}
