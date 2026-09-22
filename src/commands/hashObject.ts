import * as fs from "node:fs";
import * as path from "node:path";
import { hashObject } from "../core/objects.js";

export interface HashObjectOptions {
  filePath: string;
  write?: boolean;
  gitDir?: string;
}

/**
 * Computes the object ID (SHA-1) of a file, and optionally writes it to the object database.
 */
export function runHashObject(options: HashObjectOptions): string {
  const resolvedPath = path.resolve(options.filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`fatal: Cannot open '${options.filePath}': No such file or directory`);
  }

  const content = fs.readFileSync(resolvedPath);
  const { oid } = hashObject(content, "blob", !!options.write, options.gitDir);
  return oid;
}
