// The code-explain card's frozen data contract (code-explain-card-spec.md section 2; schemas in code-explain.schema.json).
// A leaf module with pure functions and no I/O, shared by the browser (packages/web/src, imports this path like telemetry-contract.js)
// and the control plane (the learn-code-explain handler). Each validator returns an array of error strings; empty = valid.
import SCHEMA from './code-explain.schema.json' with { type: 'json' };

// One place for the cap: the primary card plus up to 3 satellites (spec section 1). The schema's files.maxItems is kept equal by a test.
export const CODE_EXPLAIN_MAX_CARDS = 4;
export const CODE_EXPLAIN_DEPTHS = ['brief', 'standard', 'detailed'];
export const CODE_EXPLAIN_ROUTES = ['code-explain', 'answer'];

// A standalone schema for one entry of the file: codeExplain, codeExplainModelOutput, codeExplainMetaPayload, codeCardAdditions, messageMeta.
export const codeExplainSchema = name => ({ $schema: SCHEMA.$schema, $id: `${SCHEMA.$id}#${name}`, $ref: `#/$defs/${name}`, $defs: SCHEMA.$defs });

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isLine = n => Number.isInteger(n) && n >= 1;
// path:start-end, and path:start when the range is one line (spec 2a example "bench.py:88").
const source = (path, start, end) => `${path}:${start}${start === end ? '' : `-${end}`}`;
function canonicalSource(text) {
  const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(text);
  return m ? source(m[1], +m[2], m[3] === undefined ? +m[2] : +m[3]) : null;
}

// One range (or mention): shape, start <= end, within the file's line count at the commit. lines(path) -> line count, or a non-number for an unknown file.
function checkRange(errors, where, path, r, lines) {
  if (!isObject(r) || typeof r.id !== 'string' || !r.id) return errors.push(`${where}: needs a string id`), false;
  if (!isLine(r.start) || !isLine(r.end)) return errors.push(`${where} (${r.id}): start and end must be integers >= 1`), false;
  if (r.start > r.end) errors.push(`${where} (${r.id}): start ${r.start} is after end ${r.end}`);
  const count = lines(path);
  if (!Number.isInteger(count)) errors.push(`${where} (${r.id}): ${path} is not in the snapshot`);
  else if (r.end > count) errors.push(`${where} (${r.id}): end ${r.end} is past the ${count} lines of ${path}`);
  return true;
}

