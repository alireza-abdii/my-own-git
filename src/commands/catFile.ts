import { readObject } from "../core/objects.js";

export type CatFileMode = "pretty" | "type" | "size";

export interface CatFileOptions {
  oid: string;
  mode: CatFileMode;
  gitDir?: string;
}

/**
 * Provides content or type and size information for repository objects.
 */
export function runCatFile(options: CatFileOptions): string {
  const obj = readObject(options.oid, options.gitDir);

  switch (options.mode) {
    case "pretty":
      return obj.data.toString("utf-8");
    case "type":
      return obj.type;
    case "size":
      return obj.size.toString();
    default:
      throw new Error(`fatal: unknown mode for cat-file`);
  }
}
