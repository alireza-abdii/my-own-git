import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { initRepo } from "../src/commands/init.js";
import { runAdd } from "../src/commands/add.js";
import { serializeTree, parseTree, buildTreeFromIndex, TreeEntry } from "../src/core/tree.js";
import { runWriteTree } from "../src/commands/writeTree.js";
import { runLsTree } from "../src/commands/lsTree.js";
import { readObject } from "../src/core/objects.js";

describe("Phase 4: Trees (Nested directories, write-tree, ls-tree)", () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-tree-test-"));
    const initRes = initRepo(tempDir);
    gitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Binary Tree Parsing & Serialization", () => {
    it("should serialize and deserialize a tree object correctly", () => {
      const entries: TreeEntry[] = [
        {
          mode: "100644",
          name: "hello.txt",
          oid: "3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
          type: "blob",
        },
      ];

      const serialized = serializeTree(entries);
      const parsed = parseTree(serialized);

      expect(parsed.length).toBe(1);
      expect(parsed[0].mode).toBe("100644");
      expect(parsed[0].name).toBe("hello.txt");
      expect(parsed[0].oid).toBe("3b18e512dba79e4c8300dd08aeb37f8e728b8dad");
      expect(parsed[0].type).toBe("blob");
    });
  });

  describe("buildTreeFromIndex & write-tree", () => {
    it("should build a tree from staged files in root directory", () => {
      fs.writeFileSync(path.join(tempDir, "file1.txt"), "content 1", "utf-8");
      fs.writeFileSync(path.join(tempDir, "file2.txt"), "content 2", "utf-8");

      runAdd({ paths: ["file1.txt", "file2.txt"], workTree: tempDir, gitDir });

      const treeOid = runWriteTree(gitDir);
      expect(treeOid).toMatch(/^[0-9a-f]{40}$/);

      // Verify the tree object in the database
      const treeObj = readObject(treeOid, gitDir);
      expect(treeObj.type).toBe("tree");

      const entries = parseTree(treeObj.data);
      expect(entries.length).toBe(2);
      expect(entries.map((e) => e.name)).toEqual(["file1.txt", "file2.txt"]);
    });

    it("should build nested trees for subdirectories recursively", () => {
      // Create nested structure:
      // a.txt
      // docs/manual.txt
      // docs/sub/details.txt
      fs.writeFileSync(path.join(tempDir, "a.txt"), "top file", "utf-8");
      fs.mkdirSync(path.join(tempDir, "docs", "sub"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "docs", "manual.txt"), "manual", "utf-8");
      fs.writeFileSync(path.join(tempDir, "docs", "sub", "details.txt"), "details", "utf-8");

      runAdd({ paths: ["."], workTree: tempDir, gitDir });

      const rootTreeOid = runWriteTree(gitDir);
      expect(rootTreeOid).toMatch(/^[0-9a-f]{40}$/);

      // Root tree should contain 'a.txt' (blob) and 'docs' (tree)
      const rootEntries = parseTree(readObject(rootTreeOid, gitDir).data);
      expect(rootEntries.map((e) => e.name)).toEqual(["a.txt", "docs"]);

      const docsEntry = rootEntries.find((e) => e.name === "docs")!;
      expect(docsEntry.type).toBe("tree");
      expect(docsEntry.mode).toBe("040000");

      // docs tree should contain 'manual.txt' (blob) and 'sub' (tree)
      const docsEntries = parseTree(readObject(docsEntry.oid, gitDir).data);
      expect(docsEntries.map((e) => e.name)).toEqual(["manual.txt", "sub"]);
    });
  });

  describe("mygit ls-tree command", () => {
    it("should list entries of a tree object", () => {
      fs.writeFileSync(path.join(tempDir, "hello.txt"), "hello world\n", "utf-8");
      runAdd({ paths: ["hello.txt"], workTree: tempDir, gitDir });
      const treeOid = runWriteTree(gitDir);

      const output = runLsTree({ treeOid, gitDir });
      expect(output.trim()).toBe("100644 blob 3b18e512dba79e4c8300dd08aeb37f8e728b8dad\thello.txt");
    });
  });

  describe("Official Git Compatibility", () => {
    it("should generate the EXACT same tree hash as official git write-tree", () => {
      fs.writeFileSync(path.join(tempDir, "root.txt"), "root content\n", "utf-8");
      fs.mkdirSync(path.join(tempDir, "nested"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "nested", "sub.txt"), "nested content\n", "utf-8");

      runAdd({ paths: ["."], workTree: tempDir, gitDir });

      const mygitTreeOid = runWriteTree(gitDir);

      const officialGitTreeOid = execSync("git write-tree", {
        cwd: tempDir,
        encoding: "utf-8",
      }).trim();

      expect(mygitTreeOid).toBe(officialGitTreeOid);
    });
  });
});
