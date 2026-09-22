import * as crypto from "node:crypto";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as path from "node:path";

export type GitObjectType = "blob" | "tree" | "commit" | "tag";

export interface GitObject {
  type: GitObjectType;
  size: number;
  data: Buffer;
}

export interface HashObjectResult {
  oid: string;
  storeBuffer: Buffer;
}

/**
 * Searches upward from startDir for the nearest .git directory.
 */
export function findGitDir(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, ".git");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("fatal: not a git repository (or any of the parent directories): .git");
    }
    current = parent;
  }
}

/**
 * Creates the standard Git object payload: "<type> <size>\0<content>"
 * Computes its SHA-1 hash, and optionally writes it to .git/objects/xx/yy...
 */
export function hashObject(
  content: Buffer,
  type: GitObjectType = "blob",
  write: boolean = false,
  gitDir?: string
): HashObjectResult {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const storeBuffer = Buffer.concat([header, content]);

  // Compute 40-character hexadecimal SHA-1 hash
  const oid = crypto.createHash("sha1").update(storeBuffer).digest("hex");

  if (write) {
    const resolvedGitDir = gitDir || findGitDir();
    const objectDir = path.join(resolvedGitDir, "objects", oid.slice(0, 2));
    const objectPath = path.join(objectDir, oid.slice(2));

    if (!fs.existsSync(objectPath)) {
      if (!fs.existsSync(objectDir)) {
        fs.mkdirSync(objectDir, { recursive: true });
      }
      // Compress with zlib deflate
      const compressed = zlib.deflateSync(storeBuffer);
      fs.writeFileSync(objectPath, compressed);
    }
  }

  return { oid, storeBuffer };
}

/**
 * Reads an object from .git/objects/xx/yy..., decompresses it with zlib inflate,
 * and extracts the type, size, and content.
 */
export function readObject(oid: string, gitDir?: string): GitObject {
  const resolvedGitDir = gitDir || findGitDir();

  if (!oid || oid.length !== 40) {
    throw new Error(`fatal: Not a valid object name ${oid}`);
  }

  const objectPath = path.join(resolvedGitDir, "objects", oid.slice(0, 2), oid.slice(2));

  if (!fs.existsSync(objectPath)) {
    throw new Error(`fatal: Not a valid object name ${oid}`);
  }

  const compressedData = fs.readFileSync(objectPath);
  const decompressed = zlib.inflateSync(compressedData);

  // The header and data are separated by the first null byte (\0)
  const nullIndex = decompressed.indexOf(0);
  if (nullIndex === -1) {
    throw new Error(`fatal: Corrupt object ${oid} (missing null byte delimiter)`);
  }

  const header = decompressed.subarray(0, nullIndex).toString("utf-8");
  const [type, sizeStr] = header.split(" ");
  const size = parseInt(sizeStr, 10);
  const data = decompressed.subarray(nullIndex + 1);

  return {
    type: type as GitObjectType,
    size,
    data,
  };
}
