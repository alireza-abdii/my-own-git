import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { findGitDir } from "./objects.js";

export interface IndexEntry {
  ctimeSec: number;
  ctimeNano: number;
  mtimeSec: number;
  mtimeNano: number;
  dev: number;
  ino: number;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  oid: string; // 40-char hex
  flags: number;
  path: string;
}

/**
 * Reads and parses the binary .git/index file (DIRC v2).
 */
export function readIndex(gitDir?: string): IndexEntry[] {
  const resolvedGitDir = gitDir || findGitDir();
  const indexPath = path.join(resolvedGitDir, "index");

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  const buf = fs.readFileSync(indexPath);

  // Minimum index file length: 12 bytes header + 20 bytes checksum = 32 bytes
  if (buf.length < 32) {
    throw new Error("fatal: index file corrupt (too small)");
  }

  // 1. Verify DIRC signature
  const signature = buf.subarray(0, 4).toString("ascii");
  if (signature !== "DIRC") {
    throw new Error(`fatal: invalid index signature '${signature}', expected 'DIRC'`);
  }

  // 2. Verify version (v2)
  const version = buf.readUInt32BE(4);
  if (version !== 2) {
    throw new Error(`fatal: unsupported index version ${version}, expected version 2`);
  }

  // 3. Entry count
  const count = buf.readUInt32BE(8);

  // 4. Verify trailing 20-byte SHA-1 checksum
  const contentToHash = buf.subarray(0, buf.length - 20);
  const actualChecksum = crypto.createHash("sha1").update(contentToHash).digest();
  const expectedChecksum = buf.subarray(buf.length - 20);

  if (!actualChecksum.equals(expectedChecksum)) {
    throw new Error("fatal: index file corrupt (checksum mismatch)");
  }

  // 5. Parse entries
  const entries: IndexEntry[] = [];
  let offset = 12;

  for (let i = 0; i < count; i++) {
    const entryStart = offset;

    const ctimeSec = buf.readUInt32BE(offset + 0);
    const ctimeNano = buf.readUInt32BE(offset + 4);
    const mtimeSec = buf.readUInt32BE(offset + 8);
    const mtimeNano = buf.readUInt32BE(offset + 12);
    const dev = buf.readUInt32BE(offset + 16);
    const ino = buf.readUInt32BE(offset + 20);
    const mode = buf.readUInt32BE(offset + 24);
    const uid = buf.readUInt32BE(offset + 28);
    const gid = buf.readUInt32BE(offset + 32);
    const size = buf.readUInt32BE(offset + 36);

    const oidBuf = buf.subarray(offset + 40, offset + 60);
    const oid = oidBuf.toString("hex");

    const flags = buf.readUInt16BE(offset + 60);

    // Path starts at byte 62 and ends at the first null byte
    let pathEnd = offset + 62;
    while (pathEnd < buf.length - 20 && buf[pathEnd] !== 0) {
      pathEnd++;
    }

    const filePath = buf.subarray(offset + 62, pathEnd).toString("utf-8");

    entries.push({
      ctimeSec,
      ctimeNano,
      mtimeSec,
      mtimeNano,
      dev,
      ino,
      mode,
      uid,
      gid,
      size,
      oid,
      flags,
      path: filePath,
    });

    // Advance offset to the next 8-byte boundary
    const entryLenWithoutPad = 62 + (pathEnd - (offset + 62));
    const padLen = 8 - (entryLenWithoutPad % 8);
    offset = entryStart + entryLenWithoutPad + padLen;
  }

  return entries;
}

/**
 * Serializes and writes index entries to .git/index in standard DIRC v2 binary format.
 */
export function writeIndex(entries: IndexEntry[], gitDir?: string): void {
  const resolvedGitDir = gitDir || findGitDir();
  const indexPath = path.join(resolvedGitDir, "index");

  // Entries in Git index must always be sorted alphabetically by path
  const sortedEntries = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  // 1. Header (12 bytes)
  const header = Buffer.alloc(12);
  header.write("DIRC", 0, 4, "ascii");
  header.writeUInt32BE(2, 4); // Version 2
  header.writeUInt32BE(sortedEntries.length, 8); // Number of entries

  // 2. Entries
  const entryBuffers: Buffer[] = [];

  for (const entry of sortedEntries) {
    const pathBuf = Buffer.from(entry.path, "utf-8");
    const entryLenWithoutPad = 62 + pathBuf.length;
    const padLen = 8 - (entryLenWithoutPad % 8);
    const totalEntryLen = entryLenWithoutPad + padLen;

    const entryBuf = Buffer.alloc(totalEntryLen);

    entryBuf.writeUInt32BE(entry.ctimeSec >>> 0, 0);
    entryBuf.writeUInt32BE(entry.ctimeNano >>> 0, 4);
    entryBuf.writeUInt32BE(entry.mtimeSec >>> 0, 8);
    entryBuf.writeUInt32BE(entry.mtimeNano >>> 0, 12);
    entryBuf.writeUInt32BE(entry.dev >>> 0, 16);
    entryBuf.writeUInt32BE(entry.ino >>> 0, 20);
    entryBuf.writeUInt32BE(entry.mode >>> 0, 24);
    entryBuf.writeUInt32BE(entry.uid >>> 0, 28);
    entryBuf.writeUInt32BE(entry.gid >>> 0, 32);
    entryBuf.writeUInt32BE(entry.size >>> 0, 36);

    Buffer.from(entry.oid, "hex").copy(entryBuf, 40);

    // Flags: 16-bit. Lower 12 bits is path length
    const flagVal = (entry.flags & 0xf000) | Math.min(pathBuf.length, 0x0fff);
    entryBuf.writeUInt16BE(flagVal, 60);

    pathBuf.copy(entryBuf, 62);
    // The rest of the bytes are already 0 from Buffer.alloc

    entryBuffers.push(entryBuf);
  }

  const body = Buffer.concat([header, ...entryBuffers]);

  // 3. Trailing 20-byte SHA-1 Checksum
  const checksum = crypto.createHash("sha1").update(body).digest();
  const finalBuffer = Buffer.concat([body, checksum]);

  fs.writeFileSync(indexPath, finalBuffer);
}
