import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { initRepo } from "../src/commands/init.js";
import { readIndex, writeIndex, IndexEntry } from "../src/core/index.js";
import { runAdd } from "../src/commands/add.js";
import { runLsFiles } from "../src/commands/lsFiles.js";
import { readObject } from "../src/core/objects.js";

describe("Phase 3: The Staging Area (DIRC v2 Index & add command)", () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-index-test-"));
    const initRes = initRepo(tempDir);
    gitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Core Binary Index (readIndex & writeIndex)", () => {
    it("should return empty entries when .git/index does not exist yet", () => {
      const entries = readIndex(gitDir);
      expect(entries).toEqual([]);
    });

    it("should write and read back index entries with correct binary padding and checksum", () => {
      const entry: IndexEntry = {
        ctimeSec: 1600000000,
        ctimeNano: 0,
        mtimeSec: 1600000000,
        mtimeNano: 0,
        dev: 0,
        ino: 0,
        mode: 0o100644,
        uid: 1000,
        gid: 1000,
        size: 12,
        oid: "3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
        flags: 0,
        path: "hello.txt",
      };

      writeIndex([entry], gitDir);

      const loaded = readIndex(gitDir);
      expect(loaded.length).toBe(1);
      expect(loaded[0].path).toBe("hello.txt");
      expect(loaded[0].oid).toBe("3b18e512dba79e4c8300dd08aeb37f8e728b8dad");
      expect(loaded[0].mode).toBe(0o100644);
      expect(loaded[0].size).toBe(12);
    });
  });

  describe("mygit add command", () => {
    it("should create a blob in objects and add file entry to .git/index", () => {
      const filePath = path.join(tempDir, "file1.txt");
      fs.writeFileSync(filePath, "content of file 1\n", "utf-8");

      runAdd({ paths: ["file1.txt"], workTree: tempDir, gitDir });

      const entries = readIndex(gitDir);
      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("file1.txt");

      // Verify blob exists in database
      const blob = readObject(entries[0].oid, gitDir);
      expect(blob.data.toString("utf-8")).toBe("content of file 1\n");
    });

    it("should keep entries sorted alphabetically by path", () => {
      fs.writeFileSync(path.join(tempDir, "z.txt"), "z", "utf-8");
      fs.writeFileSync(path.join(tempDir, "a.txt"), "a", "utf-8");
      fs.writeFileSync(path.join(tempDir, "m.txt"), "m", "utf-8");

      runAdd({ paths: ["z.txt", "a.txt", "m.txt"], workTree: tempDir, gitDir });

      const entries = readIndex(gitDir);
      expect(entries.map((e) => e.path)).toEqual(["a.txt", "m.txt", "z.txt"]);
    });

    it("should update the existing index entry when an already added file changes", () => {
      const filePath = path.join(tempDir, "file.txt");
      fs.writeFileSync(filePath, "initial\n", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });

      const firstEntries = readIndex(gitDir);
      const firstOid = firstEntries[0].oid;

      // Modify file and add again
      fs.writeFileSync(filePath, "updated content\n", "utf-8");
      runAdd({ paths: ["file.txt"], workTree: tempDir, gitDir });

      const secondEntries = readIndex(gitDir);
      expect(secondEntries.length).toBe(1);
      expect(secondEntries[0].oid).not.toBe(firstOid);

      const blob = readObject(secondEntries[0].oid, gitDir);
      expect(blob.data.toString("utf-8")).toBe("updated content\n");
    });
  });

  describe("mygit ls-files command", () => {
    it("should display staged files matching git ls-files --stage format", () => {
      fs.writeFileSync(path.join(tempDir, "foo.txt"), "hello world\n", "utf-8");
      runAdd({ paths: ["foo.txt"], workTree: tempDir, gitDir });

      const output = runLsFiles({ stage: true, gitDir });
      expect(output.trim()).toBe("100644 3b18e512dba79e4c8300dd08aeb37f8e728b8dad 0\tfoo.txt");
    });
  });

  describe("Official Git Compatibility", () => {
    it("official git should be able to read index created by mygit", () => {
      fs.writeFileSync(path.join(tempDir, "hello.txt"), "hello world\n", "utf-8");
      runAdd({ paths: ["hello.txt"], workTree: tempDir, gitDir });

      // Run official git command in tempDir to check compatibility
      const gitOutput = execSync("git ls-files --stage", {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(gitOutput.trim()).toBe("100644 3b18e512dba79e4c8300dd08aeb37f8e728b8dad 0\thello.txt");
    });
  });
});