// The card (spec 2d). mode 'client' (on insert): the saved block, files[*].cardId present, boardCardIds = the ids of the code cards on the
// board; a target whose card was deleted is not an error here (a target only has to be a range or mention id, it then renders as a file:line link).
// mode 'server' (on generation): the model's output, no cardIds (none exist yet) and no deleted cards; figure may still be absent.
export function validateCodeExplain(card, { mode = 'client', lines, boardCardIds = [] } = {}) {
  const errors = [], err = m => errors.push(m);
  if (!isObject(card)) return ['codeExplain: not an object'];
  if (card.type !== 'codeExplain') err('type must be "codeExplain"');
  const client = mode === 'client', board = new Set(boardCardIds);
  const ids = new Set(), sources = new Set();
  const addId = (id, where) => { if (ids.has(id)) err(`${where}: duplicate id ${id}`); ids.add(id); };

  const files = Array.isArray(card.files) ? card.files : (err('files must be an array'), []);
  if (files.length < 1) err('files needs at least the primary file');
  if (files.length > CODE_EXPLAIN_MAX_CARDS) err(`files has ${files.length} entries; at most ${CODE_EXPLAIN_MAX_CARDS} (CODE_EXPLAIN_MAX_CARDS)`);
  files.forEach((f, i) => {
    const where = `files[${i}]`;
    if (!isObject(f) || typeof f.path !== 'string' || !f.path) return err(`${where}: needs a path`);
    if (client) {
      if (i === 0 && f.cardId !== 'self') err(`${where}.cardId must be "self"`);
      else if (i > 0 && f.cardId === 'self') err(`${where}.cardId "self" is only for files[0]`);
      else if (i > 0 && !board.has(f.cardId)) err(`${where}.cardId ${JSON.stringify(f.cardId)} is not a code card on the board`);
    } else if ('cardId' in f) err(`${where}.cardId is assigned on insert, not by the model`);
    if (!Array.isArray(f.ranges) || !f.ranges.length) return err(`${where}.ranges needs at least one range`);
    f.ranges.forEach((r, j) => {
      if (checkRange(errors, `${where}.ranges[${j}]`, f.path, r, lines)) { addId(r.id, `${where}.ranges[${j}]`); sources.add(source(f.path, r.start, r.end)); }
    });
  });
  (Array.isArray(card.mentioned) ? card.mentioned : (err('mentioned must be an array'), [])).forEach((m, i) => {
    const where = `mentioned[${i}]`;
    if (!isObject(m) || typeof m.path !== 'string' || !m.path) return err(`${where}: needs a path`);
    if (checkRange(errors, where, m.path, m, lines)) { addId(m.id, where); sources.add(source(m.path, m.start, m.end)); }
  });

  if (!CODE_EXPLAIN_DEPTHS.includes(card.depth)) err(`depth must be one of ${CODE_EXPLAIN_DEPTHS.join(', ')}`);
  if (!isObject(card.depths)) err('depths must be an object');
  else {
    for (const name of CODE_EXPLAIN_DEPTHS) {
      const d = card.depths[name], where = `depths.${name}`;
      if (!isObject(d)) { err(`${where} is missing`); continue; }
      if (typeof d.prose !== 'string' || !d.prose.trim()) err(`${where}.prose must be a non-empty string`);
      if (!Array.isArray(d.anchors)) err(`${where}.anchors must be an array`);
      else d.anchors.forEach((a, i) => {
        if (!isObject(a) || !Number.isInteger(a.sentence) || a.sentence < 0) err(`${where}.anchors[${i}]: sentence must be an integer >= 0`);
        else if (!ids.has(a.target)) err(`${where}.anchors[${i}]: target ${JSON.stringify(a.target)} is not a range or mention id`);
      });
      if ('trace' in d && name !== 'detailed') err(`${where}.trace is only allowed on detailed`);
      else if ('trace' in d && !(isObject(d.trace) && typeof d.trace.input === 'string' && Array.isArray(d.trace.steps) && d.trace.steps.length && d.trace.steps.every(s => typeof s === 'string')))
        err(`${where}.trace must be {input: string, steps: string[]}`);
    }
    for (const name of Object.keys(card.depths)) if (!CODE_EXPLAIN_DEPTHS.includes(name)) err(`depths.${name} is not a depth`);
  }

  if (!Array.isArray(card.suggestions) || card.suggestions.length !== 3) err('suggestions must be exactly three');
  else card.suggestions.forEach((s, i) => { if (typeof s !== 'string' || !s.trim().endsWith('?')) err(`suggestions[${i}] must be a question ending in "?"`); });

  if (card.figure === undefined) { if (client) err('figure must be null or {referenceId, spec}'); }
  else if (card.figure !== null && !(isObject(card.figure) && typeof card.figure.referenceId === 'string' && card.figure.referenceId && isObject(card.figure.spec))) err('figure must be null or {referenceId, spec}');

  if (!isObject(card.evidence) || !Array.isArray(card.evidence.sources)) err('evidence.sources must be an array');
  else {
    const given = new Set(card.evidence.sources.map(s => canonicalSource(String(s)) ?? `unparseable:${s}`));
    for (const s of sources) if (!given.has(s)) err(`evidence.sources is missing ${s}`);
    for (const s of given) if (!sources.has(s)) err(`evidence.sources has ${s}, which is not a range or mention`);
  }
  return errors;
}

// The meta the control plane returns with an answer (spec section 3 step 3, section 5). Its payload is validated in server mode.
export function validateMessageMeta(meta, { lines } = {}) {
  if (!isObject(meta)) return ['meta: not an object'];
  const errors = [];
  if (!CODE_EXPLAIN_ROUTES.includes(meta.route)) errors.push(`route must be one of ${CODE_EXPLAIN_ROUTES.join(', ')}`);
  if (meta.reason !== undefined && (typeof meta.reason !== 'string' || !meta.reason)) errors.push('reason must be a non-empty string');
  if (meta.codeExplain === null) {
    if (meta.route === 'code-explain' && !meta.reason) errors.push('a code-explain route with no card needs a reason (no silent failure)');
  } else if (meta.route === 'answer') errors.push('route "answer" must have codeExplain null');
  else errors.push(...validateCodeExplain(meta.codeExplain, { mode: 'server', lines }).map(e => `codeExplain: ${e}`));
  return errors;
}

// What a satellite code card gains (spec 2b): ranges (within lineCount when given, start <= end, unique ids) and from "codeExplain:<primary id>".
export function validateCodeCardAdditions(add, { lineCount } = {}) {
  if (!isObject(add)) return ['additions: not an object'];
  const errors = [], seen = new Set();
  if (add.from !== undefined && !(typeof add.from === 'string' && /^codeExplain:.+$/.test(add.from))) errors.push('from must be "codeExplain:<primary card id>"');
  if (add.ranges !== undefined) {
    if (!Array.isArray(add.ranges) || !add.ranges.length) errors.push('ranges must be a non-empty array');
    else add.ranges.forEach((r, i) => {
      if (checkRange(errors, `ranges[${i}]`, 'file', r, () => lineCount ?? Number.MAX_SAFE_INTEGER)) { if (seen.has(r.id)) errors.push(`ranges[${i}]: duplicate id ${r.id}`); seen.add(r.id); }
    });
  }
  return errors;
}
