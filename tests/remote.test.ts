import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { initRepo } from "../src/commands/init.js";
import { runAdd } from "../src/commands/add.js";
import { runCommit } from "../src/commands/commit.js";
import { addRemote, getRemoteUrl } from "../src/core/remotes.js";
import { runClone } from "../src/commands/clone.js";
import { runPush } from "../src/commands/push.js";
import { runFetch } from "../src/commands/fetch.js";
import { runPull } from "../src/commands/pull.js";
import { resolveHead } from "../src/core/refs.js";

describe("Phase 9: Remotes (clone, fetch, push, pull)", () => {
  let tempBase: string;
  let remoteDir: string;
  let remoteGitDir: string;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-remote-test-"));
    remoteDir = path.join(tempBase, "remote-repo");
    const initRes = initRepo(remoteDir);
    remoteGitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  describe("Remote Configuration", () => {
    it("should add and read remote URL in config", () => {
      addRemote("origin", "/path/to/repo", remoteGitDir);
      const url = getRemoteUrl("origin", remoteGitDir);
      expect(url).toBe("/path/to/repo");
    });
  });

  describe("mygit clone", () => {
    it("should clone a repository and extract its working tree files", () => {
      // 1. Commit files in the remote repo
      fs.writeFileSync(path.join(remoteDir, "hello.txt"), "hello from remote\n", "utf-8");
      fs.mkdirSync(path.join(remoteDir, "pkg"), { recursive: true });
      fs.writeFileSync(path.join(remoteDir, "pkg", "main.js"), "console.log('remote');", "utf-8");
      runAdd({ paths: ["."], workTree: remoteDir, gitDir: remoteGitDir });
      runCommit({ message: "Initial remote commit", gitDir: remoteGitDir, workTree: remoteDir });

      // 2. Clone it into localDir
      const localDir = path.join(tempBase, "local-clone");
      runClone({ remotePath: remoteDir, targetDir: localDir });

      // 3. Verify local clone has extracted files
      expect(fs.existsSync(path.join(localDir, "hello.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(localDir, "hello.txt"), "utf-8")).toBe("hello from remote\n");
      expect(fs.existsSync(path.join(localDir, "pkg", "main.js"))).toBe(true);

      // 4. Verify remote tracking branch exists in clone
      const localGitDir = path.join(localDir, ".git");
      const remoteTrackingRef = path.join(localGitDir, "refs", "remotes", "origin", "main");
      expect(fs.existsSync(remoteTrackingRef)).toBe(true);
    });
  });

  describe("mygit push, fetch, and pull", () => {
    it("should push commits from clone to remote and pull them in another clone", () => {
      // 1. Setup origin repo with commit 1
      fs.writeFileSync(path.join(remoteDir, "seed.txt"), "seed", "utf-8");
      runAdd({ paths: ["."], workTree: remoteDir, gitDir: remoteGitDir });
      runCommit({ message: "Seed commit", gitDir: remoteGitDir, workTree: remoteDir });

      // 2. Clone to dev1 and dev2
      const dev1Dir = path.join(tempBase, "dev1");
      const dev2Dir = path.join(tempBase, "dev2");
      runClone({ remotePath: remoteDir, targetDir: dev1Dir });
      runClone({ remotePath: remoteDir, targetDir: dev2Dir });

      // 3. In dev1, create a new commit and push to origin
      const dev1GitDir = path.join(dev1Dir, ".git");
      fs.writeFileSync(path.join(dev1Dir, "dev1.txt"), "work by dev1", "utf-8");
      runAdd({ paths: ["dev1.txt"], workTree: dev1Dir, gitDir: dev1GitDir });
      const dev1Commit = runCommit({ message: "Feature from dev1", gitDir: dev1GitDir, workTree: dev1Dir });

      runPush({ remoteName: "origin", branchName: "main", gitDir: dev1GitDir });

      // Verify origin's refs/heads/main now points to dev1Commit
      const originHeadCommit = fs.readFileSync(path.join(remoteGitDir, "refs", "heads", "main"), "utf-8").trim();
      expect(originHeadCommit).toBe(dev1Commit.commitOid);

      // 4. In dev2, run pull
      const dev2GitDir = path.join(dev2Dir, ".git");
      runPull({ remoteName: "origin", branchName: "main", gitDir: dev2GitDir, workTree: dev2Dir });

      // dev2 now has dev1.txt!
      expect(fs.existsSync(path.join(dev2Dir, "dev1.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(dev2Dir, "dev1.txt"), "utf-8")).toBe("work by dev1");
    });
  });

  describe("Official Git Compatibility", () => {
    it("official git clone should be able to clone our mygit repository", () => {
      fs.writeFileSync(path.join(remoteDir, "readme.md"), "# Official Git Test\n", "utf-8");
      runAdd({ paths: ["."], workTree: remoteDir, gitDir: remoteGitDir });
      runCommit({ message: "official git clone test", gitDir: remoteGitDir, workTree: remoteDir });

      const officialCloneDir = path.join(tempBase, "official-clone");
      execSync(`git clone "${remoteDir}" "${officialCloneDir}"`, { encoding: "utf-8" });

      expect(fs.existsSync(path.join(officialCloneDir, "readme.md"))).toBe(true);
    });
  });
});
