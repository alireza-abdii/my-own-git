import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { initRepo } from "../src/commands/init.js";
import { runAdd } from "../src/commands/add.js";
import { runWriteTree } from "../src/commands/writeTree.js";
import { createCommit, parseCommit } from "../src/core/commit.js";
import { resolveHead, getBranchCommit, updateRef } from "../src/core/refs.js";
import { runCommitTree } from "../src/commands/commitTree.js";
import { runCommit } from "../src/commands/commit.js";
import { readObject } from "../src/core/objects.js";

describe("Phase 5: Commits, Parent Chains & Ref Updates", () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-commit-test-"));
    const initRes = initRepo(tempDir);
    gitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Core Commit Object Parsing & Creation", () => {
    it("should create and parse a commit object accurately", () => {
      // Create a dummy tree first
      fs.writeFileSync(path.join(tempDir, "file.txt"), "hello", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      const treeOid = runWriteTree(gitDir);

      const commitOid = createCommit(
        {
          treeOid,
          parentOids: [],
          message: "Initial commit\n",
          author: {
            name: "Test User",
            email: "test@example.com",
            timestamp: 1600000000,
            timezone: "+0000",
          },
          committer: {
            name: "Test User",
            email: "test@example.com",
            timestamp: 1600000000,
            timezone: "+0000",
          },
        },
        gitDir
      );

      expect(commitOid).toMatch(/^[0-9a-f]{40}$/);

      const commitObj = readObject(commitOid, gitDir);
      expect(commitObj.type).toBe("commit");

      const parsed = parseCommit(commitObj.data);
      expect(parsed.treeOid).toBe(treeOid);
      expect(parsed.parentOids).toEqual([]);
      expect(parsed.author.name).toBe("Test User");
      expect(parsed.author.email).toBe("test@example.com");
      expect(parsed.message.trim()).toBe("Initial commit");
    });
  });

  describe("Plumbing: commit-tree", () => {
    it("should create a commit with parent when specified", () => {
      fs.writeFileSync(path.join(tempDir, "file.txt"), "v1", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      const tree1 = runWriteTree(gitDir);

      const parentOid = runCommitTree({
        treeOid: tree1,
        message: "First commit",
        gitDir,
      });

      fs.writeFileSync(path.join(tempDir, "file.txt"), "v2", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      const tree2 = runWriteTree(gitDir);

      const childOid = runCommitTree({
        treeOid: tree2,
        parents: [parentOid],
        message: "Second commit",
        gitDir,
      });

      const childCommit = parseCommit(readObject(childOid, gitDir).data);
      expect(childCommit.parentOids).toEqual([parentOid]);
    });
  });

  describe("Porcelain: mygit commit", () => {
    it("should perform root commit and advance the active branch", () => {
      fs.writeFileSync(path.join(tempDir, "app.js"), "console.log('hi');", "utf-8");
      runAdd({ paths: ["app.js"], workTree: tempDir, gitDir });

      const res = runCommit({
        message: "Initial commit",
        gitDir,
        workTree: tempDir,
      });

      expect(res.isRoot).toBe(true);
      expect(res.branch).toBe("main");

      // Verify refs/heads/main now holds this commit OID
      const headBranchOid = getBranchCommit("main", gitDir);
      expect(headBranchOid).toBe(res.commitOid);

      // Second commit
      fs.writeFileSync(path.join(tempDir, "app.js"), "console.log('updated');", "utf-8");
      runAdd({ paths: ["app.js"], workTree: tempDir, gitDir });

      const res2 = runCommit({
        message: "Update app.js",
        gitDir,
        workTree: tempDir,
      });

      expect(res2.isRoot).toBe(false);
      const headBranchOid2 = getBranchCommit("main", gitDir);
      expect(headBranchOid2).toBe(res2.commitOid);

      // Verify res2 has res.commitOid as parent
      const parsedRes2 = parseCommit(readObject(res2.commitOid, gitDir).data);
      expect(parsedRes2.parentOids).toEqual([res.commitOid]);
    });
  });

  describe("Official Git Compatibility", () => {
    it("official git log and git show should recognize commits made by mygit", () => {
      fs.writeFileSync(path.join(tempDir, "hello.txt"), "hello git\n", "utf-8");
      runAdd({ paths: ["hello.txt"], workTree: tempDir, gitDir });

      const commitRes = runCommit({
        message: "Commit from mygit",
        gitDir,
        workTree: tempDir,
      });

      // Run official git log
      const gitLogOutput = execSync("git log -n 1 --format=%s", {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(gitLogOutput.trim()).toBe("Commit from mygit");

      // Run official git show to verify file diff/content
      const gitShowOutput = execSync("git show --stat", {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(gitShowOutput).toContain("hello.txt");
    });
  });
});
