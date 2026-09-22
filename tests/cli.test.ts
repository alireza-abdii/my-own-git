import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";

const CLI_PATH = path.resolve(__dirname, "../dist/index.js");

function runCli(args: string[], cwd: string = process.cwd()): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile("node", [CLI_PATH, ...args], { cwd }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        code: error ? (error.code as number) || 1 : 0,
      });
    });
  });
}

describe("Phase 10: Real CLI Tool Executable & Flags", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-cli-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("prints version on --version, -v, and version flag with exit code 0", async () => {
    const res1 = await runCli(["--version"], tempDir);
    expect(res1.code).toBe(0);
    expect(res1.stdout).toContain("mygit version 0.1.0");

    const res2 = await runCli(["-v"], tempDir);
    expect(res2.code).toBe(0);
    expect(res2.stdout).toContain("mygit version 0.1.0");
  });

  it("prints help on --help, -h with exit code 0", async () => {
    const resHelp = await runCli(["--help"], tempDir);
    expect(resHelp.code).toBe(0);
    expect(resHelp.stdout).toContain("Usage: mygit");
    expect(resHelp.stdout).toContain("start a working area");
    expect(resHelp.stdout).toContain("init");
    expect(resHelp.stdout).toContain("commit");
    expect(resHelp.stdout).toContain("merge");

    const resH = await runCli(["-h"], tempDir);
    expect(resH.code).toBe(0);
    expect(resH.stdout).toContain("Usage: mygit");
  });

  it("returns exit code 1 when no command is provided", async () => {
    const res = await runCli([], tempDir);
    expect(res.code).toBe(1);
    expect(res.stdout).toContain("Usage: mygit");
  });

  it("returns exit code 1 and error message on unknown command", async () => {
    const res = await runCli(["foobar"], tempDir);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("mygit: 'foobar' is not a mygit command");
  });

  it("can execute a basic workflow end-to-end via CLI binary invocation", async () => {
    // 1. init
    const initRes = await runCli(["init"], tempDir);
    expect(initRes.code).toBe(0);
    expect(initRes.stdout).toContain("Initialized empty Git repository");

    // 2. add
    const file = path.join(tempDir, "file.txt");
    fs.writeFileSync(file, "hello from cli test", "utf-8");
    const addRes = await runCli(["add", "file.txt"], tempDir);
    expect(addRes.code).toBe(0);

    // 3. commit
    const commitRes = await runCli(["commit", "-m", "cli test commit"], tempDir);
    expect(commitRes.code).toBe(0);
    expect(commitRes.stdout).toContain("cli test commit");

    // 4. log
    const logRes = await runCli(["log", "--oneline"], tempDir);
    expect(logRes.code).toBe(0);
    expect(logRes.stdout).toContain("cli test commit");
  });
});
