import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { initRepo } from "../src/commands/init.js";
import { runAdd } from "../src/commands/add.js";
import { runCommit } from "../src/commands/commit.js";
import { createBranch, listBranches, deleteBranch, runBranch } from "../src/commands/branch.js";
import { runCheckout } from "../src/commands/checkout.js";
import { resolveHead, getCurrentBranch } from "../src/core/refs.js";
import { readIndex } from "../src/core/index.js";

describe("Phase 7: Branches, HEAD, and Checkout", () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-branch-test-"));
    const initRes = initRepo(tempDir);
    gitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Branch Management (create, list, delete)", () => {
    it("should create and list branches, marking active branch", () => {
      fs.writeFileSync(path.join(tempDir, "file.txt"), "hello", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      const c1 = runCommit({ message: "Initial commit", gitDir, workTree: tempDir });

      createBranch("feature", undefined, gitDir);

      const branchList = listBranches(gitDir);
      expect(branchList.current).toBe("main");
      expect(branchList.branches.sort()).toEqual(["feature", "main"]);

      // Both should point to c1.commitOid
      const featureRef = fs.readFileSync(path.join(gitDir, "refs", "heads", "feature"), "utf-8").trim();
      expect(featureRef).toBe(c1.commitOid);

      // Delete feature branch
      deleteBranch("feature", gitDir);
      const afterDelete = listBranches(gitDir);
      expect(afterDelete.branches).toEqual(["main"]);
    });
  });

  describe("Checkout & Rewriting Working Directory", () => {
    it("should switch between branches and rewrite working directory and index", () => {
      // 1. Commit on main with main.txt
      fs.writeFileSync(path.join(tempDir, "common.txt"), "common content", "utf-8");
      fs.writeFileSync(path.join(tempDir, "only-main.txt"), "main content", "utf-8");
      runAdd({ paths: ["."], workTree: tempDir, gitDir });
      runCommit({ message: "Commit on main", gitDir, workTree: tempDir });

      // 2. Create and checkout 'feature' branch
      runCheckout({ target: "feature", createBranch: true, gitDir, workTree: tempDir });
      expect(getCurrentBranch(gitDir)).toBe("feature");

      // 3. Remove only-main.txt and add only-feature.txt on feature branch
      fs.unlinkSync(path.join(tempDir, "only-main.txt"));
      fs.writeFileSync(path.join(tempDir, "only-feature.txt"), "feature content", "utf-8");
      // Add all changes to index
      fs.rmSync(path.join(gitDir, "index")); // clear or re-add
      runAdd({ paths: ["."], workTree: tempDir, gitDir });
      runCommit({ message: "Commit on feature", gitDir, workTree: tempDir });

      expect(fs.existsSync(path.join(tempDir, "only-feature.txt"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "only-main.txt"))).toBe(false);

      // 4. Checkout main branch
      runCheckout({ target: "main", gitDir, workTree: tempDir });
      expect(getCurrentBranch(gitDir)).toBe("main");

      // Now only-main.txt must exist, and only-feature.txt must NOT exist!
      expect(fs.existsSync(path.join(tempDir, "only-main.txt"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "only-feature.txt"))).toBe(false);
      expect(fs.readFileSync(path.join(tempDir, "common.txt"), "utf-8")).toBe("common content");

      // Index must match main's files
      const index = readIndex(gitDir);
      const indexPaths = index.map((e) => e.path).sort();
      expect(indexPaths).toEqual(["common.txt", "only-main.txt"]);
    });

    it("should support Detached HEAD when checking out a commit hash directly", () => {
      fs.writeFileSync(path.join(tempDir, "file.txt"), "v1", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      const c1 = runCommit({ message: "v1", gitDir, workTree: tempDir });

      fs.writeFileSync(path.join(tempDir, "file.txt"), "v2", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      const c2 = runCommit({ message: "v2", gitDir, workTree: tempDir });

      // Checkout c1 by commit hash
      runCheckout({ target: c1.commitOid, gitDir, workTree: tempDir });

      const head = resolveHead(gitDir);
      expect(head.isDetached).toBe(true);
      expect(head.commitOid).toBe(c1.commitOid);

      // Working tree file must be v1
      expect(fs.readFileSync(path.join(tempDir, "file.txt"), "utf-8")).toBe("v1");
    });
  });

  describe("Official Git Compatibility", () => {
    it("official git branch and git checkout should recognize branches created by mygit", () => {
      fs.writeFileSync(path.join(tempDir, "init.txt"), "init", "utf-8");
      runAdd({ paths: ["init.txt"], workTree: tempDir, gitDir });
      runCommit({ message: "init commit", gitDir, workTree: tempDir });

      createBranch("alpha", undefined, gitDir);

      const gitBranches = execSync("git branch", { cwd: tempDir, encoding: "utf-8" });
      expect(gitBranches).toContain("alpha");
      expect(gitBranches).toContain("* main");

      // Checkout alpha using official git
      execSync("git checkout alpha", { cwd: tempDir, encoding: "utf-8" });
      expect(getCurrentBranch(gitDir)).toBe("alpha");
    });
  });
});
