#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import { getEncoding } from 'js-tiktoken';
import { plotSeriesPoints } from '../../../packages/web/src/tutor-diagrams/ml-plot-spec.js';

const encoding = getEncoding('cl100k_base');
const DEPTHS = ['overview', 'standard', 'deep'];
const ALIASES = { overview: 'brief', standard: 'balanced', deep: 'detailed' };
const TEXT_FIELDS = new Set(['title', 'caption', 'label', 'edgeLabel', 'heading', 'detail', 'unit', 'note', 'class', 'rowLabel', 'columnLabel', 'xLabel', 'name', 'operation', 'claim', 'conclusion']);
const TEXT_LISTS = new Set(['items', 'columns', 'cells', 'steps', 'categories']);
const DISPLAY_NUMBER_FIELDS = new Set(['title', 'caption', 'label', 'edgeLabel', 'heading', 'detail', 'rowLabel', 'columnLabel', 'xLabel']);
const DIAGRAM_ROOT = 'packages/web/src/tutor-diagrams';
const MAX_BYTES = 200 * 1024;
const flag = (id, depth, rule, detail, severity = 'error') => ({ id, depth, rule, detail, severity });
const learnerKeyword = value => typeof value === 'string' && value.trim() && value === value.toLowerCase() && value.trim().split(/\s+/u).length <= 3;
function hasLearnerKeywords(reference) {
  return (Array.isArray(reference.shortKeywords) && reference.shortKeywords.length >= 2 && reference.shortKeywords.length <= 3 && reference.shortKeywords.every(learnerKeyword))
    || (Array.isArray(reference.keywords) && reference.keywords.filter(learnerKeyword).length >= 2);
}
const inside = (root, target) => target === root || target.startsWith(root + path.sep);
const slash = value => value.split(path.sep).join('/');
const testFile = value => /\.(?:test|spec)\.[cm]?js$/u.test(value);
const astFor = content => parse(content, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

function walk(value, visit, trail = []) {
  visit(value, trail);
  if (Array.isArray(value)) value.forEach((item, i) => walk(item, visit, [...trail, i]));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => walk(item, visit, [...trail, key]));
}

function textEntries(spec) {
  const entries = [];
  walk(spec?.diagram, (value, trail) => {
    if (typeof value !== 'string') return;
    const key = trail.at(-1);
    if (TEXT_FIELDS.has(key) || (Number.isInteger(key) && TEXT_LISTS.has(trail.at(-2)))) entries.push({ value, trail });
  }, ['diagram']);
  // Compact sample labels are renderer-generated text; include them in the same checks.
  walk(spec?.diagram, (value, trail) => {
    if (value?.kind !== 'coordinate-plot') return;
    for (const [i, series] of (value.series ?? []).entries()) {
      if (series.samples?.showValues) for (const [j, point] of plotSeriesPoints(series).entries()) {
        if (point.label) entries.push({ value: point.label, trail: [...trail, 'series', i, 'points', j, 'label'] });
      }
    }
  }, ['diagram']);
  return entries;
}

function numbers(text) {
  // Include digits in formula subscripts, labels such as T1, decimals, and scientific notation.
  return [...String(text).matchAll(/[+−-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+−-]?\d+)?/gu)]
    .map(match => Number(match[0].replace('−', '-'))).filter(Number.isFinite);
}

// Rule 6 (reviewer 2026-11-12): inside $…$, exponents, subscripts and the integers 0, 1 and 2 are formula constants;
// every other number in a title, caption or label must come from derived(). Minus signs inside a formula are operators.
function displayNumbers(text) {
  const { plain, formulas, unclosed, pending } = mathParts(String(text));
  const formulaNumbers = [...formulas, ...(unclosed ? [pending] : [])].flatMap(formula => [...formula
    .replace(/[\^_](?:\{[^}]*\}|\d+(?:\.\d+)?)/gu, ' ').matchAll(/(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+−-]?\d+)?/gu)].map(match => Number(match[0])))
    .filter(number => Number.isFinite(number) && ![0, 1, 2].includes(number));
  return [...numbers(plain), ...formulaNumbers];
}

function mathParts(text) {
  let plain = '', formula = '', open = false;
  const formulas = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
      if (open) { formulas.push(formula); formula = ''; }
      open = !open;
    } else if (open) formula += text[i];
    else plain += text[i];
  }
  return { plain, formulas, unclosed: open, pending: formula };
}

function specAt(reference, depth) {
  return reference.depths?.[depth]?.spec ?? reference.depths?.[ALIASES[depth]]?.spec ?? reference.spec;
}

export const countSpecTokens = spec => encoding.encode(JSON.stringify(spec), [], []).length;

