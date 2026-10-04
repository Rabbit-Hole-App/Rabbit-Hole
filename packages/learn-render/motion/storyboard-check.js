// Storyboard semantic validation (spec §4.6, §5.2; M3). The canonical shape lives in
// contracts.js validateStoryboard; this adds the deterministic teaching checks a storyboard must
// pass before any Author sees it. Everything is computed from the storyboard and its validated
// brief: the model's own coverage claims are verified, never trusted, and nothing is repaired.
//   checkStoryboard(storyboard, brief) -> { errors, coverage: {must_show, claims, objects}, timeline }
//
// ponytail: the text checks are lexical (word stems, code names, ordering words), not semantic.
// They catch new vocabulary, named code outside the evidence, misconception wording, steps shown
// out of order and missing conditions; a paraphrased misconception in new words that happen to be
// in the brief is left to the M6 reviewers.
import { STAGE, validateStoryboard } from './contracts.js';
import { ABSOLUTE, CODE_WORDS, RENDERER_WORDS } from './director.js';

export const LIMITS = Object.freeze({
  min_beat_seconds: 1.5,
  seconds_per_beat: 2, // at most floor(duration / 2) beats (5 s -> 2, 15 s -> 7), never more than 8
  label_chars: 60, label_words: 10,
  text_words: 25, text_sentences: 2, // on_screen_text
  beat_words: 40, // every learner-visible word in one beat
  read_base_words: 6, read_words_per_second: 4, // new words a beat asks the learner to read
  narration_words: 20, speech_words_per_second: 2.5,
  source_lines: 15, // one code object
  coverage_ratio: 0.4, // share of a must_show item's terms its covering beat must show
});
// Implementation detail that belongs to the Author, never the storyboard.
const IMPLEMENTATION = /\b\d+(?:\.\d+)?\s*(?:px|rem|em|pt|vh|vw)\b|#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\b(?:rgba?|hsla?)\s*\(|cubic-bezier|\bease(?:In|Out|InOut)\w*|\b(?:useCurrentFrame|useVideoConfig|interpolate|spring|AbsoluteFill|requestAnimationFrame|className|zIndex|z-index|translate[XYZ]?|div)\b/i;
const CONDITION_WORDS = new Set(['self', 'not', 'is', 'None', 'True', 'False', 'and', 'or', 'in']);
const CONDITION_CUE = /\b(?:fallback|otherwise|unless|only (?:when|if)|if|else|branch)\b/i;
const NOT_TAUGHT = ['hook', 'takeaway']; // beats that point or recap; they do not animate steps
// Words that carry no claim: function words, common verbs, and the vocabulary of pointing at things.
const GENERIC = new Set(`a an the and or but nor so yet of to in on at by for from with into onto over under about as than then
now here there this that these those it its they them their we you your our us is are was were be been being am do does did done
has have had having can could will would should may might must not no only just also still each every all both either any some
more most less few many much other another same such own very too again once first second third last next before after while
until during through between among within without per via one two three four five six seven eight nine ten zero what which who
how why where when if else up down out off back away get gets got go goes going come comes came make makes made take takes took
give gives use uses used using put puts keep keeps kept stay stays stayed become becomes became turn turns turned run runs ran
show shows shown showing see sees look looks watch start starts end ends happen happens apply applies applied work works let lets
step steps line lines code row rows bar bars arrow arrows label labels panel box boxes cell cells value values number numbers total
left right top bottom side lane lanes appear appears grow grows shrink shrinks fill fills move moves highlight highlighted
path paths branch branches fallback true false example new old part whole full empty change changes changed
whichever whatever whenever wherever however meet meets join joins split splits enter enters leave leaves reach reaches
travel travels arrive arrives merge merges lead leads`.split(/\s+/));
const OP_SKIP = new Set(['float', 'int', 'len', 'range', 'print', 'hasattr', 'isinstance', 'super', 'size', 'view']);
const OP_STOP = new Set(['fill', 'attn', 'self', 'torch', 'size', 'view', 'item', 'data', 'functional']);

