import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { initRepo } from "../src/commands/init.js";
import { runAdd } from "../src/commands/add.js";
import { runCommit } from "../src/commands/commit.js";
import { createBranch } from "../src/commands/branch.js";
import { runCheckout } from "../src/commands/checkout.js";
import { findMergeBase } from "../src/core/mergeBase.js";
import { merge3 } from "../src/core/merge3.js";
import { runMerge } from "../src/commands/merge.js";
import { readObject } from "../src/core/objects.js";
import { parseCommit } from "../src/core/commit.js";
import { resolveHead } from "../src/core/refs.js";

describe("Phase 8: Merge (Fast-Forward, Three-Way Merge, Merge Base)", () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-merge-test-"));
    const initRes = initRepo(tempDir);
    gitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Merge Base Algorithm", () => {
    it("should correctly find the lowest common ancestor commit", () => {
      // Root commit (base)
      fs.writeFileSync(path.join(tempDir, "base.txt"), "base", "utf-8");
      runAdd({ paths: ["base.txt"], workTree: tempDir, gitDir });
      const baseCommit = runCommit({ message: "Base commit", gitDir, workTree: tempDir });

      // Branch A commit
      createBranch("branch-a", undefined, gitDir);
      runCheckout({ target: "branch-a", gitDir, workTree: tempDir });
      fs.writeFileSync(path.join(tempDir, "a.txt"), "a", "utf-8");
      runAdd({ paths: ["a.txt"], workTree: tempDir, gitDir });
      const commitA = runCommit({ message: "Commit on A", gitDir, workTree: tempDir });

      // Branch B commit
      runCheckout({ target: "main", gitDir, workTree: tempDir });
      createBranch("branch-b", undefined, gitDir);
      runCheckout({ target: "branch-b", gitDir, workTree: tempDir });
      fs.writeFileSync(path.join(tempDir, "b.txt"), "b", "utf-8");
      runAdd({ paths: ["b.txt"], workTree: tempDir, gitDir });
      const commitB = runCommit({ message: "Commit on B", gitDir, workTree: tempDir });

      const lca = findMergeBase(commitA.commitOid, commitB.commitOid, gitDir);
      expect(lca).toBe(baseCommit.commitOid);
    });
  });

  describe("merge3 line-by-line algorithm", () => {
    it("should automatically merge non-overlapping changes", () => {
      const base = "line 1\nline 2\nline 3\n";
      const ours = "line 1 modified by ours\nline 2\nline 3\n";
      const theirs = "line 1\nline 2\nline 3 modified by theirs\n";

      const res = merge3(base, ours, theirs, { ours: "HEAD", theirs: "feature" });
      expect(res.hasConflict).toBe(false);
      expect(res.mergedText).toBe("line 1 modified by ours\nline 2\nline 3 modified by theirs\n");
    });

    it("should insert standard conflict markers on colliding edits", () => {
      const base = "original content\n";
      const ours = "ours changed this\n";
      const theirs = "theirs changed this\n";

      const res = merge3(base, ours, theirs, { ours: "HEAD", theirs: "feature" });
      expect(res.hasConflict).toBe(true);
      expect(res.mergedText).toContain("<<<<<<< HEAD");
      expect(res.mergedText).toContain("ours changed this");
      expect(res.mergedText).toContain("=======");
      expect(res.mergedText).toContain("theirs changed this");
      expect(res.mergedText).toContain(">>>>>>> feature");
    });
  });

  describe("mygit merge command", () => {
    it("should perform Fast-Forward merge when current branch is ancestor", () => {
      fs.writeFileSync(path.join(tempDir, "file.txt"), "v1", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      runCommit({ message: "c1", gitDir, workTree: tempDir });

      // Create branch feature and advance it
      runCheckout({ target: "feature", createBranch: true, gitDir, workTree: tempDir });
      fs.writeFileSync(path.join(tempDir, "file.txt"), "v2", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      const c2 = runCommit({ message: "c2 on feature", gitDir, workTree: tempDir });

      // Checkout main and merge feature
      runCheckout({ target: "main", gitDir, workTree: tempDir });
      const result = runMerge({ branchName: "feature", gitDir, workTree: tempDir });

      expect(result.type).toBe("fast-forward");

      // main should now point directly to c2
      const head = resolveHead(gitDir);
      expect(head.commitOid).toBe(c2.commitOid);
      expect(fs.readFileSync(path.join(tempDir, "file.txt"), "utf-8")).toBe("v2");
    });

    it("should perform Three-Way Merge creating a commit with 2 parents when diverged", () => {
      fs.writeFileSync(path.join(tempDir, "shared.txt"), "shared", "utf-8");
      runAdd({ paths: ["shared.txt"], workTree: tempDir, gitDir });
      runCommit({ message: "c1", gitDir, workTree: tempDir });

      // Branch feature: add feat.txt
      runCheckout({ target: "feature", createBranch: true, gitDir, workTree: tempDir });
      fs.writeFileSync(path.join(tempDir, "feat.txt"), "feat", "utf-8");
      runAdd({ paths: ["feat.txt"], workTree: tempDir, gitDir });
      const cFeat = runCommit({ message: "feat commit", gitDir, workTree: tempDir });

      // Branch main: add main.txt
      runCheckout({ target: "main", gitDir, workTree: tempDir });
      fs.writeFileSync(path.join(tempDir, "main.txt"), "main", "utf-8");
      runAdd({ paths: ["main.txt"], workTree: tempDir, gitDir });
      const cMain = runCommit({ message: "main commit", gitDir, workTree: tempDir });

      // Merge feature into main
      const result = runMerge({ branchName: "feature", gitDir, workTree: tempDir });
      expect(result.type).toBe("merge-commit");

      // Verify both files exist
      expect(fs.existsSync(path.join(tempDir, "feat.txt"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "main.txt"))).toBe(true);

      // Verify merge commit has 2 parents
      const head = resolveHead(gitDir);
      const mergeCommit = parseCommit(readObject(head.commitOid!, gitDir).data);
      expect(mergeCommit.parentOids).toEqual([cMain.commitOid, cFeat.commitOid]);
    });
  });
});
