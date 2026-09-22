import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir, readObject } from "../core/objects.js";
import { resolveHead, updateHead, getBranchCommit } from "../core/refs.js";
import { parseCommit, createCommit } from "../core/commit.js";
import { getTreeFiles } from "../core/status.js";
import { restoreTreeToWorkTree } from "../core/checkout.js";
import { findMergeBase } from "../core/mergeBase.js";
import { merge3 } from "../core/merge3.js";
import { runAdd } from "./add.js";
import { buildTreeFromIndex } from "../core/tree.js";

export interface MergeOptions {
  branchName: string;
  gitDir?: string;
  workTree?: string;
}

export interface MergeResult {
  type: "already-up-to-date" | "fast-forward" | "merge-commit" | "conflict";
  message: string;
}

/**
 * Merges the specified branch or ref into the current HEAD.
 */
export function runMerge(options: MergeOptions): MergeResult {
  const resolvedGitDir = options.gitDir || findGitDir();
  const resolvedWorkTree = options.workTree || path.dirname(resolvedGitDir);

  // 1. Resolve current HEAD (Ours)
  const head = resolveHead(resolvedGitDir);
  if (!head.commitOid) {
    throw new Error("fatal: your current branch does not have any commits yet.");
  }
  const oursCommitOid = head.commitOid;

  // 2. Resolve target branch (Theirs)
  let theirsCommitOid = getBranchCommit(options.branchName, resolvedGitDir);

  if (!theirsCommitOid) {
    // Check if it's a direct file or relative to gitDir (e.g. refs/remotes/origin/main)
    const possiblePaths = [
      options.branchName,
      path.join(resolvedGitDir, options.branchName),
      path.join(resolvedGitDir, "refs", "remotes", options.branchName),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        theirsCommitOid = fs.readFileSync(p, "utf-8").trim();
        break;
      }
    }
  }

  if (!theirsCommitOid) {
    // Check if branchName is directly a commit hash
    try {
      const obj = readObject(options.branchName, resolvedGitDir);
      if (obj.type === "commit") {
        theirsCommitOid = options.branchName;
      }
    } catch {
      // Not a commit
    }
  }

  if (!theirsCommitOid) {
    throw new Error(`fatal: ${options.branchName} - not something we can merge`);
  }

  // 3. Find Lowest Common Ancestor (Merge Base)
  const lcaOid = findMergeBase(oursCommitOid, theirsCommitOid, resolvedGitDir);
  if (!lcaOid) {
    throw new Error("fatal: refusing to merge unrelated histories");
  }

  // 4. Case: Already up to date
  if (lcaOid === theirsCommitOid) {
    return {
      type: "already-up-to-date",
      message: "Already up to date.\n",
    };
  }

  // 5. Case: Fast-Forward
  if (lcaOid === oursCommitOid) {
    const theirsCommitObj = readObject(theirsCommitOid, resolvedGitDir);
    const theirsParsed = parseCommit(theirsCommitObj.data);

    restoreTreeToWorkTree(theirsParsed.treeOid, resolvedGitDir, resolvedWorkTree);
    updateHead(theirsCommitOid, resolvedGitDir);

    const shortOurs = oursCommitOid.slice(0, 7);
    const shortTheirs = theirsCommitOid.slice(0, 7);
    return {
      type: "fast-forward",
      message: `Updating ${shortOurs}..${shortTheirs}\nFast-forward\n`,
    };
  }

  // 6. Case: Three-Way Merge
  const baseCommitObj = readObject(lcaOid, resolvedGitDir);
  const baseParsed = parseCommit(baseCommitObj.data);
  const oursCommitObj = readObject(oursCommitOid, resolvedGitDir);
  const oursParsed = parseCommit(oursCommitObj.data);
  const theirsCommitObj = readObject(theirsCommitOid, resolvedGitDir);
  const theirsParsed = parseCommit(theirsCommitObj.data);

  const baseTree = getTreeFiles(baseParsed.treeOid, resolvedGitDir);
  const oursTree = getTreeFiles(oursParsed.treeOid, resolvedGitDir);
  const theirsTree = getTreeFiles(theirsParsed.treeOid, resolvedGitDir);

  const allPaths = new Set([
    ...baseTree.keys(),
    ...oursTree.keys(),
    ...theirsTree.keys(),
  ]);

  let hadConflict = false;

  for (const filePath of allPaths) {
    const baseEntry = baseTree.get(filePath);
    const oursEntry = oursTree.get(filePath);
    const theirsEntry = theirsTree.get(filePath);

    const baseOid = baseEntry?.oid;
    const oursOid = oursEntry?.oid;
    const theirsOid = theirsEntry?.oid;

    // Both same
    if (oursOid === theirsOid) {
      continue;
    }

    // Unchanged in theirs -> keep ours
    if (theirsOid === baseOid) {
      continue;
    }

    // Unchanged in ours -> take theirs
    if (oursOid === baseOid && theirsEntry) {
      const absPath = path.join(resolvedWorkTree, filePath);
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const blob = readObject(theirsEntry.oid, resolvedGitDir);
      fs.writeFileSync(absPath, blob.data);
      continue;
    }

    // Both modified differently: perform line-by-line merge3
    const baseText = baseEntry
      ? readObject(baseEntry.oid, resolvedGitDir).data.toString("utf-8")
      : "";
    const oursText = oursEntry
      ? readObject(oursEntry.oid, resolvedGitDir).data.toString("utf-8")
      : "";
    const theirsText = theirsEntry
      ? readObject(theirsEntry.oid, resolvedGitDir).data.toString("utf-8")
      : "";

    const m3 = merge3(baseText, oursText, theirsText, {
      ours: "HEAD",
      theirs: path.basename(options.branchName),
    });

    const absPath = path.join(resolvedWorkTree, filePath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(absPath, m3.mergedText, "utf-8");

    if (m3.hasConflict) {
      hadConflict = true;
    }
  }

  if (hadConflict) {
    return {
      type: "conflict",
      message:
        "Automatic merge failed; fix conflicts and then commit the result.\n",
    };
  }

  // Auto-commit clean 3-way merge
  runAdd({ paths: ["."], workTree: resolvedWorkTree, gitDir: resolvedGitDir });
  const mergedTreeOid = buildTreeFromIndex(resolvedGitDir);

  const mergeCommitOid = createCommit(
    {
      treeOid: mergedTreeOid,
      parentOids: [oursCommitOid, theirsCommitOid],
      message: `Merge branch '${path.basename(options.branchName)}'`,
    },
    resolvedGitDir
  );

  updateHead(mergeCommitOid, resolvedGitDir);

  return {
    type: "merge-commit",
    message: "Merge made by the 'ort' strategy.\n",
  };
}