// Count rendered teaching entities rather than JSON array lengths: samples expand to marks,
// a matrix contains cells, and nested diagrams contribute their own entities.
function elementCount(diagram) {
  if (!diagram) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(diagram)) {
    if (key === 'series' && diagram.kind === 'coordinate-plot') {
      total += value.reduce((count, series) => count + plotSeriesPoints(series).length + 1, 0);
    } else if (Array.isArray(value)) {
      total += value.length;
      for (const item of value) {
        if (item?.diagram) total += elementCount(item.diagram);
        if (item && typeof item === 'object' && Array.isArray(item.cells)) total += item.cells.length;
        if (item && typeof item === 'object' && Array.isArray(item.values)) total += item.values.length;
        if (item && typeof item === 'object' && Array.isArray(item.members)) total += item.members.length;
        // Optional detail/class text is itself an element omitted in Brief.
        if (item && typeof item === 'object') total += ['detail', 'class', 'edgeLabel', 'label'].filter(field => item[field] !== undefined).length;
      }
    } else if (value?.diagram) total += elementCount(value.diagram);
  }
  return total;
}

function depthFacts(spec) {
  const facts = new Set();
  walk(spec?.diagram, (value, trail) => {
    if (typeof value === 'number' && !['min', 'max', 'divisor', 'start', 'step'].includes(trail.at(-1))) facts.add(`n:${value}`);
  });
  for (const { value } of textEntries(spec)) {
    numbers(value).forEach(number => facts.add(`n:${number}`));
    mathParts(value).formulas.forEach(formula => facts.add(`f:${formula.replace(/\s+/gu, '')}`));
  }
  // showValues exposes numbers already present as data; their display is additional arithmetic.
  walk(spec?.diagram, value => {
    if (value?.samples?.showValues) plotSeriesPoints(value).filter(point => point.label).forEach(point => facts.add(`shown:${point.label}`));
  });
  return facts;
}

function sourceFiles(source) {
  if (typeof source === 'string') return [{ path: '<module>', content: source }];
  if (Array.isArray(source)) return source.filter(file => typeof file?.content === 'string');
  return Object.entries(source ?? {}).map(([name, content]) => ({ path: name, content })).filter(file => typeof file.content === 'string');
}

function hasDerivedAssertion(files) {
  return files.some(file => {
    if (!testFile(file.path) && file.path !== 'test') return false;
    let ast;
    try { ast = astFor(file.content); } catch { return false; }
    const derivedNames = new Set(['derived']), assertNames = new Set(['assert']);
    walk(ast, node => {
      if (node?.type !== 'ImportDeclaration') return;
      for (const item of node.specifiers) {
        if (item.imported?.name === 'derived') derivedNames.add(item.local.name);
        if (['node:assert', 'node:assert/strict'].includes(node.source.value)) assertNames.add(item.local.name);
      }
    });
    const derivedValues = new Set(derivedNames);
    let callsDerived = false, assertsDerived = false;
    const usesDerived = expression => {
      let found = false;
      walk(expression, node => { if (node?.type === 'Identifier' && derivedValues.has(node.name)) found = true; });
      return found;
    };
    walk(ast, node => {
      if (node?.type === 'CallExpression' && derivedNames.has(node.callee?.name)) callsDerived = true;
      if (node?.type === 'VariableDeclarator' && node.id.type === 'Identifier' && usesDerived(node.init)) derivedValues.add(node.id.name);
      if (node?.type !== 'CallExpression') return;
      const name = node.callee?.type === 'MemberExpression' ? node.callee.object?.name : node.callee?.name;
      if (assertNames.has(name) && node.arguments.some(usesDerived)) assertsDerived = true;
    });
    return callsDerived && assertsDerived;
  });
}

function typedDisplayNumbers(files) {
  const findings = [];
  for (const file of files.filter(file => !testFile(file.path) && file.path !== 'test' && /(?:\.[cm]?js$|^<module>$|^module$)/u.test(file.path))) {
    let ast;
    try { ast = astFor(file.content); } catch { continue; }
    walk(ast, node => {
      if (node?.type !== 'Property' || !DISPLAY_NUMBER_FIELDS.has(node.key?.name ?? node.key?.value)) return;
      walk(node.value, item => {
        const text = item?.type === 'Literal' && typeof item.value === 'string' ? item.value
          : item?.type === 'TemplateLiteral' ? item.quasis.map(quasi => quasi.value.cooked).join('x') : null;
        if (text && displayNumbers(text).length) findings.push(`${file.path}:${item.loc.start.line} contains typed display number(s) in ${JSON.stringify(text)}`);
      });
    });
  }
  return [...new Set(findings)];
}

