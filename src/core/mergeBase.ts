import { findGitDir, readObject } from "./objects.js";
import { parseCommit } from "./commit.js";

/**
 * Finds the Lowest Common Ancestor (LCA) / merge base of two commits in the DAG.
 */
export function findMergeBase(
  commitA: string,
  commitB: string,
  gitDir?: string
): string | undefined {
  if (commitA === commitB) {
    return commitA;
  }

  const resolvedGitDir = gitDir || findGitDir();

  // 1. Collect all reachable ancestors of commitA
  const ancestorsA = new Set<string>();
  const queueA = [commitA];

  while (queueA.length > 0) {
    const current = queueA.shift()!;
    if (ancestorsA.has(current)) continue;
    ancestorsA.add(current);

    try {
      const obj = readObject(current, resolvedGitDir);
      if (obj.type === "commit") {
        const parsed = parseCommit(obj.data);
        for (const parent of parsed.parentOids) {
          if (!ancestorsA.has(parent)) {
            queueA.push(parent);
          }
        }
      }
    } catch {
      // Ignore missing commits
    }
  }

  // 2. Perform BFS from commitB; first node present in ancestorsA is the LCA
  const visitedB = new Set<string>();
  const queueB = [commitB];

  while (queueB.length > 0) {
    const current = queueB.shift()!;
    if (ancestorsA.has(current)) {
      return current;
    }

    if (visitedB.has(current)) continue;
    visitedB.add(current);

    try {
      const obj = readObject(current, resolvedGitDir);
      if (obj.type === "commit") {
        const parsed = parseCommit(obj.data);
        for (const parent of parsed.parentOids) {
          if (!visitedB.has(parent)) {
            queueB.push(parent);
          }
        }
      }
    } catch {
      // Ignore missing commits
    }
  }

  return undefined;
}
