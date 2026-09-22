import { computeStatus, type RepoStatus } from "../core/status.js";

export { computeStatus, type RepoStatus };

export interface StatusOptions {
  gitDir?: string;
  workTree?: string;
}

/**
 * Formats repository status in human-readable Git format.
 */
export function runStatus(options: StatusOptions = {}): string {
  const status = computeStatus(options.gitDir, options.workTree);
  const lines: string[] = [];

  lines.push(`On branch ${status.branch}\n`);

  if (status.clean) {
    lines.push("nothing to commit, working tree clean\n");
    return lines.join("\n");
  }

  // Staged changes
  const hasStaged =
    status.staged.new.length > 0 ||
    status.staged.modified.length > 0 ||
    status.staged.deleted.length > 0;

  if (hasStaged) {
    lines.push("Changes to be committed:");
    lines.push('  (use "mygit rm --cached <file>..." to unstage)');
    for (const f of status.staged.new) {
      lines.push(`\tnew file:   ${f}`);
    }
    for (const f of status.staged.modified) {
      lines.push(`\tmodified:   ${f}`);
    }
    for (const f of status.staged.deleted) {
      lines.push(`\tdeleted:    ${f}`);
    }
    lines.push("");
  }

  // Unstaged changes
  const hasUnstaged =
    status.unstaged.modified.length > 0 || status.unstaged.deleted.length > 0;

  if (hasUnstaged) {
    lines.push("Changes not staged for commit:");
    lines.push('  (use "mygit add <file>..." to update what will be committed)');
    for (const f of status.unstaged.modified) {
      lines.push(`\tmodified:   ${f}`);
    }
    for (const f of status.unstaged.deleted) {
      lines.push(`\tdeleted:    ${f}`);
    }
    lines.push("");
  }

  // Untracked files
  if (status.untracked.length > 0) {
    lines.push("Untracked files:");
    lines.push('  (use "mygit add <file>..." to include in what will be committed)');
    for (const f of status.untracked) {
      lines.push(`\t${f}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