function numericSet(value) {
  const found = new Set();
  walk(value, entry => {
    if (typeof entry === 'number' && Number.isFinite(entry)) found.add(entry);
    if (typeof entry === 'string') numbers(entry).forEach(number => found.add(number));
  });
  return found;
}

function promptEntries(prompts) {
  return (Array.isArray(prompts) ? prompts : prompts?.prompts ?? []).map(entry => typeof entry === 'string' ? { prompt: entry } : entry);
}

function referenceForPrompt(entry) {
  return entry.referenceId ?? entry.expectedReferenceId ?? entry.expectedReference ?? entry.reference;
}

function collisionFlags(references, supplied = []) {
  const flags = [], seen = new Set();
  const report = (ids, depth, kind, prompt) => {
    for (const id of ids) {
      const key = `${id}|${depth}|${kind}|${prompt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push(flag(id, depth, 8, `Two worked ${kind ?? 'same-kind'} references are selectable for ${JSON.stringify(prompt ?? '')}: ${ids.join(', ')}`));
    }
  };
  const records = Array.isArray(supplied) ? supplied : supplied?.prompts ?? supplied?.collisions ?? [];
  for (const record of records) {
    const depthRecords = Array.isArray(record.depths) ? record.depths.map(value => ({ ...record, ...value }))
      : record.depths ? Object.entries(record.depths).map(([depth, value]) => ({ ...record, ...value, depth })) : [record];
    for (const item of depthRecords) {
      const selected = item.references ?? item.selected ?? item.hits ?? [];
      const byKind = new Map();
      for (const ref of selected.filter(ref => ref && !/^(?:shape|general)-/u.test(ref.id))) {
        const kind = ref.kind ?? ref.spec?.diagram?.kind;
        if (!kind) continue;
        byKind.set(kind, [...(byKind.get(kind) ?? []), ref.id]);
      }
      for (const [kind, ids] of byKind) if (new Set(ids).size > 1) report([...new Set(ids)], item.depth ?? '*', kind, item.prompt);
      if (item.collision === true || (item.referenceIds?.length > 1)) {
        report(item.referenceIds ?? selected.map(ref => ref.id) ?? [item.id ?? '<coverage>'], item.depth ?? '*', item.kind, item.prompt);
        if (!selected.length && !item.referenceIds?.length) report([item.referenceId ?? item.id ?? '<coverage>'], item.depth ?? '*', item.kind, item.prompt);
      }
    }
  }
  // Exact duplicates can be established without making up planner results. Full keyword
  // collisions are provided by the authoritative coverage/selector machinery above.
  for (const depth of DEPTHS) {
    const groups = new Map();
    for (const ref of references.filter(ref => !/^(?:shape|general)-/u.test(ref.id))) for (const prompt of ref.prompts ?? []) {
      const kind = specAt(ref, depth)?.diagram?.kind;
      const key = `${kind}|${prompt}`;
      groups.set(key, { prompt, kind, ids: [...(groups.get(key)?.ids ?? []), ref.id] });
    }
    for (const { prompt, kind, ids } of groups.values()) if (new Set(ids).size > 1) report([...new Set(ids)], depth, kind, prompt);
  }
  return flags;
}

/** Validate the new routing layer only. Existing specs, keyword lists and numeric
 * provenance remain trusted legacy data. Supply selector records for keyword collisions. */
export function lintOverlays({ overlays = {}, references = [], prompts = [], source, repoRoot = process.cwd(), topic, collisions = [] } = {}) {
  const files = sourceFiles(source).map(file => ({ ...file, path: file.path === '<module>' || file.path === 'module'
    ? `${DIAGRAM_ROOT}/topic-${topic}-overlays.js` : file.path === 'test' ? `${DIAGRAM_ROOT}/topic-${topic}-overlays.test.mjs` : file.path }));
  const flags = files.length ? lintAuthoredFiles({ files, repoRoot, topic }) : [];
  if (!overlays || typeof overlays !== 'object' || Array.isArray(overlays)) return [...flags, flag('<overlays>', '*', 2, 'Overlays must be an object keyed by existing reference ID.')];
  const entries = promptEntries(prompts), byId = new Map(references.map(ref => [ref.id, ref]));
  const affectedPrompts = new Set();
  for (const [id, overlay] of Object.entries(overlays)) {
    if (!byId.has(id)) flags.push(flag(id, '*', 2, 'Overlay refers to an unknown reference.'));
    const validPrompts = Array.isArray(overlay?.prompts) && overlay.prompts.length > 0 && overlay.prompts.every(prompt => typeof prompt === 'string' && prompt.trim());
    const validKeywords = hasLearnerKeywords(overlay ?? {});
    if (!validPrompts || !validKeywords) flags.push(flag(id, '*', 2, 'Overlay needs verbatim prompts and 2–3 lowercase keywords of at most 3 words.'));
    if (validPrompts) for (const prompt of overlay.prompts) {
      affectedPrompts.add(prompt);
      if (entries.length && !entries.some(entry => entry.prompt === prompt && (!referenceForPrompt(entry) || referenceForPrompt(entry) === id))) {
        flags.push(flag(id, '*', 2, `Overlay prompt is not an authoritative verbatim prompt for this reference: ${JSON.stringify(prompt)}`));
      }
    }
    for (const entry of entries.filter(entry => referenceForPrompt(entry) === id)) {
      affectedPrompts.add(entry.prompt);
      if (!byId.get(id)?.prompts?.includes(entry.prompt) && !(Array.isArray(overlay?.prompts) && overlay.prompts.includes(entry.prompt))) flags.push(flag(id, '*', 2, `Lesson prompt is missing verbatim from the reference/overlay: ${JSON.stringify(entry.prompt)}`));
    }
  }
  const selectionViews = references.map(ref => ({ ...ref,
    prompts: [...new Set([...(ref.prompts ?? []), ...(Array.isArray(overlays[ref.id]?.prompts) ? overlays[ref.id].prompts : [])])].filter(prompt => affectedPrompts.has(prompt)),
  }));
  return [...flags, ...collisionFlags(selectionViews, collisions)];
}

/** Pure checks. source is text or [{path,content}]; derived is derived() or its JSON result.
 * Coverage records carry actual selected references; the linter does not emulate the selector. */
export function lintReferences({ references = [], prompts = [], source, derived, authored = false, collisions = [] } = {}) {
  const flags = [], entries = promptEntries(prompts), files = sourceFiles(source);
  const severity = authored ? 'error' : 'warning';
  let computed, derivedError;
  try { computed = typeof derived === 'function' ? derived() : derived; } catch (error) { derivedError = error.message; }
  for (const reference of references) {
    const id = reference.id ?? '<reference>';
    if (!hasLearnerKeywords(reference)) {
      flags.push(flag(id, '*', 2, 'Provide 2–3 shortKeywords or at least two short lowercase keywords, each at most 3 words.'));
    }
    if (!Array.isArray(reference.prompts) || !reference.prompts.length) flags.push(flag(id, '*', 2, 'The reference must carry a verbatim lesson prompt.'));
    for (const entry of entries.filter(entry => referenceForPrompt(entry) === id)) {
      if (!reference.prompts?.includes(entry.prompt)) flags.push(flag(id, '*', 2, `Lesson prompt is missing verbatim: ${JSON.stringify(entry.prompt)}`));
    }
    for (const depth of DEPTHS) {
      const spec = specAt(reference, depth);
      if (!spec?.diagram) { flags.push(flag(id, depth, 9, 'Missing diagram for this depth.')); continue; }
      const tokens = countSpecTokens(spec);
      if (tokens > 300) flags.push(flag(id, depth, 1, `Compact spec is ${tokens} cl100k_base tokens; maximum is 300.`));
      const texts = textEntries(spec);
      for (const { value, trail } of texts) {
        if (/^(?:parallel|merge|decision|process|terminal|start|end)\b/iu.test(value.trim()) && (trail.at(-1) !== 'title' && trail.at(-1) !== 'caption')) {
          flags.push(flag(id, depth, 3, `${trail.join('.')} begins with a role word: ${JSON.stringify(value)}`));
        }
        const math = mathParts(value);
        if (math.unclosed || /\\[A-Za-z]+|[\^_]/u.test(math.plain)) flags.push(flag(id, depth, 4, `${trail.join('.')} needs complete $…$ delimiters: ${JSON.stringify(value)}`));
      }
      walk(spec.diagram, (diagram, trail) => {
        if (diagram?.kind !== 'coordinate-plot') return;
        for (const name of ['x', 'y']) {
          const axis = diagram[name] ?? {}, label = `${axis.label ?? ''} ${axis.unit ?? ''}`.trim();
          if (!axis.label?.trim() || /\b(?:units|48ths)\b|7\.5\s*°/iu.test(label) || /^(?:x|y|value|values|axis|score)$/iu.test(label)) {
            flags.push(flag(id, depth, 5, `${[...trail, name].join('.')} must name a learner quantity/unit, without units, 48ths, or 7.5°: ${JSON.stringify(label)}`));
          }
          if (axis.scale === 'log') for (const [index, series] of (diagram.series ?? []).entries()) {
            const values = plotSeriesPoints(series).flatMap(point => name === 'y' ? [point.y, point.low, point.high].filter(value => value !== undefined) : [point.x]);
            const min = Math.min(...values), max = Math.max(...values);
            if (!values.length || min <= 0 || max / min < 100 - 1e-9) flags.push(flag(id, depth, 7, `${[...trail, name].join('.')} is logarithmic but series ${index} (${series.label}) spans less than 2 decades (${min} to ${max}).`));
          }
        }
      }, ['diagram']);
      if (computed === undefined || derivedError) flags.push(flag(id, depth, 6, derivedError ? `derived() failed: ${derivedError}` : `Module has no derived() numeric provenance.${authored ? '' : ' Pre-existing modules receive a warning.'}`, severity));
      else {
        const scoped = computed?.[id]?.[depth] ?? computed?.[id]?.[ALIASES[depth]] ?? computed?.[id] ?? computed;
        const values = numericSet(scoped);
        const missing = [...new Set(texts.filter(({ trail }) => DISPLAY_NUMBER_FIELDS.has(trail.at(-1)) || Number.isInteger(trail.at(-1))).flatMap(({ value }) => displayNumbers(value)))].filter(number => !values.has(number));
        if (missing.length) flags.push(flag(id, depth, 6, `Display numbers absent from derived(): ${missing.join(', ')}`, severity));
      }
      const relevant = entries.filter(entry => referenceForPrompt(entry) === id || reference.prompts?.includes(entry.prompt));
      const illustrative = reference.data === 'illustrative' || reference.illustrative === true || relevant.some(entry => entry.data === 'illustrative') || /\billustrative\b/iu.test(reference.useWhen ?? '');
      if (illustrative && !/^Illustrative\b/u.test(spec.diagram.caption ?? '') && !/\billustrative\b/iu.test(`${spec.diagram.title ?? ''} ${spec.diagram.caption ?? ''}`)) {
        flags.push(flag(id, depth, 10, 'Illustrative values need an Illustrative caption prefix or the N1 illustrative marker in the title/caption.'));
      }
    }
    const overview = specAt(reference, 'overview'), standard = specAt(reference, 'standard'), deep = specAt(reference, 'deep');
    if (overview?.diagram && standard?.diagram && elementCount(overview.diagram) >= elementCount(standard.diagram)) {
      // Rule 9 (reviewer 2026-11-12): an error only when Balanced has more than 6 elements; a two-bar chart may equal its Brief.
      flags.push(flag(id, 'overview', 9, `Brief must have fewer rendered elements than Balanced (${elementCount(overview.diagram)} versus ${elementCount(standard.diagram)}).`, elementCount(standard.diagram) > 6 ? 'error' : 'warning'));
    }
    if (deep?.diagram && standard?.diagram) {
      const balanced = depthFacts(standard);
      if (![...depthFacts(deep)].some(fact => !balanced.has(fact))) flags.push(flag(id, 'deep', 9, 'Detailed adds no number or formula beyond Balanced.'));
    }
  }
  for (const entry of entries.filter(entry => !referenceForPrompt(entry))) {
    if (!references.some(ref => ref.prompts?.includes(entry.prompt))) flags.push(flag(`<prompt:${entry.id ?? entry.prompt}>`, '*', 2, `Lesson prompt is missing verbatim: ${JSON.stringify(entry.prompt)}`));
  }
  if (authored && !hasDerivedAssertion(files)) flags.push(flag('<module>', '*', 6, 'Authored modules require a lesson test asserting caption/display numbers against derived().'));
  if (authored) for (const detail of typedDisplayNumbers(files)) flags.push(flag('<module>', '*', 6, detail));
  return [...flags, ...collisionFlags(references, collisions)].map(issue => !authored && [2, 9].includes(issue.rule) ? { ...issue, severity: 'warning' } : issue);
}

/** Stage-05 path policy shared by static checks. The registry is the sole shared JS file. */
export function isAllowedAuthoredPath(filePath, { topic, slug } = {}) {
  const name = filePath.replaceAll('\\', '/');
  if (name.startsWith('/') || name.split('/').includes('..')) return false;
  const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const topicName = topic ?? slug;
  const topicPattern = topicName ? escaped(topicName) : '[a-z0-9]+(?:-[a-z0-9]+)*';
  if (new RegExp(`^${DIAGRAM_ROOT}/topic-${topicPattern}-(?:[a-z0-9.-]+)\\.(?:js|mjs|json)$`, 'u').test(name)) return true;
  if (name === `${DIAGRAM_ROOT}/reference-library.js`) return true;
  if (name === `${DIAGRAM_ROOT}/svg-snapshots.json`) return true;
  if (new RegExp(`^scripts/explain-bench/sets/demo-${topicPattern}\\.json$`, 'u').test(name)) return true;
  if (new RegExp(`^docs/features/explain-on-canvas/handoff/phase02-library/topic-walkthroughs/${topicPattern}\\.md$`, 'u').test(name)) return true;
  if (new RegExp(`^docs/features/explain/topics/${topicPattern}/[a-zA-Z0-9_./-]+\\.(?:json|md|svg)$`, 'u').test(name)) return true;
  if (/^docs\/features\/explain-on-canvas\/handoff\/figure-briefs\/briefs\/[a-z0-9.-]+\.md$/u.test(name)) return true;
  if (/^docs\/features\/explain-on-canvas\/handoff\/(?:phase02-library\/)?(?:illustrations|snapshots)\/ml-[a-z0-9-]+\/(?:natural|408|960)\.svg$/u.test(name)) return true;
  if (/^docs\/features\/explain-on-canvas\/handoff\/(?:phase02-library\/)?illustrations\/ml-[a-z0-9-]+\/spec\.json$/u.test(name)) return true;
  return false;
}

function importsFrom(ast) {
  const imports = [];
  walk(ast, node => {
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node?.type) && node.source) imports.push({ value: node.source.value, line: node.loc.start.line });
  });
  return imports;
}

/** Never evaluates content. Call this on the entire author response before writing/importing. */
export function lintAuthoredFiles({ files = [], repoRoot = process.cwd(), topic, slug } = {}) {
  const flags = [], root = path.resolve(repoRoot), diagramRoot = path.join(root, DIAGRAM_ROOT);
  const report = (id, detail) => flags.push(flag(id, 'source', 11, detail));
  if (files.length > 40) report('<round>', `Authored round has ${files.length} files; maximum is 40.`);
  const seen = new Set();
  for (const file of files) {
    const id = file.path ?? '<file>', content = file.content;
    if (seen.has(id)) report(id, 'Duplicate authored path.');
    seen.add(id);
    if (typeof content !== 'string') { report(id, 'Authored content must be text.'); continue; }
    if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) report(id, `File exceeds ${MAX_BYTES} bytes (200 KB).`);
    if (!isAllowedAuthoredPath(id, { topic, slug })) report(id, 'Path is outside the stage-05 authored-file allowlist.');
    const target = path.resolve(root, id);
    // Resolve the nearest existing ancestor so a symlinked output directory cannot escape.
    let ancestor = target;
    while (!existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor);
    if (!inside(realpathSync(root), realpathSync(ancestor))) report(id, 'Authored path resolves outside the worktree.');
    const allowedBuiltins = testFile(id) ? new Set(['node:test', 'node:assert']) : new Set();
    for (const match of content.matchAll(/\bnode:[A-Za-z0-9_/-]+/gu)) if (!allowedBuiltins.has(match[0])) report(id, `Forbidden built-in ${match[0]}.`);
    const forbidden = [
      ['require', /\brequire\b/u], ['dynamic import()', /\bimport\s*(?:\/\*[\s\S]*?\*\/\s*)?\(/u], ['eval', /\beval\b/u],
      ['new Function', /\bnew\s+Function\b/u], ['fetch', /\bfetch\b/u], ['process.', /\bprocess\s*(?:\?\.)?\s*[.\[]/u],
      ['globalThis.', /\bglobalThis\s*(?:\?\.)?\s*[.\[]/u], ['child_process', /\bchild_process\b/u], ['worker_threads', /\bworker_threads\b/u],
      ['WebSocket', /\bWebSocket\b/u], ['XMLHttpRequest', /\bXMLHttpRequest\b/u],
    ];
    // Rule 11 (reviewer 2026-11-12): the forbidden-text scan covers .js, .mjs and .json only; .md files get the path and size checks above.
    if (/.(?:[cm]?js|json)$/u.test(id)) for (const [name, pattern] of forbidden) if (pattern.test(content)) report(id, `Forbidden text/API: ${name}.`);
    if (!/\.[cm]?js$/u.test(id)) continue;
    let ast;
    try { ast = astFor(content); } catch (error) { report(id, `Cannot statically parse module: ${error.message}`); continue; }
    for (const entry of importsFrom(ast)) {
      if (allowedBuiltins.has(entry.value)) continue;
      if (!/^\.\.?\//u.test(entry.value)) { report(id, `Import on line ${entry.line} must be relative inside ${DIAGRAM_ROOT}: ${entry.value}`); continue; }
      const resolved = path.resolve(path.dirname(target), entry.value);
      if (/[?#]/u.test(entry.value) || !inside(diagramRoot, resolved) || (existsSync(resolved) && !inside(realpathSync(diagramRoot), realpathSync(resolved)))) {
        report(id, `Relative import on line ${entry.line} escapes ${DIAGRAM_ROOT}: ${entry.value}`);
      }
    }
    // Acorn decodes escaped identifiers, closing gaps in text-only scans.
    walk(ast, node => {
      if (node?.type === 'Identifier' && ['require', 'eval', 'fetch', 'WebSocket', 'XMLHttpRequest', 'process', 'globalThis'].includes(node.name) && !new RegExp(`\\b${node.name}\\b`, 'u').test(content.slice(node.start, node.end))) report(id, `Forbidden escaped identifier: ${node.name}.`);
      if (node?.type === 'ImportExpression' && !/\bimport\s*\(/u.test(content)) report(id, 'Forbidden dynamic import().');
      if (node?.type === 'NewExpression' && node.callee?.name === 'Function' && !/\bnew\s+Function\b/u.test(content)) report(id, 'Forbidden new Function.');
      if (node?.type === 'MemberExpression' && ['process', 'globalThis'].includes(node.object?.name)
        && !new RegExp(`\\b${node.object.name}\\s*(?:\\?\\.)?\\s*[.\\[]`, 'u').test(content.slice(node.start, node.end))) report(id, `Forbidden ${node.object.name} member access.`);
    });
  }
  return flags;
}

function exportedReferences(module) {
  if (Array.isArray(module.default) && module.default.every(ref => ref?.spec?.diagram)) return module.default;
  return Object.values(module).find(value => Array.isArray(value) && value.length && value.every(ref => ref?.id && ref?.spec?.diagram)) ?? [];
}

function overlayMap(module, fallback = false) {
  if ('overlays' in module) return module.overlays;
  const named = Object.entries(module).find(([key]) => /overlays/iu.test(key));
  if (named) return named[1];
  if ('default' in module && !Array.isArray(module.default)) return module.default;
  return fallback ? Object.values(module).find(value => value && typeof value === 'object' && !Array.isArray(value)) ?? {} : {};
}

/** Static checks complete before any candidate import. Existing dependencies outside the
 * authored manifest/same-lesson closure are trusted; stage 03 supplies its full files manifest.
 * This is rule-11 validation, not a JavaScript sandbox: execute lesson tests under §6b. */
export async function lintModule(modulePath, options = {}) {
  const root = path.resolve(options.repoRoot ?? fileURLToPath(new URL('../../../', import.meta.url)));
  const absolute = path.resolve(root, modulePath);
  const inferred = path.basename(absolute).match(/^(?:topic|lesson)-(.+?)-(?:references|overlays)\.[cm]?js$/u)?.[1];
  const topic = options.topic ?? options.slug ?? inferred;
  const prefix = path.basename(absolute).startsWith('lesson-') ? 'lesson' : 'topic';
  const authoredMode = Boolean(options.authored) || /^topic-.+-overlays\.[cm]?js$/u.test(path.basename(absolute));
  const registryPath = path.join(root, DIAGRAM_ROOT, 'reference-library.js');
  const files = [], visited = new Set(), inspectionFlags = [], declared = options.files ?? options.authoredFiles;
  if (declared) for (const file of declared) files.push(typeof file === 'string' ? { path: slash(path.relative(root, path.resolve(root, file))), content: await readFile(path.resolve(root, file), 'utf8') } : file);
  const declaredPaths = new Set(files.map(file => path.resolve(root, file.path)));
  async function inspect(filePath, authored) {
    const canonical = await realpath(filePath);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const content = await readFile(filePath, 'utf8');
    const declaration = files.find(file => path.resolve(root, file.path) === filePath);
    if (authored && declaration && declaration.content !== content) inspectionFlags.push(flag(declaration.path, 'source', 11, 'Declared authored content differs from the file on disk.'));
    if (authored && !declaredPaths.has(filePath)) files.push({ path: slash(path.relative(root, filePath)), content });
    let ast;
    try { ast = astFor(content); } catch { return; } // lintAuthoredFiles reports authored parse failures.
    for (const entry of importsFrom(ast)) if (/^\.\.?\//u.test(entry.value)) {
      const child = path.resolve(path.dirname(filePath), entry.value);
      if (!inside(path.join(root, DIAGRAM_ROOT), child) || !/\.[cm]?js$/u.test(child) || !existsSync(child)) continue;
      const sameTopic = topic && path.basename(child).startsWith(`${prefix}-${topic}-`);
      // Every declared authored file is checked, even behind a trusted dependency.
      await inspect(child, authoredMode && (declaredPaths.has(child) || sameTopic));
    }
  }
  try {
    await inspect(absolute, authoredMode);
    if (authoredMode) {
      const candidateTests = [absolute.replace(/\.[cm]?js$/u, '.test.mjs'), path.join(path.dirname(absolute), `${prefix}-${topic}-data.test.mjs`)];
      for (const candidate of candidateTests) if (existsSync(candidate)) await inspect(candidate, true);
    }
    if (options.overlayPath) await inspect(path.resolve(root, options.overlayPath), authoredMode);
    // Standalone overlays resolve reused IDs through the existing registry. Check any
    // declared/same-topic registry dependencies before either candidate or registry imports.
    if (authoredMode && existsSync(registryPath)) await inspect(registryPath, declaredPaths.has(registryPath));
  } catch (error) { return [flag('<module>', 'source', 11, `Cannot inspect module closure: ${error.message}`)]; }
  const staticFlags = authoredMode ? [...inspectionFlags, ...lintAuthoredFiles({ files, repoRoot: root, topic })] : [];
  if (staticFlags.some(issue => issue.severity === 'error')) return staticFlags;
  let module, overlays;
  try {
    module = await import(pathToFileURL(absolute).href);
    if (options.overlayPath) overlays = overlayMap(await import(pathToFileURL(path.resolve(root, options.overlayPath)).href), true);
    else overlays = overlayMap(module, !exportedReferences(module).length);
    if (options.overlays !== undefined) overlays = overlays && options.overlays && typeof overlays === 'object' && typeof options.overlays === 'object'
      && !Array.isArray(overlays) && !Array.isArray(options.overlays) ? { ...overlays, ...options.overlays } : options.overlays;
  } catch (error) { return [flag('<module>', 'source', 11, `Checked module could not be imported: ${error.message}`)]; }
  const ownReferences = exportedReferences(module);
  const standaloneOverlay = !ownReferences.length && (/-overlays\.[cm]?js$/u.test(absolute)
    || 'overlays' in module || 'default' in module || Object.keys(module).some(key => /overlays/iu.test(key))
    || Object.values(overlays ?? {}).some(value => value && typeof value === 'object' && ('prompts' in value || 'keywords' in value)));
  const hasOverlays = standaloneOverlay || overlays === null || Array.isArray(overlays) || Object.keys(overlays ?? {}).length > 0;
  let baseReferences = options.references ?? options.baseReferences ?? ownReferences;
  if (hasOverlays && !options.references && !options.baseReferences && (standaloneOverlay || existsSync(registryPath))
    && (standaloneOverlay || Object.keys(overlays ?? {}).some(id => !ownReferences.some(ref => ref.id === id)))) {
    try { baseReferences = (await import(pathToFileURL(registryPath).href)).diagramReferences; }
    catch (error) { return [flag('<overlays>', 'source', 11, `Cannot load the trusted reference registry: ${error.message}`)]; }
  }
  const references = [...new Map([...baseReferences, ...ownReferences].map(ref => [ref.id, ref])).values()];
  if (standaloneOverlay) return lintOverlays({ ...options, overlays, references, source: undefined });
  const views = ownReferences.map(ref => ({ ...ref, prompts: [...new Set([...(ref.prompts ?? []), ...(Array.isArray(overlays?.[ref.id]?.prompts) ? overlays[ref.id].prompts : [])])] }));
  const overlayPrompts = new Set(Object.values(overlays ?? {}).flatMap(overlay => Array.isArray(overlay?.prompts) ? overlay.prompts : []));
  const prompts = promptEntries(options.prompts).filter(entry => referenceForPrompt(entry) ? ownReferences.some(ref => ref.id === referenceForPrompt(entry))
    : !overlayPrompts.has(entry.prompt) || views.some(ref => ref.prompts.includes(entry.prompt)));
  const result = lintReferences({ ...options, references: views, prompts, source: files.length ? files : options.source, derived: module.derived });
  if (!ownReferences.length) result.push(flag('<module>', '*', 2, 'No exported reference array was found.'));
  return hasOverlays ? [...new Map([...result, ...lintOverlays({ ...options, overlays, references, source: undefined })].map(issue => [JSON.stringify(issue), issue])).values()] : result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), modulePath = args.shift();
  if (!modulePath) { console.error('Usage: node reference-linter.mjs <module path> [--authored] [--prompts file]'); process.exitCode = 1; }
  else {
    try {
      const options = { authored: args.includes('--authored') };
      for (const [switchName, key] of [['--prompts', 'prompts'], ['--collisions', 'collisions']]) {
        const index = args.indexOf(switchName);
        if (index !== -1) options[key] = JSON.parse(await readFile(args[index + 1], 'utf8'));
      }
      const flags = await lintModule(modulePath, options);
      console.log(JSON.stringify(flags, null, 2));
      if (flags.some(issue => issue.severity === 'error')) process.exitCode = 1;
    } catch (error) { console.log(JSON.stringify([flag('<module>', 'source', 11, error.message)], null, 2)); process.exitCode = 1; }
  }
}
