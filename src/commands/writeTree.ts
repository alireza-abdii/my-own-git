import { buildTreeFromIndex } from "../core/tree.js";

/**
 * Creates a tree object from the current index.
 *
 * @param gitDir - Optional path to .git directory.
 * @returns 40-character SHA-1 hash of the root tree object.
 */
export function runWriteTree(gitDir?: string): string {
  return buildTreeFromIndex(gitDir);
}
