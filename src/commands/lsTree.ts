import { readObject } from "../core/objects.js";
import { parseTree, TreeEntry } from "../core/tree.js";

export interface LsTreeOptions {
  treeOid: string;
  recursive?: boolean;
  nameOnly?: boolean;
  gitDir?: string;
}

/**
 * Lists the contents of a given tree object.
 */
export function runLsTree(options: LsTreeOptions, prefix: string = ""): string {
  const treeObj = readObject(options.treeOid, options.gitDir);

  if (treeObj.type !== "tree") {
    throw new Error(`fatal: not a tree-ish: ${options.treeOid}`);
  }

  const entries = parseTree(treeObj.data);
  const lines: string[] = [];

  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.type === "tree" && options.recursive) {
      const subTreeLines = runLsTree(
        { ...options, treeOid: entry.oid },
        fullPath
      );
      if (subTreeLines) {
        lines.push(subTreeLines);
      }
    } else {
      if (options.nameOnly) {
        lines.push(fullPath);
      } else {
        lines.push(`${entry.mode} ${entry.type} ${entry.oid}\t${fullPath}`);
      }
    }
  }

  return lines.join("\n");
}
