import { findGitDir, readObject } from "../core/objects.js";
import { resolveHead } from "../core/refs.js";
import { parseCommit } from "../core/commit.js";

export interface LogOptions {
  oneline?: boolean;
  maxCount?: number;
  commitOid?: string;
  gitDir?: string;
}

/**
 * Formats a Unix timestamp and timezone offset into a Git-like date string.
 */
function formatDate(timestamp: number, timezone: string): string {
  const date = new Date(timestamp * 1000);
  return date.toUTCString().replace("GMT", timezone);
}

/**
 * Traverses commit history backwards from HEAD (or a given commit) and formats the log output.
 */
export function runLog(options: LogOptions = {}): string {
  const resolvedGitDir = options.gitDir || findGitDir();

  let currentOid = options.commitOid;
  if (!currentOid) {
    const head = resolveHead(resolvedGitDir);
    currentOid = head.commitOid;
  }

  if (!currentOid) {
    return "fatal: your current branch does not have any commits yet\n";
  }

  const entries: string[] = [];
  let count = 0;
  const max = options.maxCount || Infinity;

  while (currentOid && count < max) {
    const commitObj = readObject(currentOid, resolvedGitDir);
    if (commitObj.type !== "commit") {
      break;
    }

    const parsed = parseCommit(commitObj.data);

    if (options.oneline) {
      const shortOid = currentOid.slice(0, 7);
      const firstLine = parsed.message.trim().split("\n")[0] || "";
      entries.push(`${shortOid} ${firstLine}`);
    } else {
      const dateStr = formatDate(parsed.author.timestamp, parsed.author.timezone);
      const msgPadded = parsed.message
        .trimEnd()
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n");

      const block = [
        `commit ${currentOid}`,
        `Author: ${parsed.author.name} <${parsed.author.email}>`,
        `Date:   ${dateStr}`,
        "",
        msgPadded,
      ].join("\n");

      entries.push(block);
    }

    count++;
    // Advance to parent commit
    currentOid = parsed.parentOids[0];
  }

  return entries.join(options.oneline ? "\n" : "\n\n") + (entries.length ? "\n" : "");
}
