import * as fs from "node:fs";
import * as path from "node:path";

export interface InitResult {
  status: "initialized" | "reinitialized";
  gitDir: string;
}

/**
 * Initializes a new Git repository by creating the standard .git directory skeleton.
 *
 * @param targetDir - The root directory of the working tree (defaults to process.cwd()).
 * @returns InitResult indicating whether it was freshly initialized or reinitialized.
 */
export function initRepo(targetDir: string = process.cwd()): InitResult {
  const resolvedTarget = path.resolve(targetDir);
  const gitDir = path.join(resolvedTarget, ".git");

  const isReinit = fs.existsSync(gitDir);

  // 1. Create essential directories
  const directories = [
    gitDir,
    path.join(gitDir, "objects"),
    path.join(gitDir, "refs"),
    path.join(gitDir, "refs", "heads"),
    path.join(gitDir, "refs", "tags"),
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 2. Initialize HEAD file pointing to main branch
  const headFile = path.join(gitDir, "HEAD");
  if (!fs.existsSync(headFile)) {
    fs.writeFileSync(headFile, "ref: refs/heads/main\n", "utf-8");
  }

  // 3. Optional: Write a minimal config file
  const configFile = path.join(gitDir, "config");
  if (!fs.existsSync(configFile)) {
    const defaultConfigFileContent =
      "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n";
    fs.writeFileSync(configFile, defaultConfigFileContent, "utf-8");
  }

  return {
    status: isReinit ? "reinitialized" : "initialized",
    gitDir,
  };
}
