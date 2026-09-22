import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { initRepo } from "../src/commands/init.js";

describe("mygit init (TDD: Red -> Green)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create the .git directory structure and initial HEAD file", () => {
    const result = initRepo(tempDir);

    const gitDir = path.join(tempDir, ".git");
    const objectsDir = path.join(gitDir, "objects");
    const refsHeadsDir = path.join(gitDir, "refs", "heads");
    const headFile = path.join(gitDir, "HEAD");

    expect(fs.existsSync(gitDir)).toBe(true);
    expect(fs.statSync(gitDir).isDirectory()).toBe(true);

    expect(fs.existsSync(objectsDir)).toBe(true);
    expect(fs.statSync(objectsDir).isDirectory()).toBe(true);

    expect(fs.existsSync(refsHeadsDir)).toBe(true);
    expect(fs.statSync(refsHeadsDir).isDirectory()).toBe(true);

    expect(fs.existsSync(headFile)).toBe(true);
    const headContent = fs.readFileSync(headFile, "utf-8");
    expect(headContent).toBe("ref: refs/heads/main\n");

    expect(result.status).toBe("initialized");
  });

  it("should handle re-initialization safely without errors", () => {
    initRepo(tempDir);
    const secondResult = initRepo(tempDir);

    expect(secondResult.status).toBe("reinitialized");
    expect(fs.existsSync(path.join(tempDir, ".git"))).toBe(true);
  });
});
