export interface Merge3Result {
  mergedText: string;
  hasConflict: boolean;
}

export interface Merge3Labels {
  ours?: string;
  theirs?: string;
}

/**
 * Performs a line-by-line three-way merge between base, ours, and theirs.
 */
export function merge3(
  baseText: string,
  oursText: string,
  theirsText: string,
  labels: Merge3Labels = {}
): Merge3Result {
  const oursLabel = labels.ours || "HEAD";
  const theirsLabel = labels.theirs || "theirs";

  // Fast paths
  if (oursText === theirsText) {
    return { mergedText: oursText, hasConflict: false };
  }
  if (oursText === baseText) {
    return { mergedText: theirsText, hasConflict: false };
  }
  if (theirsText === baseText) {
    return { mergedText: oursText, hasConflict: false };
  }

  const baseLines = baseText.replace(/\r\n/g, "\n").split("\n");
  const oursLines = oursText.replace(/\r\n/g, "\n").split("\n");
  const theirsLines = theirsText.replace(/\r\n/g, "\n").split("\n");

  // If last line is empty due to trailing newline, pop for clean array
  const hasTrailingNewline =
    oursText.endsWith("\n") || theirsText.endsWith("\n") || baseText.endsWith("\n");

  if (baseLines.length && baseLines[baseLines.length - 1] === "") baseLines.pop();
  if (oursLines.length && oursLines[oursLines.length - 1] === "") oursLines.pop();
  if (theirsLines.length && theirsLines[theirsLines.length - 1] === "") theirsLines.pop();

  // If base is empty, both added to a new file
  if (baseLines.length === 0) {
    if (oursText === theirsText) {
      return { mergedText: oursText, hasConflict: false };
    }
    const conflictBlock = [
      `<<<<<<< ${oursLabel}`,
      ...oursLines,
      "=======",
      ...theirsLines,
      `>>>>>>> ${theirsLabel}`,
    ].join("\n") + (hasTrailingNewline ? "\n" : "");

    return { mergedText: conflictBlock, hasConflict: true };
  }

  // Simple and effective line-by-line 3-way reconciliation
  const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length);
  const resultLines: string[] = [];
  let hasConflict = false;

  let i = 0;
  let j = 0;
  let k = 0;

  while (i < baseLines.length || j < oursLines.length || k < theirsLines.length) {
    const b = i < baseLines.length ? baseLines[i] : undefined;
    const o = j < oursLines.length ? oursLines[j] : undefined;
    const t = k < theirsLines.length ? theirsLines[k] : undefined;

    // All match
    if (o === b && t === b) {
      if (b !== undefined) resultLines.push(b);
      i++;
      j++;
      k++;
    } else if (o !== b && t === b) {
      // Only ours changed
      if (o !== undefined) resultLines.push(o);
      i++;
      j++;
      k++;
    } else if (o === b && t !== b) {
      // Only theirs changed
      if (t !== undefined) resultLines.push(t);
      i++;
      j++;
      k++;
    } else if (o === t) {
      // Both changed identically
      if (o !== undefined) resultLines.push(o);
      i++;
      j++;
      k++;
    } else {
      // Collision / Conflict!
      hasConflict = true;
      resultLines.push(`<<<<<<< ${oursLabel}`);
      if (o !== undefined) resultLines.push(o);
      resultLines.push("=======");
      if (t !== undefined) resultLines.push(t);
      resultLines.push(`>>>>>>> ${theirsLabel}`);
      i++;
      j++;
      k++;
    }
  }

  const mergedText = resultLines.join("\n") + (hasTrailingNewline ? "\n" : "");
  return { mergedText, hasConflict };
}
