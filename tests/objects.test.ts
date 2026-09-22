import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { initRepo } from "../src/commands/init.js";
import { hashObject, readObject, GitObjectType } from "../src/core/objects.js";
import { runHashObject } from "../src/commands/hashObject.js";
import { runCatFile } from "../src/commands/catFile.js";

describe("Phase 2: Content-Addressable Storage (Objects, SHA-1, zlib)", () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mygit-objects-test-"));
    const initRes = initRepo(tempDir);
    gitDir = initRes.gitDir;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Core Object System (hashObject & readObject)", () => {
    it("should compute the exact SHA-1 hash for 'hello world\\n' matching official Git", () => {
      // In Git: printf "blob 12\0hello world\n" | sha1sum is 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
      const content = Buffer.from("hello world\n");
      const { oid } = hashObject(content, "blob", false, gitDir);

      expect(oid).toBe("3b18e512dba79e4c8300dd08aeb37f8e728b8dad");
    });

    it("should NOT write object to disk when write=false", () => {
      const content = Buffer.from("hello world\n");
      const { oid } = hashObject(content, "blob", false, gitDir);

      const objectPath = path.join(gitDir, "objects", oid.slice(0, 2), oid.slice(2));
      expect(fs.existsSync(objectPath)).toBe(false);
    });

    it("should write zlib-compressed object to .git/objects/xx/yyyy... when write=true", () => {
      const content = Buffer.from("hello world\n");
      const { oid } = hashObject(content, "blob", true, gitDir);

      const objectDir = path.join(gitDir, "objects", oid.slice(0, 2));
      const objectFile = path.join(objectDir, oid.slice(2));

      expect(fs.existsSync(objectDir)).toBe(true);
      expect(fs.existsSync(objectFile)).toBe(true);
    });

    it("should read and decompress an object with readObject", () => {
      const content = Buffer.from("hello world\n");
      const { oid } = hashObject(content, "blob", true, gitDir);

      const parsed = readObject(oid, gitDir);
      expect(parsed.type).toBe("blob");
      expect(parsed.size).toBe(12);
      expect(parsed.data.toString("utf-8")).toBe("hello world\n");
    });

    it("should throw an error when reading a non-existent object hash", () => {
      const fakeOid = "0123456789abcdef0123456789abcdef01234567";
      expect(() => readObject(fakeOid, gitDir)).toThrowError(/Not a valid object/i);
    });
  });

  describe("Plumbing Commands (hash-object & cat-file)", () => {
    it("runHashObject should read a file from disk and return its hash", () => {
      const testFile = path.join(tempDir, "sample.txt");
      fs.writeFileSync(testFile, "hello world\n", "utf-8");

      const oid = runHashObject({ filePath: testFile, write: true, gitDir });
      expect(oid).toBe("3b18e512dba79e4c8300dd08aeb37f8e728b8dad");

      // Verify it was written
      const parsed = readObject(oid, gitDir);
      expect(parsed.data.toString("utf-8")).toBe("hello world\n");
    });

    it("runCatFile with flag -p should return pretty-printed content", () => {
      const content = Buffer.from("arbitrary text for git object");
      const { oid } = hashObject(content, "blob", true, gitDir);

      const output = runCatFile({ oid, mode: "pretty", gitDir });
      expect(output).toBe("arbitrary text for git object");
    });

    it("runCatFile with flag -t should return the object type", () => {
      const content = Buffer.from("sample");
      const { oid } = hashObject(content, "blob", true, gitDir);

      const output = runCatFile({ oid, mode: "type", gitDir });
      expect(output).toBe("blob");
    });

    it("runCatFile with flag -s should return the object size in bytes", () => {
      const content = Buffer.from("12345");
      const { oid } = hashObject(content, "blob", true, gitDir);

      const output = runCatFile({ oid, mode: "size", gitDir });
      expect(output).toBe("5");
    });
  });
});
