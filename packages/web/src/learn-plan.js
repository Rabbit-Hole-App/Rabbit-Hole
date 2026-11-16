// packages/web/src/learn-plan.js
// The Learn plan as the Tutor shows it (learn-plan-toc-spec.md, owner 2026-11-15): the server's draft (ops from propose_lesson_outline, validated there) becomes a numbered nested list in the Tutor's
// message and, on Accept, the Table of contents. Everything here is the document's and the model's words; nothing is a word of one repository.
// Pure: no React, no network, no storage.
import { SENTENCES } from './tutor-rehearsal-text.js';

// A trailing "[files: a, b]" rides in a description for the contents; the list shows titles only (spec section 2).
export const stripFiles = text => String(text || '').replace(/\s*\[files:[^\]]*\]\s*$/i, '').trim();

// ops (propose_lesson_outline's: { op: 'add', text, key?, parent?, level?, description? }) -> chapters [{ key, title, sections: [{ key, title, background }] }]. `add` ops only: a level-1 add is a chapter, a level-2 add (or an add under a chapter's key) is a section.
export function planTree(ops) {
  const chapters = [], byKey = new Map();
  for (const op of Array.isArray(ops) ? ops : []) {
    if (op?.op !== 'add' || typeof op.text !== 'string') continue;
    const level = Number(op.level) || (op.parent ? 2 : 1), background = /\(background\)/i.test(String(op.description || ''));
    if (level === 1 && !op.parent) { const chapter = { key: op.key ?? null, title: op.text.trim(), sections: [] }; chapters.push(chapter); if (op.key) byKey.set(op.key, chapter); }
    else { const chapter = byKey.get(op.parent) ?? chapters.at(-1); chapter?.sections.push({ key: op.key ?? null, title: op.text.trim(), background }); }
  }
  return chapters;
}
export const chapterCount = ops => planTree(ops).length;

// The numbered nested list, as Markdown the chat message already renders: "1. Chapter" with its sections indented "   1. Section".
export const planList = ops => planTree(ops).map((chapter, i) => [`${i + 1}. ${chapter.title}`, ...chapter.sections.map((section, j) => `   ${j + 1}. ${section.title}${section.background ? ' (background)' : ''}`)].join('\n')).join('\n');

// The Tutor's message for a draft: the book title (the first line of the model's words), the list, then the rest of the words (at most three sentences).
export function draftText(text, ops) {
  const lines = String(text || '').trim().split('\n'), title = (lines.shift() || '').replace(/^#+\s*/, '').trim();
  const words = lines.join('\n').trim();
  return [title ? `**${title}**` : '', planList(ops), words].filter(Boolean).join('\n\n');
}

// The fixed row ids (spec section 5) -> rows with their words. `learn` is the catalogue's learn section (for learn:<id>); `ops` the draft (for background:<key>).
export function planRows(ids, { ops = [], learn = { options: [] } } = {}) {
  const titleOf = new Map(planTree(ops).flatMap(chapter => [[chapter.key, chapter.title], ...chapter.sections.map(section => [section.key, section.title])]));
  const rows = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = typeof raw === 'string' ? raw : raw?.id;
    if (id === 'accept') rows.push({ id: 'plan:accept', label: SENTENCES.planAccept });
    else if (id === 'change') rows.push({ id: 'plan:change', label: SENTENCES.planChange });
    else if (id === 'keep_previous') rows.push({ id: 'plan:keep', label: SENTENCES.planKeep });
    else if (id === 'start_plain') rows.push({ id: 'plan:plain', label: SENTENCES.planPlain });
    else if (id === 'try_again') rows.push({ id: 'plan:retry', label: SENTENCES.planTryAgain });
    else if (typeof id === 'string' && id.startsWith('background:') && titleOf.get(id.slice(11))) rows.push({ id: `plan:background:${id.slice(11)}`, label: `Add ${titleOf.get(id.slice(11))} as background` });
    else if (typeof id === 'string' && id.startsWith('learn:')) { const option = (learn.options || []).find(o => o.id === id.slice(6)); if (option) rows.push({ id: `learn:${option.id}`, label: option.label }); }
  }
  return rows.length ? rows : planRows(['accept', 'change']);
}

// The saved Learn goal's checkpoint, as the coaching state carries it (checkpoint.learn = { id, kind, focus, plan? }), for a reload: -> { id, kind, focus, plan } | null.
export function storedLearn(coachingState) {
  const activity = coachingState?.activities?.find(a => a.activityId === coachingState.activeActivityId) || null;
  const learn = activity?.checkpoint?.learn;
  return learn && typeof learn.id === 'string' ? { id: learn.id, kind: learn.kind ?? null, focus: learn.focus ?? null, plan: learn.plan && Array.isArray(learn.plan.ops) ? learn.plan : null } : null;
}
// The accepted plan of the canvas, if any (the contents go read-only and lose their composer): { current } or null.
export const acceptedPlan = coachingState => { const plan = storedLearn(coachingState)?.plan; return plan?.acceptedAt ? plan : null; };
