import * as fs from "node:fs";
import * as path from "node:path";
import { findGitDir } from "./objects.js";

export interface RemoteInfo {
  name: string;
  url: string;
}

/**
 * Parses remotes from .git/config.
 */
export function getRemotes(gitDir?: string): RemoteInfo[] {
  const resolvedGitDir = gitDir || findGitDir();
  const configPath = path.join(resolvedGitDir, "config");

  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const lines = content.split("\n");
  const remotes: RemoteInfo[] = [];

  let currentRemoteName: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[remote\s+"([^"]+)"\]$/);
    if (sectionMatch) {
      currentRemoteName = sectionMatch[1];
      continue;
    }

    if (currentRemoteName && trimmed.startsWith("url =")) {
      const url = trimmed.slice(5).trim();
      remotes.push({ name: currentRemoteName, url });
      currentRemoteName = null;
    }
  }

  return remotes;
}

/**
 * Retrieves the URL/path of a specified remote.
 */
export function getRemoteUrl(name: string, gitDir?: string): string | undefined {
  const remotes = getRemotes(gitDir);
  const found = remotes.find((r) => r.name === name);
  return found?.url;
}

/**
 * Adds a remote to .git/config.
 */
export function addRemote(name: string, url: string, gitDir?: string): void {
  const resolvedGitDir = gitDir || findGitDir();
  const configPath = path.join(resolvedGitDir, "config");

  if (getRemoteUrl(name, resolvedGitDir)) {
    throw new Error(`fatal: remote ${name} already exists.`);
  }

  const remoteBlock = `\n[remote "${name}"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/${name}/*\n`;
  fs.appendFileSync(configPath, remoteBlock, "utf-8");
}

/**
 * Copies all missing Git objects from source repository to target repository.
 */
export function copyMissingObjects(sourceGitDir: string, targetGitDir: string): void {
  const srcObjDir = path.join(sourceGitDir, "objects");
  const dstObjDir = path.join(targetGitDir, "objects");

  if (!fs.existsSync(srcObjDir)) return;

  const prefixes = fs.readdirSync(srcObjDir);
  for (const prefix of prefixes) {
    // Skip info and pack directories if any
    if (prefix === "info" || prefix === "pack") continue;

    const srcPrefixDir = path.join(srcObjDir, prefix);
    if (!fs.statSync(srcPrefixDir).isDirectory()) continue;

    const dstPrefixDir = path.join(dstObjDir, prefix);
    if (!fs.existsSync(dstPrefixDir)) {
      fs.mkdirSync(dstPrefixDir, { recursive: true });
    }

    const files = fs.readdirSync(srcPrefixDir);
    for (const file of files) {
      const srcFile = path.join(srcPrefixDir, file);
      const dstFile = path.join(dstPrefixDir, file);

      if (!fs.existsSync(dstFile)) {
        fs.copyFileSync(srcFile, dstFile);
      }
    }
  }
}
