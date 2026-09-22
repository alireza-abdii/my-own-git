import { hashObject } from "./objects.js";

export interface GitIdentity {
  name: string;
  email: string;
  timestamp: number;
  timezone: string;
}

export interface CommitData {
  treeOid: string;
  parentOids?: string[];
  author?: GitIdentity;
  committer?: GitIdentity;
  message: string;
}

export interface ParsedCommit {
  treeOid: string;
  parentOids: string[];
  author: GitIdentity;
  committer: GitIdentity;
  message: string;
}

/**
 * Calculates current local timezone offset in Git format (+0330, -0500, +0000).
 */
export function formatTimezoneOffset(date: Date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60).toString().padStart(2, "0");
  const mins = (absMinutes % 60).toString().padStart(2, "0");
  return `${sign}${hours}${mins}`;
}

/**
 * Retrieves default author / committer identity from environment variables or defaults.
 */
export function getDefaultIdentity(): GitIdentity {
  const name = process.env.GIT_AUTHOR_NAME || "Build-Git User";
  const email = process.env.GIT_AUTHOR_EMAIL || "user@buildgit.local";
  const now = new Date();
  const timestamp = Math.floor(now.getTime() / 1000);
  const timezone = formatTimezoneOffset(now);

  return { name, email, timestamp, timezone };
}

function formatIdentity(identity: GitIdentity): string {
  return `${identity.name} <${identity.email}> ${identity.timestamp} ${identity.timezone}`;
}

function parseIdentity(str: string): GitIdentity {
  const match = str.match(/^(.*) <(.*)> (\d+) ([+-]\d{4})$/);
  if (!match) {
    return {
      name: str,
      email: "unknown@unknown",
      timestamp: 0,
      timezone: "+0000",
    };
  }
  return {
    name: match[1],
    email: match[2],
    timestamp: parseInt(match[3], 10),
    timezone: match[4],
  };
}

/**
 * Creates and writes a commit object to .git/objects/
 */
export function createCommit(data: CommitData, gitDir?: string): string {
  const author = data.author || getDefaultIdentity();
  const committer = data.committer || author;

  const lines: string[] = [];
  lines.push(`tree ${data.treeOid}`);

  if (data.parentOids) {
    for (const parent of data.parentOids) {
      if (parent) {
        lines.push(`parent ${parent}`);
      }
    }
  }

  lines.push(`author ${formatIdentity(author)}`);
  lines.push(`committer ${formatIdentity(committer)}`);
  lines.push(""); // Blank line separator
  lines.push(data.message.trimEnd() + "\n");

  const commitContent = Buffer.from(lines.join("\n"), "utf-8");
  const { oid } = hashObject(commitContent, "commit", true, gitDir);
  return oid;
}

/**
 * Parses raw data of a commit object.
 */
export function parseCommit(data: Buffer): ParsedCommit {
  const str = data.toString("utf-8");
  const blankLineIdx = str.indexOf("\n\n");

  const headerPart = blankLineIdx !== -1 ? str.slice(0, blankLineIdx) : str;
  const messagePart = blankLineIdx !== -1 ? str.slice(blankLineIdx + 2) : "";

  let treeOid = "";
  const parentOids: string[] = [];
  let author: GitIdentity = { name: "", email: "", timestamp: 0, timezone: "+0000" };
  let committer: GitIdentity = { name: "", email: "", timestamp: 0, timezone: "+0000" };

  const headerLines = headerPart.split("\n");
  for (const line of headerLines) {
    if (line.startsWith("tree ")) {
      treeOid = line.slice(5).trim();
    } else if (line.startsWith("parent ")) {
      parentOids.push(line.slice(7).trim());
    } else if (line.startsWith("author ")) {
      author = parseIdentity(line.slice(7).trim());
    } else if (line.startsWith("committer ")) {
      committer = parseIdentity(line.slice(10).trim());
    }
  }

  return {
    treeOid,
    parentOids,
    author,
    committer,
    message: messagePart,
  };
}
