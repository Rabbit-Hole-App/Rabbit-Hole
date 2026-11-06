// R7a/R7b test fixture: a real node:sqlite LEARN_DB with only the source-index tables, and an owner-only reader double that applies the real
// org/owner rule (readMarkdownForActor's answers: a foreign id is `missing`, a different revision is `changed`).
import { readFileSync } from 'node:fs';
import { learnDb } from './learn-grade-fixture.js';

export const MIGRATION = readFileSync(new URL('../learn-migrations/0042-roadmap-source-index.sql', import.meta.url), 'utf8');
export const dbFor = t => learnDb(t, MIGRATION);
export const me = { org: 'o', actorEmail: 'a@x.test' };
export const other = { org: 'o', actorEmail: 'b@x.test' };

// files: { key: { org, owner, rev, text, name?, complete? } } - mutable, so a test can replace a source.
export const readerFor = files => async (_env, access, { key, rev }) => {
  const f = files[key];
  if (!f || f.org !== access.org || f.owner !== access.actorEmail) return { status: 'missing' };
  if (f.family && f.family !== 'markdown') return { status: 'unsupported' };
  if (f.rev !== rev) return { status: 'changed', rev: f.rev };
  return { status: 'ok', text: f.text, rev: f.rev, name: f.name ?? 'long.md', complete: f.complete !== false };
};
export const file = (text, rev = 'sha256:' + 'a'.repeat(64), extra = {}) => ({ org: 'o', owner: 'a@x.test', rev, text, ...extra });
export const rev = ch => 'sha256:' + ch.repeat(64);

// A long document with repeated headings, a late chapter, a fenced block with fake headings and a headingless tail.
export function longDoc({ chapters = 30, para = 900 } = {}) {
  const body = n => `Paragraph about topic ${n}. `.repeat(Math.ceil(para / 28));
  let out = 'Preface text before any heading.\n\n';
  for (let i = 1; i <= chapters; i++) out += `# Chapter ${i}\n\n${body(i)}\n\n## Exercises\n\n${body(i + 100)}\n\n`;
  out += '# Appendix\n\n```\n# not a heading\n## also not\n```\n\nZebrafish are mentioned only in the appendix.\n';
  return out;
}
