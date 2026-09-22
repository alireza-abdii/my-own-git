import * as path from "node:path";
import { findGitDir, hashObject, readObject } from "./objects.js";
import { readIndex, IndexEntry } from "./index.js";

export interface TreeEntry {
  mode: string;
  name: string;
  oid: string; // 40-character hex
  type: "blob" | "tree";
}

/**
 * Git canonical comparison for tree entries:
 * Directories are sorted as if they end with a trailing slash '/'.
 */
export function compareTreeEntries(a: TreeEntry, b: TreeEntry): number {
  const nameA = a.type === "tree" ? a.name + "/" : a.name;
  const nameB = b.type === "tree" ? b.name + "/" : b.name;
  const bufA = Buffer.from(nameA, "utf-8");
  const bufB = Buffer.from(nameB, "utf-8");
  return bufA.compare(bufB);
}

/**
 * Serializes tree entries into standard Git binary tree payload.
 */
export function serializeTree(entries: TreeEntry[]): Buffer {
  const sorted = [...entries].sort(compareTreeEntries);
  const chunks: Buffer[] = [];

  for (const entry of sorted) {
    // Mode in raw tree is octal without leading zero (e.g. 40000, 100644)
    const rawMode = entry.mode.replace(/^0+/, "");
    const header = Buffer.from(`${rawMode} ${entry.name}\0`, "utf-8");
    const oidBuf = Buffer.from(entry.oid, "hex");

    chunks.push(header, oidBuf);
  }

  return Buffer.concat(chunks);
}

/**
 * Parses raw binary data of a tree object into structured TreeEntry array.
 */
export function parseTree(data: Buffer): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let offset = 0;

  while (offset < data.length) {
    // 1. Find space after mode
    const spaceIdx = data.indexOf(0x20, offset);
    if (spaceIdx === -1) break;

    const rawMode = data.subarray(offset, spaceIdx).toString("utf-8");

    // 2. Find null byte after name
    const nullIdx = data.indexOf(0x00, spaceIdx + 1);
    if (nullIdx === -1) break;

    const name = data.subarray(spaceIdx + 1, nullIdx).toString("utf-8");

    // 3. 20-byte binary SHA-1 oid
    const oidStart = nullIdx + 1;
    const oidEnd = oidStart + 20;
    if (oidEnd > data.length) break;

    const oid = data.subarray(oidStart, oidEnd).toString("hex");

    const isDir = rawMode === "40000" || rawMode === "040000";
    const mode = isDir ? "040000" : rawMode.padStart(6, "0");
    const type = isDir ? "tree" : "blob";

    entries.push({ mode, name, oid, type });

    offset = oidEnd;
  }

  return entries;
}

interface TreeNode {
  files: Map<string, { mode: number; oid: string }>;
  dirs: Map<string, TreeNode>;
}

function createEmptyTreeNode(): TreeNode {
  return {
    files: new Map(),
    dirs: new Map(),
  };
}

/**
 * Builds a hierarchical tree structure from staged index entries,
 * writes all tree objects into .git/objects/, and returns the root tree OID.
 */
export function buildTreeFromIndex(gitDir?: string): string {
  const resolvedGitDir = gitDir || findGitDir();
  const indexEntries = readIndex(resolvedGitDir);

  const rootNode = createEmptyTreeNode();

  // 1. Place each staged file into the in-memory directory tree
  for (const entry of indexEntries) {
    const parts = entry.path.split("/");
    let currentNode = rootNode;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!currentNode.dirs.has(part)) {
        currentNode.dirs.set(part, createEmptyTreeNode());
      }
      currentNode = currentNode.dirs.get(part)!;
    }

    const filename = parts[parts.length - 1];
    currentNode.files.set(filename, {
      mode: entry.mode,
      oid: entry.oid,
    });
  }

  // 2. Recursively write tree objects bottom-up
  function writeNode(node: TreeNode): string {
    const entries: TreeEntry[] = [];

    // Process child directories first
    for (const [dirName, childNode] of node.dirs.entries()) {
      const childTreeOid = writeNode(childNode);
      entries.push({
        mode: "040000",
        name: dirName,
        oid: childTreeOid,
        type: "tree",
      });
    }

    // Process files in this directory
    for (const [fileName, fileInfo] of node.files.entries()) {
      const modeStr = fileInfo.mode.toString(8).padStart(6, "0");
      entries.push({
        mode: modeStr,
        name: fileName,
        oid: fileInfo.oid,
        type: "blob",
      });
    }

    const treeBuffer = serializeTree(entries);
    const { oid } = hashObject(treeBuffer, "tree", true, resolvedGitDir);
    return oid;
  }

  return writeNode(rootNode);
}
