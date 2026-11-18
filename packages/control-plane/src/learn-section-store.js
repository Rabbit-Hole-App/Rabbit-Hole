// Learn sections storage (docs/features/learn-sections: spec A section 8, DECISIONS "Engineering decisions", CONTRACT "Storage").
// One learn_sections row per section of the accepted plan (learn-migrations 0046), keyed like the coaching rows: the brief, the composition and the made list
// live here, never on the checkpoint (MAX_CHECKPOINT would not hold them). checkpoint.learn of the active learn activity keeps only
//   currentSectionId and sections: [{ id, status }]   status: 'briefed' | 'composed' | 'made' | 'done'
// Section ids are the accepted plan's own numbering, "<chapter>.<section>" in plan order (1.1, 1.2, 2.1, ...), the numbers the learner sees in the contents.
//
//   planSections(plan) -> [{ id, chapter: { n, title }, title, description, files, background }]   (pure)
//   readSection(env, actor, sectionId) -> { sectionId, brief, composition, made, revision } | null
//   readSections(env, actor) -> every stored section of this board, in plan order of their ids
//   updateSection(env, actor, sectionId, change) -> the stored section; change(current | null) returns the fields to set ({ brief?, composition?, made? })
//   learnPlanOf(env, actor) -> { activityId, learn, sections } | null   (the active learn activity, its accepted plan's sections)
//   saveProgress(env, actor, change) -> checkpoint.learn; change(learn) returns { currentSectionId?, sections? }
import { CoachingConflict, ensureState, readCoachingState } from './learn-coaching-store.js';

const KEY = 'org = ? AND owner_user_id = ? AND app = ? AND board = ?';
const key = actor => [actor.org, actor.userId, actor.app, actor.board];
const parse = text => (text == null ? null : JSON.parse(text));
export const SECTION_STATUSES = Object.freeze(['briefed', 'composed', 'made', 'done']);
export const MAX_SECTION_JSON = 200000; // one document (a brief, a composition or a made list); a notebook's files are the largest part
const FILES_TAIL = /\s*\[files:\s*([^\]]*)\]\s*$/; // learn-plan.js planProblem's suffix

export function planSections(plan) {
  const out = [];
  let chapter = null, n = 0, m = 0;
  for (const op of Array.isArray(plan?.ops) ? plan.ops : []) {
    if (op?.level === 1) { n += 1; m = 0; chapter = { n, title: String(op.text || '') }; continue; }
    if (op?.level !== 2 || !chapter) continue;
    m += 1;
    const match = FILES_TAIL.exec(op.description || ''), words = (match ? op.description.slice(0, match.index) : op.description || '').trim();
    out.push({ id: `${n}.${m}`, chapter, title: String(op.text || ''), description: words.replace(/\s*\(background\)\s*/g, ' ').trim(), files: match ? match[1].split(',').map(p => p.trim()).filter(Boolean) : [], background: /\(background\)/.test(words) });
  }
  return out;
}

const rowOf = row => (row ? { sectionId: row.section_id, brief: parse(row.brief_json), composition: parse(row.composition_json), made: parse(row.made_json) || [], revision: row.revision } : null);
export async function readSection(env, actor, sectionId) {
  return rowOf(await env.LEARN_DB.prepare(`SELECT * FROM learn_sections WHERE ${KEY} AND section_id = ?`).bind(...key(actor), sectionId).first());
}
const order = id => id.split('.').map(Number);
export async function readSections(env, actor) {
  const { results } = await env.LEARN_DB.prepare(`SELECT * FROM learn_sections WHERE ${KEY}`).bind(...key(actor)).all();
  return results.map(rowOf).sort((a, b) => { const [x, y] = [order(a.sectionId), order(b.sectionId)]; return x[0] - y[0] || x[1] - y[1]; });
}

