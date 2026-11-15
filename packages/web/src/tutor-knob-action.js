// packages/web/src/tutor-knob-action.js
// The one action a Tutor answer can carry for the Run card (Run card v1.1 Part 1b): "Add `--top_k` to the Run card". Given a question about changing a parameter and an answer that quotes the
// line that declares it (argparse add_argument, click option, or a configurator-style `name = literal`), the flag, its type, its default and its source (file:line) are read from that line;
// nothing is guessed: a flag the answer does not show in a declaration, or a default that is not a plain literal, offers no action. Pure: no React, no network, no model.
import { ADD_KNOB_EVENT } from './run-card-knobs.js';

const CHANGE = /\b(change|changing|set|setting|tweak|adjust|vary|modify|raise|lower|increase|decrease|turn|try|use|different|knob|parameter|param|flag|option|setting)\b/i;
export const isChangeQuestion = question => CHANGE.test(String(question || ''));

// The type and default a source literal says: 200 int, 0.8 and 6e-4 float, True bool, 'ROMEO:' string; anything else (an expression, None, a list) is not a knob.
export function literalOf(text) {
  const raw = String(text ?? '').trim().replace(/[,;]+$/, '').trim();
  if (/^[-+]?\d[\d_]*$/.test(raw)) return { type: 'int', default: raw.replace(/_/g, '') };
  if (/^[-+]?(\d[\d_]*\.\d*|\.\d+|\d[\d_]*)([eE][-+]?\d+)?$/.test(raw)) return { type: 'float', default: raw.replace(/_/g, '') };
  if (/^(True|False|true|false)$/.test(raw)) return { type: 'bool', default: raw };
  const q = /^(['"])(.*)\1$/.exec(raw);
  return q ? { type: 'string', default: q[2] } : null;
}

const ARG = /(?:add_argument|click\.option|\boption)\(\s*(?:['"]-[A-Za-z]['"]\s*,\s*)?['"](--[A-Za-z0-9_-]+)['"]([^)]*)\)/g;
const PYTYPE = { int: 'int', float: 'float', str: 'string', bool: 'bool' };
// Declarations in a text: [{ flag, type, default, at }] where at is the index in the text.
export function declarationsIn(text) {
  const out = [], body = String(text || '');
  for (const m of body.matchAll(ARG)) {
    const args = m[2], d = /default\s*=\s*([^,)]+(?:\([^)]*\))?)/.exec(args), t = /type\s*=\s*(\w+)/.exec(args), lit = d ? literalOf(d[1]) : null;
    if (/store_true|is_flag\s*=\s*True/.test(args)) { out.push({ flag: m[1], type: 'bool', default: 'False', at: m.index }); continue; }
    const type = t ? PYTYPE[t[1]] || null : lit?.type;
    if (type && (lit || !d)) out.push({ flag: m[1], type, default: lit ? lit.default : '', at: m.index });
  }
  for (const m of body.matchAll(/(?:^|[\s`(])([a-z_][a-z0-9_]*)\s*=\s*([^\s#`]+(?:\s[^\s#`]+)?)\s*(?:#[^`\n]*)?(?=`|\n|$)/gm)) {
    if (/^(def|if|for|in)$/.test(m[1])) continue;
    const lit = literalOf(m[2]) || literalOf(m[2].split(/\s/)[0]);
    if (lit) out.push({ flag: `--${m[1]}`, ...lit, at: m.index });
  }
  return out;
}

// "path.py:74" or "path.py:L74-L80" in a text, as { path, line, at }.
const CITATION = /([\w][\w./-]*\.[A-Za-z0-9]+):L?(\d+)(?:-L?\d+)?/g;
export const citationsIn = text => [...String(text || '').matchAll(CITATION)].map(m => ({ path: m[1], line: Number(m[2]), at: m.index }));
const refCitations = refs => (refs || []).filter(r => r?.kind === 'code' && r.range?.start).map(r => ({ path: r.range.path, line: r.range.start, repo: (/^code:([^@]*)@([^:]*):/.exec(r.sourceId || '') || [])[1] || '', commit: (/^code:([^@]*)@([^:]*):/.exec(r.sourceId || '') || [])[2] || r.version || '' }));

const words = text => ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
// -> { flag, type, default, source, repo, commit } for the one declaration the answer shows, or null.
// question: what the learner asked; content: the answer's text; contextRefs: the answer's code refs (chat-sources.js codeRef).
export function knobFromAnswer({ question, content, contextRefs }) {
  if (!isChangeQuestion(question)) return null;
  const decls = declarationsIn(content);
  if (!decls.length) return null;
  const asked = words(question);
  const named = decls.filter(d => asked.includes(words(d.flag)));
  const pick = named.length ? named[0] : decls.length === 1 ? decls[0] : null;
  if (!pick) return null;
  const text = String(content || ''), cites = citationsIn(text), refs = refCitations(contextRefs);
  // The citation on the declaration's own line, else the only one the answer has, else the only code ref it was grounded on.
  const lineStart = text.lastIndexOf('\n', pick.at) + 1, lineEnd = text.indexOf('\n', pick.at), line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  const here = citationsIn(line)[0], uniq = [...new Map(cites.map(c => [`${c.path}:${c.line}`, c])).values()];
  const alone = decls.length === 1; // with several declarations a citation on another line is not this one's
  const at = here || (alone && uniq.length === 1 ? uniq[0] : null) || (alone && refs.length === 1 ? refs[0] : null);
  if (!at) return null;
  const ref = refs.find(r => r.path === at.path) || refs[0] || {};
  return { flag: pick.flag, type: pick.type, default: pick.default, source: `${at.path}:${at.line}`, repo: ref.repo || '', commit: ref.commit || '' };
}

// The action's label parts, and its click: dispatch the event the owning Run card handles (AdaptiveCanvas RunNode). The card says whether it took it (preventDefault); onResult gets the status.
export const knobActionLabel = knob => ({ before: 'Add ', flag: knob.flag, after: ' to the Run card' });
export function addKnobToCard(knob, { app, routeId } = {}, dispatch = event => window.dispatchEvent(event)) {
  const { repo, commit, ...wire } = knob, detail = { app, repo, commit, routeId, knob: wire, status: null };
  const event = new CustomEvent(ADD_KNOB_EVENT, { detail, cancelable: true });
  dispatch(event);
  return event.defaultPrevented ? detail.status || 'added' : 'none'; // the card sets detail.status ('added' | 'exists' | ...) when it takes the event
}
