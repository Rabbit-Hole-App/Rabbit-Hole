// Before a course is planned (owner 2026-11-14): is this file something a course can be made from? Two checks, both before any card is paid for.
//  1. proseCheck (no model): at least MIN_WORDS words of prose, and not mostly code. Deterministic, free, and answered in the create request itself.
//  2. sourceBlocked (JEV, platform-paid): one safety screen of the source, the same classifier path every card uses (roadmap-models.js makeClassify over platformJevAsk).
//     Only a block refuses the course; an unsure answer, a classifier outage or a source too long to screen whole lets planning go on, because every card is still screened
//     with its own passage (roadmap-check.js).
// ponytail: prose is counted by a word-shape pattern (CJK text by two characters a word) and "mostly code" is the share of characters inside ``` fences; a CSV, a log or minified
// text outside a fence still gets through to the planner, which may answer with its own focused question. Tune MIN_WORDS / CODE_SHARE if real files misfile.
import { askJev } from '../learn-grade-jev.js';
import { makeClassify, platformJevAsk } from './roadmap-models.js';
import { screenText } from './roadmap-safety.js';

export const MIN_WORDS = 100;
export const CODE_SHARE = 0.7;

const FENCE = /^(```|~~~)[^\n]*\n[\s\S]*?(?:\n\1[^\n]*|(?![\s\S]))/gm;
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/gu;

// -> { words, codeShare }. Front matter, fenced code, images, link targets, HTML tags and URLs are not prose.
export function proseStats(text) {
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/^﻿/, '');
  const fenced = [...source.matchAll(FENCE)].reduce((n, m) => n + m[0].replace(/\s/g, '').length, 0);
  const total = source.replace(/\s/g, '').length;
  const prose = source.replace(/^---\n[\s\S]*?\n---\n/, '').replace(FENCE, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\]\([^)]*\)/g, ' ').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  const cjk = (prose.match(CJK) || []).length;
  const words = (prose.replace(CJK, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length + Math.floor(cjk / 2);
  return { words, codeShare: total ? fenced / total : 0 };
}

// -> null when the file can be planned, else { code, message }.
export const PROSE_COPY = Object.freeze({
  tooShort: 'This file is too short to make a course from. Add more text and drop it again.',
  notProse: 'This file is mostly code or data, so I cannot make a course from it.',
  unsafe: 'I cannot make a course from this file.',
});
export function proseCheck(text, { minWords = MIN_WORDS } = {}) {
  const { words, codeShare } = proseStats(text);
  if (codeShare > CODE_SHARE) return { code: 'source_not_prose', message: PROSE_COPY.notProse };
  if (words < minWords) return { code: 'source_too_short', message: PROSE_COPY.tooShort };
  return null;
}

// -> true only for a block. deps: { classify? (a double in tests), now? }.
export async function sourceBlocked(env, access, roadmap, text, { classify } = {}) {
  try {
    const use = classify || makeClassify({ ask: platformJevAsk(env, access, { roadmapId: roadmap.id, version: 1, anchor: 'source', ask: (e, request) => askJev(e, request, { transport: 'direct' }) }) });
    return (await screenText([{ role: 'source', text }], { classify: use })).decision === 'block';
  } catch { return false; }
}