const json = (value, name) => {
  const text = JSON.stringify(value);
  if (text.length > MAX_SECTION_JSON) throw new Error(`section ${name} is over ${MAX_SECTION_JSON} characters`);
  return text;
};
// Read, change, write where the revision is unchanged; a write that finds it moved is retried on the fresh row (the browser makes items one at a time, so a retry is rare).
export async function updateSection(env, actor, sectionId, change) {
  for (let tries = 0; tries < 3; tries += 1) {
    const current = await readSection(env, actor, sectionId), fields = await change(current), now = new Date().toISOString();
    const next = { brief: current?.brief ?? null, composition: current?.composition ?? null, made: current?.made ?? [], ...fields };
    const values = [next.brief == null ? null : json(next.brief, 'brief'), next.composition == null ? null : json(next.composition, 'composition'), json(next.made, 'made')];
    const result = current
      ? await env.LEARN_DB.prepare(`UPDATE learn_sections SET brief_json = ?, composition_json = ?, made_json = ?, revision = revision + 1, updated_at = ? WHERE ${KEY} AND section_id = ? AND revision = ?`)
        .bind(...values, now, ...key(actor), sectionId, current.revision).run()
      : await env.LEARN_DB.prepare('INSERT INTO learn_sections (org, owner_user_id, app, board, section_id, brief_json, composition_json, made_json, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT DO NOTHING')
        .bind(...key(actor), sectionId, ...values, now).run();
    if (result.meta.changes) return { sectionId, ...next, revision: (current?.revision ?? 0) + 1 };
  }
  throw new CoachingConflict('revision');
}

// The active learn activity and its accepted plan's sections; null when there is none (or the plan is not accepted yet).
export async function learnPlanOf(env, actor) {
  const state = await readCoachingState(env, actor), active = (state.activities || []).find(a => a.activityId === state.activeActivityId);
  const learn = active?.checkpoint?.learn;
  if (!learn?.plan?.acceptedAt) return null;
  return { activityId: active.activityId, learn, sections: planSections(learn.plan) };
}

// checkpoint.learn.currentSectionId and .sections on the active activity, written as advanceActivity writes (learn-coaching-store.js): one batch at the current
// coaching revision, which it bumps, retried when it moved. Nothing else on the checkpoint changes.
export async function saveProgress(env, actor, change) {
  for (let tries = 0; tries < 3; tries += 1) {
    const row = await ensureState(env, actor);
    if (!row.active_activity_id) throw new CoachingConflict('not_learn_activity');
    const activity = await env.LEARN_DB.prepare('SELECT checkpoint_json FROM learn_activities WHERE id = ? AND org = ? AND owner_user_id = ?').bind(row.active_activity_id, actor.org, actor.userId).first();
    const checkpoint = parse(activity?.checkpoint_json);
    if (!checkpoint?.learn || typeof checkpoint.learn !== 'object') throw new CoachingConflict('not_learn_activity');
    const { currentSectionId = checkpoint.learn.currentSectionId ?? null, sections = checkpoint.learn.sections ?? [] } = change(checkpoint.learn);
    const learn = { ...checkpoint.learn, currentSectionId, sections: sections.map(({ id, status }) => ({ id, status })) };
    const now = new Date().toISOString();
    const results = await env.LEARN_DB.batch([
      env.LEARN_DB.prepare(`UPDATE learn_activities SET checkpoint_json = ?, updated_at = ? WHERE id = ? AND org = ? AND owner_user_id = ? AND EXISTS (SELECT 1 FROM learn_coaching_state WHERE ${KEY} AND revision = ?)`)
        .bind(JSON.stringify({ ...checkpoint, learn }), now, row.active_activity_id, actor.org, actor.userId, ...key(actor), row.revision),
      env.LEARN_DB.prepare(`UPDATE learn_coaching_state SET revision = revision + 1, updated_at = ? WHERE ${KEY} AND revision = ?`).bind(now, ...key(actor), row.revision),
    ]);
    if (results[0].meta.changes) return learn;
  }
  throw new CoachingConflict('revision');
}

// One section's status in the list, in plan order; a section not listed yet is added.
export const withStatus = (sections, id, status, planIds) => {
  const list = [...(sections || []).filter(s => s.id !== id), { id, status }];
  return list.sort((a, b) => planIds.indexOf(a.id) - planIds.indexOf(b.id));
};
