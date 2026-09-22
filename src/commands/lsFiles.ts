import { readIndex } from "../core/index.js";

export interface LsFilesOptions {
  stage?: boolean;
  gitDir?: string;
}

/**
 * Lists staged files from .git/index.
 */
export function runLsFiles(options: LsFilesOptions = {}): string {
  const entries = readIndex(options.gitDir);

  if (options.stage) {
    return entries
      .map((e) => {
        const modeStr = e.mode.toString(8).padStart(6, "0");
        return `${modeStr} ${e.oid} 0\t${e.path}`;
      })
      .join("\n");
  }

  return entries.map((e) => e.path).join("\n");
}
