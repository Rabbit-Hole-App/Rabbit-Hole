// R4 integration glue: plan-time minting of R3 source references (contracts/api.md 12.2). At Accept plan the request has a signed-in learner; this mints one
// R3-shaped reference per step ({v, id: 'sref_...', kind, source: {key, rev, name, home}, anchor: {quote: {exact, prefix, suffix}}}) from the step's
// passage and stores its id on learn_roadmap_steps.source_ref_id. The delivered card then carries that reference as metadata (roadmap-generate.js),
// read request-less by id (d1PublicRef). The default mint writes R3's table learn_source_refs exactly as R3's own create does (source-refs.js,
// migration 0038); on a database without R3's table minting is skipped and cards carry no sourceRef. `mint` is the injected seam, so when R3 is merged
// the Lead may point it at R3's module instead without touching this file's callers.
import { readRoadmap } from './roadmap-store.js';
import { revalidateSourceAsJob } from './roadmap-access.js';
import { readMarkdownForActor } from './roadmap-source-reader.js';
import { LIMIT_COPY } from './roadmap-source-read.js';
import { sha256 } from './roadmap-money.js';
import { anchorOfRange } from '../../../web/src/markdown-anchor.js';

const TABLE_MISSING = /no such table/i;
const CONTEXT = 100; // characters of prefix/suffix kept with a quote (R3 allows 500)
const mintId = () => `sref_${[...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('')}`;

// -> { ref } | { ref: null, skipped: true }
// quote is the RAW Markdown passage (grounding reads it); `rendered` (markdown-anchor.js) is the same passage folded for the viewer, which draws none of the syntax.
export async function d1MintSourceRef(env, access, { key, rev, name, quote, rendered = null, now = Date.now() }) {
  const anchorJson = JSON.stringify({ quote: { exact: quote.exact, prefix: quote.prefix, suffix: quote.suffix }, ...(rendered ? { rendered } : {}) }), anchorHash = await sha256(anchorJson), db = env.LEARN_DB;
  try {
    await db.prepare(`INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_home, source_name, source_rev, anchor_json, anchor_hash, status, checked_at, created_at)
      VALUES (?, ?, ?, 'markdown', ?, NULL, ?, ?, ?, ?, 'current', ?, ?) ON CONFLICT (org, owner_email, source_key, source_rev, anchor_hash) DO NOTHING`)
      .bind(mintId(), access.org, access.actorEmail, key, String(name || '').slice(0, 160), rev, anchorJson, anchorHash, now, now).run();
    const row = await db.prepare('SELECT id FROM learn_source_refs WHERE org = ? AND owner_email = ? AND source_key = ? AND source_rev = ? AND anchor_hash = ?').bind(access.org, access.actorEmail, key, rev, anchorHash).first();
    return { ref: { id: row.id } };
  } catch (error) { if (TABLE_MISSING.test(String(error?.message))) return { ref: null, skipped: true }; throw error; }
}

// Mints and stores a reference for each step of the current plan that has none. A source that changed or went away refuses (nothing is accepted).
// -> { ok: true, minted } | { ok: false, code: 'source_changed' | 'source_unavailable', error }
export async function mintStepRefs(env, access, roadmapId, { mint = d1MintSourceRef, readSourceForActor = readMarkdownForActor } = {}) {
  const db = env.LEARN_DB, roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) return { ok: true, minted: 0 };
  const source = await revalidateSourceAsJob(db, access, roadmap);
  if (!source.ok) return { ok: false, code: source.code, error: source.code === 'source_changed' ? LIMIT_COPY.changed : LIMIT_COPY.unavailable };
  const { results: steps } = await db.prepare('SELECT * FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND source_ref_id IS NULL ORDER BY position').bind(roadmapId, roadmap.plan_version).all();
  if (!steps?.length) return { ok: true, minted: 0 };
  const text = await readSourceForActor(env, access, { key: roadmap.source_key, rev: roadmap.source_rev });
  if (text.status !== 'ok' || text.complete === false) return { ok: false, code: 'source_unavailable', error: LIMIT_COPY.unavailable };
  let minted = 0;
  for (const step of steps) {
    const exact = text.text.slice(step.passage_start, step.passage_end);
    if (!exact) continue;
    const made = await mint(env, access, { key: roadmap.source_key, rev: roadmap.source_rev, name: source.name, rendered: anchorOfRange(text.text, step.passage_start, step.passage_end),
      quote: { exact, prefix: text.text.slice(Math.max(0, step.passage_start - CONTEXT), step.passage_start), suffix: text.text.slice(step.passage_end, step.passage_end + CONTEXT) } });
    if (!made.ref) break; // no R3 table: skip the rest
    await db.prepare('UPDATE learn_roadmap_steps SET source_ref_id = ? WHERE id = ? AND roadmap_id = ? AND source_ref_id IS NULL').bind(made.ref.id, step.id, roadmapId).run();
    minted += 1;
  }
  return { ok: true, minted };
}