const words = text => String(text || '').toLowerCase().match(/[a-z]+/g) || [];
export function stem(w) {
  if (w.length <= 3) return w;
  let s = w.replace(/ies$/, 'y').replace(/(?:ing|ed|ly)$/, '');
  if (s === w) s = w.replace(/es$/, '').replace(/s$/, '');
  return s.replace(/e$/, '') || w;
}
const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
const vocabulary = texts => [...new Set(texts.flatMap(words).filter(w => !GENERIC.has(w)).map(stem))];
const inVocab = (s, vocab) => vocab.some(v => same(s, v));
// A word has a letter or digit: glyphs such as → | @ = are read at a glance, not as words.
const wordCount = text => (String(text || '').match(/\S+/g) || []).filter(t => /[\p{L}\p{N}]/u.test(t)).length;
const sentences = text => (String(text || '').match(/[^.!?]+[.!?]*/g) || []).filter(x => x.trim()).length;
const codeNames = text => [...String(text || '').matchAll(CODE_WORDS)].map(m => (m[1] || m[2] || m[3] || m[4]).replace(/\(.*$/, '').trim()).filter(Boolean);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Everything the checks need from the brief, computed once.
function briefFacts(brief) {
  const excerpt = new Map(brief.evidence.map(e => [e.source_ref_id, e.excerpt]));
  const refs = new Map(brief.source_refs.map(r => [r.id, r]));
  const lineText = (id, a, b) => { const r = refs.get(id); return (excerpt.get(id) || '').split('\n').slice(a - r.start_line, b - r.start_line + 1).join('\n'); };
  // The refs each branch of each condition runs: structural `source_ref_ids` (grounding since the
  // M3 hardening; [] on a no_op side), else read from "path:a-b: ..." or "(S2, S3)" in `runs`.
  const branches = new Map(brief.implementation_conditions.map(k => [k.id, k.branches.map(b => {
    if (Array.isArray(b.source_ref_ids)) return b.source_ref_ids;
    const ids = new Set(b.runs.match(/\bS\d+\b/g) || []);
    const m = /^(.+?):(\d+)-(\d+):/.exec(b.runs);
    if (m) for (const r of brief.source_refs) if (r.path === m[1] && r.start_line === +m[2] && r.end_line === +m[3]) ids.add(r.id);
    return [...ids];
  })]));
  const branchOf = new Map(); // ref -> [{k, branch}]
  for (const [k, sides] of branches) sides.forEach((ids, i) => ids.forEach(id => branchOf.set(id, [...(branchOf.get(id) || []), { k, branch: i }])));
  // A code name that appears only in one branch's code puts that branch's condition on any beat naming it.
  const branchOnly = name => {
    const holders = brief.evidence.filter(e => e.excerpt.includes(name)).map(e => e.source_ref_id);
    if (!holders.length || holders.some(id => !branchOf.has(id))) return [];
    return [...new Set(holders.flatMap(id => branchOf.get(id).map(b => b.k)))];
  };
  // The names a condition tests (`self.flash` -> flash, `top_k is not None` -> top_k).
  const flags = new Map(brief.implementation_conditions.map(k => [k.id, [...k.condition.matchAll(/`([^`]+)`/g)].flatMap(m => (m[1].match(/[A-Za-z_]\w*/g) || []).filter(n => !CONDITION_WORDS.has(n)))]));
  // Operations each code excerpt performs, in line order: calls, named by their distinctive word parts.
  const ops = brief.evidence.filter(e => refs.get(e.source_ref_id)?.kind === 'code').map(e => {
    const r = refs.get(e.source_ref_id);
    return e.excerpt.split('\n').flatMap((line, i) => line.trim().startsWith('#') ? [] : [...line.matchAll(/([A-Za-z_][\w.]*)\s*\(/g)].map(m => m[1].split('.').at(-1)).filter(n => !OP_SKIP.has(n)).map(name => ({
      name, line: r.start_line + i, where: `${r.path}:${r.start_line + i}`,
      terms: name.split('_').map(p => stem(p.toLowerCase())).filter(p => p.length >= 4 && !OP_STOP.has(p)),
    })).filter(o => o.terms.length));
  });
  const positive = vocabulary([brief.title, brief.objective, brief.audience_context, brief.visual_direction, ...brief.must_show,
    ...brief.claim_registry.map(c => c.text), ...brief.evidence.map(e => e.excerpt),
    ...brief.implementation_conditions.flatMap(k => [k.condition, ...k.branches.flatMap(b => [b.when, b.runs])]),
    ...(brief.analogy_map || []).flatMap(a => [a.analogy_element, a.real_concept, a.limit])]);
  const misconception = brief.must_not_claim.map(text => ({ text, terms: vocabulary([text]).filter(s => !inVocab(s, positive)) }));
  const excluded = vocabulary([brief.scope_note || '']).filter(s => !inVocab(s, positive));
  return { excerpt, refs, lineText, branches, branchOf, branchOnly, flags, ops, positive, misconception, excluded };
}

// The learner-visible text of a beat, by field.
const learnerText = beat => [
  ...beat.visible_objects.filter(o => o.label).map(o => [`${o.id}.label`, o.label]),
  ['on_screen_text', beat.on_screen_text],
  ...(beat.narration_line ? [['narration_line', beat.narration_line]] : []),
].filter(([, t]) => t);
const shownCode = (beat, f) => beat.visible_objects.filter(o => o.source).map(o => f.lineText(o.source.source_ref_id, o.source.start_line, o.source.end_line)).join('\n');
const allText = (beat, f) => [...beat.visible_objects.flatMap(o => [o.description, o.label, o.change]), beat.on_screen_text, beat.narration_line, beat.transition, beat.framing, shownCode(beat, f)].filter(Boolean).join('\n');

export function checkStoryboard(storyboard, brief) {
  const errors = validateStoryboard(storyboard, brief);
  const beats = Array.isArray(storyboard?.beats) ? storyboard.beats : [];
  const shaped = beats.length && beats.every(b => b && Array.isArray(b.visible_objects) && b.visible_objects.every(o => o && typeof o === 'object') && Array.isArray(b.claim_ids));
  if (!shaped) return { errors, coverage: null, timeline: [] };
  const f = briefFacts(brief);
  const e = [...errors];
  const claims = new Map(brief.claim_registry.map(c => [c.id, c]));
  const seconds = brief.duration.seconds;

  // Scope fits the duration: few beats for a short video, each long enough to see.
  const maxBeats = Math.max(2, Math.min(8, Math.floor(seconds / LIMITS.seconds_per_beat)));
  if (beats.length > maxBeats) e.push(`storyboard: ${beats.length} beats for ${seconds}s (at most ${maxBeats}); narrow the beats, not the brief`);

  const coverageShow = new Map(brief.must_show.map(m => [m, []]));
  const declared = new Map(brief.must_show.map(m => [m, []]));
  const showTerms = new Map(brief.must_show.map(m => [m, vocabulary([m]).filter(t => t.length >= 2)]));
  const coverageClaims = new Map(brief.claim_registry.map(c => [c.id, []]));
  const objects = new Map();
  const taughtBranches = new Map(); // k -> Set(branch index) taught by some beat's claims
  let previousLabels = new Map();

  beats.forEach(beat => {
    const at = beat.id;
    const len = +(beat.end_time - beat.start_time).toFixed(6);
    if (len < LIMITS.min_beat_seconds) e.push(`${at}: ${len}s is shorter than ${LIMITS.min_beat_seconds}s`);
    if (!beat.visible_objects.some(o => o.change)) e.push(`${at}: nothing changes (give at least one visible object a change)`);
    for (const o of beat.visible_objects) objects.set(o.id, [...(objects.get(o.id) || []), at]);

    // Renderer-neutral, everywhere.
    for (const [field, text] of [...beat.visible_objects.flatMap(o => [[`${o.id}.description`, o.description], [`${o.id}.label`, o.label], [`${o.id}.change`, o.change]]), ['transition', beat.transition], ['framing', beat.framing], ['on_screen_text', beat.on_screen_text], ['narration_line', beat.narration_line]]) {
      const m = String(text || '').match(RENDERER_WORDS) || String(text || '').match(IMPLEMENTATION);
      if (m) e.push(`${at}.${field}: names an implementation detail ("${m[0]}"); the storyboard stays renderer-neutral`);
    }

    // Concise learner text.
    for (const o of beat.visible_objects) if (o.label && (o.label.length > LIMITS.label_chars || wordCount(o.label) > LIMITS.label_words)) e.push(`${at}.${o.id}.label: ${o.label.length} chars / ${wordCount(o.label)} words (at most ${LIMITS.label_chars} / ${LIMITS.label_words})`);
    for (const o of beat.visible_objects) if (o.source && o.source.end_line - o.source.start_line + 1 > LIMITS.source_lines) e.push(`${at}.${o.id}.source: ${o.source.end_line - o.source.start_line + 1} lines (at most ${LIMITS.source_lines})`);
    if (wordCount(beat.on_screen_text) > LIMITS.text_words || sentences(beat.on_screen_text) > LIMITS.text_sentences) e.push(`${at}.on_screen_text: ${wordCount(beat.on_screen_text)} words / ${sentences(beat.on_screen_text)} sentences (at most ${LIMITS.text_words} / ${LIMITS.text_sentences})`);
    const visibleWords = wordCount(beat.on_screen_text) + beat.visible_objects.reduce((n, o) => n + wordCount(o.label), 0);
    if (visibleWords > LIMITS.beat_words) e.push(`${at}: ${visibleWords} words on screen (at most ${LIMITS.beat_words})`);
    const newWords = wordCount(beat.on_screen_text) + beat.visible_objects.filter(o => o.label && previousLabels.get(o.id) !== o.label).reduce((n, o) => n + wordCount(o.label), 0);
    const readable = Math.floor(LIMITS.read_base_words + LIMITS.read_words_per_second * len);
    if (newWords > readable) e.push(`${at}: ${newWords} new words to read in ${len}s (at most ${readable})`);
    previousLabels = new Map(beat.visible_objects.filter(o => o.label).map(o => [o.id, o.label]));

    // Narration is planning only: short, and speakable inside its beat.
    if (beat.narration_line) {
      const n = wordCount(beat.narration_line);
      if (n > LIMITS.narration_words || sentences(beat.narration_line) > 1) e.push(`${at}.narration_line: one sentence of at most ${LIMITS.narration_words} words`);
      if (n > LIMITS.speech_words_per_second * len) e.push(`${at}.narration_line: ${n} words do not fit ${len}s (at most ${Math.floor(LIMITS.speech_words_per_second * len)})`);
    }

    // Claims: no new facts in learner text; named code must come from this beat's evidence.
    const cited = beat.claim_ids.map(id => claims.get(id)).filter(Boolean);
    for (const c of cited) coverageClaims.get(c.id).push(at);
    // Evidence: the cited claims' refs and the refs of every condition the beat names (its flag included).
    const evidenceIds = new Set([...cited.flatMap(c => c.source_ref_ids), ...brief.implementation_conditions.filter(k => cited.some(c => c.condition_ids.includes(k.id)) || (beat.condition_ids || []).includes(k.id)).flatMap(k => k.source_ref_ids)]);
    const beatEvidence = [...evidenceIds].map(id => f.excerpt.get(id) || '').join('\n') + '\n' + shownCode(beat, f) + '\n' + cited.map(c => c.text).join('\n');
    const needs = new Set(); // conditions the beat's named or shown code runs under (cited claims: contracts.js)
    for (const [field, text] of learnerText(beat)) {
      for (const w of new Set(words(text))) {
        if (GENERIC.has(w)) continue;
        const s = stem(w);
        if (inVocab(s, f.positive)) continue;
        const echoes = f.misconception.filter(m => m.terms.some(t => same(s, t)));
        if (echoes.length) e.push(`${at}.${field}: "${w}" echoes must_not_claim "${echoes[0].text}"`);
        else if (f.excluded.some(t => same(s, t))) e.push(`${at}.${field}: "${w}" is a topic the scope_note leaves out`);
        else e.push(`${at}.${field}: "${w}" is not in the brief's claims, must_show or evidence (a new claim?)`);
      }
      for (const name of codeNames(text)) {
        if (!beatEvidence.includes(name)) e.push(`${at}.${field}: names "${name}", which is not in the evidence of claims ${beat.claim_ids.join(', ')}`);
        for (const k of f.branchOnly(name)) needs.add(k);
      }
    }
    // Code shown from one branch carries that branch's condition.
    for (const o of beat.visible_objects) if (o.source) for (const b of f.branchOf.get(o.source.source_ref_id) || []) needs.add(b.k);
    for (const k of needs) if (!(beat.condition_ids || []).includes(k)) e.push(`${at}: shows code or claims that run only under ${k} but does not name ${k}`);
    const conditional = [...new Set([...cited.flatMap(c => c.condition_ids), ...needs, ...(beat.condition_ids || [])])];
    const visible = learnerText(beat).map(([, t]) => t).join('\n') + '\n' + shownCode(beat, f);
    for (const k of conditional) {
      const flag = (f.flags.get(k) || []).some(n => new RegExp(`\\b${escapeRe(n)}\\b`, 'i').test(visible));
      if (!flag && !CONDITION_CUE.test(visible)) e.push(`${at}: teaches under ${k} but nothing on screen says so (name ${(f.flags.get(k) || ['the condition']).join(', ')} or the branch)`);
    }
    if (conditional.length) for (const [field, text] of learnerText(beat)) if (ABSOLUTE.test(text)) e.push(`${at}.${field}: "${text.match(ABSOLUTE)[0]}" on branch-dependent content (${conditional.join(', ')})`);
    for (const c of cited) for (const id of c.source_ref_ids) for (const b of f.branchOf.get(id) || []) taughtBranches.set(b.k, new Set([...(taughtBranches.get(b.k) || []), b.branch]));

    // Steps stated in learner text keep the code's order ("X then Y", "Y after X").
    for (const [field, text] of learnerText(beat)) for (const seq of f.ops) for (const a of seq) for (const b of seq) {
      if (a.line >= b.line) continue;
      const A = a.terms.map(t => `\\b${t}\\w*`).join('|'), B = b.terms.map(t => `\\b${t}\\w*`).join('|');
      if (new RegExp(`(?:${B})[\\s\\S]*?(?:\\bthen\\b|\\bbefore\\b|\\bfollowed by\\b|→|->)[\\s\\S]*?(?:${A})|(?:${A})[\\s\\S]*?\\bafter\\b[\\s\\S]*?(?:${B})`, 'i').test(text)) e.push(`${at}.${field}: puts ${b.name} (${b.where}) before ${a.name} (${a.where})`);
    }

    // must_show: a declared item counts only if the beat visibly carries enough of its terms.
    const beatStems = vocabulary([allText(beat, f)]);
    for (const m of beat.must_show_covered || []) {
      if (!declared.has(m)) continue;
      declared.get(m).push(at);
      const terms = showTerms.get(m);
      const hit = terms.filter(t => inVocab(t, beatStems));
      if (hit.length >= Math.max(1, Math.ceil(LIMITS.coverage_ratio * terms.length))) coverageShow.get(m).push(at);
    }
  });

  const narrated = beats.filter(b => b.narration_line).map(b => b.id);
  if (brief.narration_policy === 'one_line' && narrated.length > 1) e.push(`storyboard: narration_policy one_line allows one narration_line (${narrated.join(', ')} have one)`);

  // Steps animated across beats keep the code's order (hook and takeaway beats only point or recap).
  const animating = beats.filter(b => !NOT_TAUGHT.includes(b.pedagogical_role));
  const firstChange = op => animating.findIndex(b => b.visible_objects.some(o => o.change && op.terms.some(t => new RegExp(`\\b${t}\\w*`, 'i').test(o.change))));
  for (const seq of f.ops) for (const a of seq) for (const b of seq) {
    if (a.line >= b.line) continue;
    const ia = firstChange(a), ib = firstChange(b);
    if (ia >= 0 && ib >= 0 && ib < ia) e.push(`${animating[ib].id} animates ${b.name} (${b.where}) before ${animating[ia].id} animates ${a.name} (${a.where})`);
  }

  // A condition taught on one side is taught on the other when the brief has claims there.
  for (const [k, sides] of f.branches) {
    const taught = taughtBranches.get(k);
    if (!taught) continue;
    sides.forEach((ids, i) => {
      if (taught.has(i)) return;
      const there = brief.claim_registry.filter(c => c.source_ref_ids.some(id => ids.includes(id)));
      if (there.length) e.push(`storyboard: teaches one side of ${k} but none of its other side (${there.map(c => c.id).join(', ')})`);
    });
  }

  // Teaching mode is the brief's, kept by the beat structure.
  const roles = beats.map(b => b.pedagogical_role);
  const first = list => roles.findIndex(r => list.includes(r));
  const firstMechanism = first(['mechanism', 'implementation', 'equation', 'notation']);
  const firstAnalogy = first(['intuition', 'analogy']);
  const withCode = beats.filter(b => !NOT_TAUGHT.includes(b.pedagogical_role));
  if (roles.includes('analogy') && !brief.analogy_map?.length) e.push('storyboard: an analogy beat without an analogy_map in the brief');
  switch (brief.teaching_mode) {
    case 'mechanism_first':
      if (!roles.includes('mechanism')) e.push('teaching_mode mechanism_first: no mechanism beat');
      if (firstAnalogy >= 0 && (firstMechanism < 0 || firstAnalogy < firstMechanism)) e.push('teaching_mode mechanism_first: an intuition or analogy beat comes before the mechanism');
      break;
    case 'intuition_first':
      if (firstAnalogy < 0 || (firstMechanism >= 0 && firstMechanism < firstAnalogy)) e.push('teaching_mode intuition_first: the intuition or analogy must come before any mechanism, equation or code');
      if (firstAnalogy >= 0 && !roles.slice(firstAnalogy + 1).some(r => ['mechanism', 'bridge_to_formalism'].includes(r))) e.push('teaching_mode intuition_first: the analogy never maps back to the real mechanism');
      break;
    case 'code_walkthrough':
      if (!roles.includes('implementation')) e.push('teaching_mode code_walkthrough: no implementation beat');
      for (const b of withCode) if (!b.visible_objects.some(o => o.source)) e.push(`teaching_mode code_walkthrough: ${b.id} walks through no source lines`);
      break;
    case 'system_flow': {
      if (!roles.includes('mechanism')) e.push('teaching_mode system_flow: no mechanism beat');
      if (objects.size < 3) e.push('teaching_mode system_flow: fewer than three components');
      if (!beats.some(b => b.visible_objects.filter(o => o.change).length >= 2)) e.push('teaching_mode system_flow: nothing passes between components (no beat changes two objects)');
      break;
    }
  }

  for (const [m, at] of coverageShow) if (!at.length) e.push(`storyboard: must_show "${m}" is not visibly covered${declared.get(m).length ? ` (declared by ${declared.get(m).join(', ')}, which do not show enough of it)` : ''}`);
  const fps = STAGE.fps;
  return {
    errors: [...new Set(e)],
    coverage: {
      must_show: [...coverageShow].map(([item, beatIds]) => ({ item, beats: beatIds, declared: declared.get(item) })),
      claims: [...coverageClaims].map(([id, beatIds]) => ({ id, required: claims.get(id).required, condition_ids: claims.get(id).condition_ids, beats: beatIds })),
      objects: [...objects].map(([id, beatIds]) => ({ id, beats: beatIds })),
    },
    timeline: beats.map(b => ({ id: b.id, start: b.start_time, end: b.end_time, frames: [Math.round(b.start_time * fps), Math.round(b.end_time * fps) - 1], role: b.pedagogical_role, claims: b.claim_ids, conditions: b.condition_ids || [], objects: b.visible_objects.map(o => `${o.id}${o.change ? '*' : ''}`), on_screen_text: b.on_screen_text, narration_line: b.narration_line ?? null })),
  };
}
