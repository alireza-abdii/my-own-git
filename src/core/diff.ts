/**
 * Computes the Longest Common Subsequence (LCS) matrix between two arrays of lines.
 */
function computeLCSMatrix(lines1: string[], lines2: string[]): number[][] {
  const m = lines1.length;
  const n = lines2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (lines1[i - 1] === lines2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

export interface DiffOp {
  type: "common" | "add" | "delete";
  line: string;
}

/**
 * Computes diff operations between two line arrays using LCS.
 */
export function computeDiffOps(lines1: string[], lines2: string[]): DiffOp[] {
  const dp = computeLCSMatrix(lines1, lines2);
  const ops: DiffOp[] = [];

  let i = lines1.length;
  let j = lines2.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
      ops.push({ type: "common", line: lines1[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "add", line: lines2[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      ops.push({ type: "delete", line: lines1[i - 1] });
      i--;
    }
  }

  return ops.reverse();
}

/**
 * Produces standard Git-style unified diff for a single file.
 */
export function formatUnifiedDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
  oldLabel: string = `a/${filePath}`,
  newLabel: string = `b/${filePath}`
): string {
  if (oldContent === newContent) {
    return "";
  }

  const oldLines = oldContent ? oldContent.replace(/\r\n/g, "\n").split("\n") : [];
  const newLines = newContent ? newContent.replace(/\r\n/g, "\n").split("\n") : [];

  // If last line is empty due to trailing newline, remove it for clean diffing
  if (oldLines.length && oldLines[oldLines.length - 1] === "") oldLines.pop();
  if (newLines.length && newLines[newLines.length - 1] === "") newLines.pop();

  const ops = computeDiffOps(oldLines, newLines);

  const diffLines: string[] = [];
  diffLines.push(`diff --git a/${filePath} b/${filePath}`);
  diffLines.push(`--- ${oldLabel}`);
  diffLines.push(`+++ ${newLabel}`);

  const hunkLines: string[] = [];
  for (const op of ops) {
    if (op.type === "common") {
      hunkLines.push(` ${op.line}`);
    } else if (op.type === "delete") {
      hunkLines.push(`-${op.line}`);
    } else if (op.type === "add") {
      hunkLines.push(`+${op.line}`);
    }
  }

  diffLines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
  diffLines.push(...hunkLines);

  return diffLines.join("\n") + "\n";
}
