import { addRemote, getRemotes, RemoteInfo } from "../core/remotes.js";
import { findGitDir } from "../core/objects.js";

export interface RemoteCommandOptions {
  add?: { name: string; url: string };
  list?: boolean;
  verbose?: boolean;
  gitDir?: string;
}

/**
 * Manages set of tracked repositories.
 */
export function runRemote(options: RemoteCommandOptions = {}): string {
  const resolvedGitDir = options.gitDir || findGitDir();

  if (options.add) {
    addRemote(options.add.name, options.add.url, resolvedGitDir);
    return "";
  }

  const remotes = getRemotes(resolvedGitDir);
  if (remotes.length === 0) return "";

  if (options.verbose) {
    return remotes
      .map((r) => `${r.name}\t${r.url} (fetch)\n${r.name}\t${r.url} (push)`)
      .join("\n") + "\n";
  }

  return remotes.map((r) => r.name).join("\n") + "\n";
}
