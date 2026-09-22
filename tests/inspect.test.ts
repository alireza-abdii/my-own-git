import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { initRepo } from "../src/commands/init.js";
import { runAdd } from "../src/commands/add.js";
import { runCommit } from "../src/commands/commit.js";
import { runLog } from "../src/commands/log.js";
import { computeStatus, runStatus } from "../src/commands/status.js";
import { runDiff } from "../src/commands/diff.js";

describe("Phase 6: log, diff, and status (History & Snapshot Inspection)", () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-inspect-test-"));
    const initRes = initRepo(tempDir);
    gitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("mygit log", () => {
    it("should display commit history from latest to root", () => {
      fs.writeFileSync(path.join(tempDir, "f1.txt"), "v1", "utf-8");
      runAdd({ paths: ["f1.txt"], workTree: tempDir, gitDir });
      const c1 = runCommit({ message: "First commit", gitDir, workTree: tempDir });

      fs.writeFileSync(path.join(tempDir, "f2.txt"), "v2", "utf-8");
      runAdd({ paths: ["f2.txt"], workTree: tempDir, gitDir });
      const c2 = runCommit({ message: "Second commit", gitDir, workTree: tempDir });

      const logOutput = runLog({ gitDir });

      expect(logOutput).toContain(`commit ${c2.commitOid}`);
      expect(logOutput).toContain(`commit ${c1.commitOid}`);
      expect(logOutput).toContain("First commit");
      expect(logOutput).toContain("Second commit");

      // Verify c2 appears before c1 (reverse chronological)
      const idxC2 = logOutput.indexOf(c2.commitOid);
      const idxC1 = logOutput.indexOf(c1.commitOid);
      expect(idxC2).toBeLessThan(idxC1);
    });

    it("should support --oneline flag", () => {
      fs.writeFileSync(path.join(tempDir, "f.txt"), "hello", "utf-8");
      runAdd({ paths: ["f.txt"], workTree: tempDir, gitDir });
      const c1 = runCommit({ message: "Feat: add hello", gitDir, workTree: tempDir });

      const onelineOutput = runLog({ oneline: true, gitDir });
      const shortOid = c1.commitOid.slice(0, 7);
      expect(onelineOutput.trim()).toBe(`${shortOid} Feat: add hello`);
    });
  });

  describe("mygit status", () => {
    it("should detect untracked, staged, and unstaged modified files", () => {
      // 1. Initially clean
      let status = computeStatus(gitDir, tempDir);
      expect(status.clean).toBe(true);

      // 2. Add an untracked file
      fs.writeFileSync(path.join(tempDir, "untracked.txt"), "untracked", "utf-8");
      status = computeStatus(gitDir, tempDir);
      expect(status.untracked).toEqual(["untracked.txt"]);

      // 3. Stage a file
      fs.writeFileSync(path.join(tempDir, "staged.txt"), "ready", "utf-8");
      runAdd({ paths: ["staged.txt"], workTree: tempDir, gitDir });
      status = computeStatus(gitDir, tempDir);
      expect(status.staged.new).toEqual(["staged.txt"]);

      // 4. Commit it, then modify on disk without staging
      runCommit({ message: "Commit staged.txt", gitDir, workTree: tempDir });
      fs.writeFileSync(path.join(tempDir, "staged.txt"), "modified on disk", "utf-8");
      status = computeStatus(gitDir, tempDir);
      expect(status.unstaged.modified).toEqual(["staged.txt"]);

      // Verify text output contains proper sections
      const statusText = runStatus({ gitDir, workTree: tempDir });
      expect(statusText).toContain("Changes not staged for commit:");
      expect(statusText).toContain("modified:   staged.txt");
      expect(statusText).toContain("Untracked files:");
      expect(statusText).toContain("untracked.txt");
    });
  });

  describe("mygit diff", () => {
    it("should compute unstaged diff between worktree and index", () => {
      fs.writeFileSync(path.join(tempDir, "code.txt"), "line 1\nline 2\n", "utf-8");
      runAdd({ paths: ["code.txt"], workTree: tempDir, gitDir });

      // Modify without adding
      fs.writeFileSync(path.join(tempDir, "code.txt"), "line 1\nline 2 modified\nline 3\n", "utf-8");

      const diffOutput = runDiff({ staged: false, gitDir, workTree: tempDir });
      expect(diffOutput).toContain("diff --git a/code.txt b/code.txt");
      expect(diffOutput).toContain("--- a/code.txt");
      expect(diffOutput).toContain("+++ b/code.txt");
      expect(diffOutput).toContain("-line 2");
      expect(diffOutput).toContain("+line 2 modified");
      expect(diffOutput).toContain("+line 3");
    });

    it("should compute staged diff between index and HEAD", () => {
      fs.writeFileSync(path.join(tempDir, "file.txt"), "initial text\n", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });
      runCommit({ message: "init", gitDir, workTree: tempDir });

      // Stage a change
      fs.writeFileSync(path.join(tempDir, "file.txt"), "updated text\n", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });

      const stagedDiff = runDiff({ staged: true, gitDir, workTree: tempDir });
      expect(stagedDiff).toContain("diff --git a/file.txt b/file.txt");
      expect(stagedDiff).toContain("-initial text");
      expect(stagedDiff).toContain("+updated text");
    });
  });
});
