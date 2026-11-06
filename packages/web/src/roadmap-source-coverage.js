// R7a (UI limitation handling): turns the server's coverage manifest and scope choices for a source that is longer than one roadmap reads whole into the
// lines the Chat strip shows. Pure; the server owns every fact (roadmap-source-read.js wireCoverage). Nothing is rendered unless the server sent `choices`,
// so with long Markdown off the R4 limitation notice is all the learner sees.
const n = value => Number(value).toLocaleString('en-US');

// Every learner string of this feature (owner approval list: receipts/r7a-receipt.md). No ellipsis, no price.
export const COVERAGE_STRINGS = Object.freeze({
  choose: 'This source is longer than one explanation plan can read. Choose a part to explain. Each part is read in full.', // NEW (S44)
  outlined: total => `The outline covers all ${n(total)} characters of the source.`, // NEW (S45)
  summarized: (done, total) => `Short summaries exist for ${n(done)} of ${n(total)} characters. The rest is outlined only.`, // NEW (S46)
  unread: reason => (reason === 'source_over_read_limit' ? 'This file is too large to read, so no part of it can be explained.' : 'Part of this source could not be read.'), // NEW (S47)
});

// -> string[]: what is and is not covered, in plain sentences.
export function coverageLines(limitation) {
  const c = limitation?.coverage;
  if (!c) return [];
  const lines = [];
  if (c.unread?.length) lines.push(...[...new Set(c.unread.map(u => COVERAGE_STRINGS.unread(u.reason)))]);
  else if (c.complete) lines.push(COVERAGE_STRINGS.outlined(c.totalChars));
  if (c.summarizedChars > 0 && c.summarizedChars < c.totalChars) lines.push(COVERAGE_STRINGS.summarized(c.summarizedChars, c.totalChars));
  lines.push(...(c.notes || []));
  return lines;
}

// -> [{ locationId, part, label }]; empty unless the server offered choices.
export const choicesOf = limitation => (limitation?.choices || []).map(({ locationId, part, label }) => ({ locationId, part, label }));
