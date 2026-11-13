import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, parseExpressionAt } from 'acorn';

const WIDTH = 408;
// These are renderer-visible strings. Numbers in coordinate/value data are not
// numeric claims in prose; the topic's arithmetic tests cover those separately.
const textField = key => /(?:title|caption|label)$/i.test(key) ||
  ['heading', 'detail', 'columns', 'cells', 'categories', 'class', 'text', 'unit'].includes(key);
const numbersIn = text => text.matchAll(/[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[+\-]?\d+)?|[+\-−]?\.\d+(?:e[+\-]?\d+)?/gi);
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exists = async path => { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

function previewIdentity(id, referenceIds) {
  const referenceId = referenceIds.find(base => id === base || new RegExp(`^${escapeRegExp(base)}-(?:(?:brief|balanced|detailed)(?:-detail)?|detail)$`).test(id));
  const base = referenceId ?? id.replace(/-(?:brief|balanced|detailed)(?:-detail)?$|-detail$/, '');
  const suffix = id.slice(base.length);
  return { referenceId: base, depth: suffix.startsWith('-brief') ? 'brief' : suffix.startsWith('-detailed') ? 'detailed' : 'balanced', detail: suffix.endsWith('-detail') };
}

function displayStrings(specText) {
  const ast = parseExpressionAt(specText, 0, { ecmaVersion: 'latest', locations: true });
  const strings = [];
  const walk = (node, field, visible = false) => {
    if (node.type === 'ObjectExpression') {
      for (const property of node.properties) {
        const key = String(property.key.value ?? property.key.name);
        walk(property.value, field ? `${field}.${key}` : key, textField(key));
      }
    } else if (node.type === 'ArrayExpression') {
      node.elements.forEach((element, index) => walk(element, `${field}[${index}]`, visible));
    } else if (visible && node.type === 'Literal' && typeof node.value === 'string') {
      strings.push({ field, text: node.value, line: node.loc.start.line, column: node.loc.start.column + 1 });
    }
  };
  walk(ast, '');
  return strings;
}

async function sourceTemplates(sourceFiles) {
  const candidates = [];
  for (const source of sourceFiles) {
    const file = resolve(source), code = await readFile(file, 'utf8');
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    const walk = (node, semanticKey) => {
      if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
      if (node.type === 'Property') {
        const key = node.key.name ?? node.key.value;
        walk(node.value, textField(String(key)) ? String(key) : undefined);
        return;
      }
      if (node.type === 'Literal' && typeof node.value === 'string' && node.value.length) {
        candidates.push({ file, line: node.loc.start.line, column: node.loc.start.column + 1, semanticKey, literal: node.value, specificity: node.value.length });
      } else if (node.type === 'TemplateLiteral') {
        const parts = node.quasis.map(part => part.value.cooked ?? part.value.raw);
        const specificity = parts.reduce((sum, part) => sum + part.length, 0);
        if (specificity >= 3) candidates.push({
          file, line: node.loc.start.line, column: node.loc.start.column + 1, semanticKey,
          pattern: new RegExp(parts.map(escapeRegExp).join('[\\s\\S]*')), specificity,
        });
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'loc') continue;
        if (Array.isArray(value)) value.forEach(child => walk(child, semanticKey));
        else if (value && typeof value === 'object') walk(value, semanticKey);
      }
    };
    walk(ast);
  }
  return candidates;
}

function findSource(candidates, field, text, index, length) {
  const key = field.replace(/\[\d+\]/g, '').split('.').at(-1);
  const matches = [];
  for (const candidate of candidates) {
    // Short anonymous strings (e.g. an ID or a data value) cannot establish the
    // provenance of a generated label merely because their digits coincide.
    if (candidate.semanticKey !== key && (candidate.semanticKey || candidate.specificity < 12)) continue;
    const match = candidate.literal !== undefined
      ? { index: text.indexOf(candidate.literal), length: candidate.literal.length }
      : (() => { const result = candidate.pattern.exec(text); return result && { index: result.index, length: result[0].length }; })();
    if (!match || match.index < 0 || index < match.index || index + length > match.index + match.length) continue;
    matches.push({ ...candidate, score: candidate.specificity + (candidate.semanticKey === key ? 1000 : 0) + (match.length === text.length ? 100 : 0) });
  }
  matches.sort((a, b) => b.score - a.score);
  const best = matches.filter(candidate => candidate.score === matches[0]?.score);
  const locations = new Map(best.map(candidate => [`${candidate.file}:${candidate.line}:${candidate.column}`, candidate]));
  return locations.size === 1 ? [...locations.values()][0] : null;
}

function headerSvg(id, depth, width, height) {
  const escape = text => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="8" y="17" font-family="sans-serif" font-size="12" fill="#202938">${escape(id)}</text><text x="8" y="34" font-family="sans-serif" font-size="11" fill="#536171">${depth} · ${WIDTH}px</text></svg>`);
}

/** Compose existing illustration-previews output; never reimplement its renderer. */
export async function createContactSheet({ previewDir, outDir, sourceFiles = [], references } = {}) {
  if (!previewDir || !outDir) throw new Error('createContactSheet requires previewDir and outDir');
  const root = resolve(previewDir), output = resolve(outDir);
  const referenceIds = references?.map(reference => typeof reference === 'string' ? reference : reference.id);
  if (referenceIds?.some(id => typeof id !== 'string' || !id)) throw new Error('references must contain IDs or reference objects with an id');
  const directories = await exists(join(root, 'spec.json')) ? [{ name: basename(root), path: root }]
    : (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name, path: join(root, entry.name) }));
  const previews = [];
  for (const entry of directories) {
    const identity = previewIdentity(entry.name, referenceIds ?? []);
    if (referenceIds && !referenceIds.includes(identity.referenceId)) continue;
    const specFile = join(entry.path, 'spec.json'), svgFile = join(entry.path, '408.svg');
    if (!await exists(specFile)) continue;
    if (!await exists(svgFile)) throw new Error(`Missing exporter preview: ${svgFile}`);
    const specText = await readFile(specFile, 'utf8');
    JSON.parse(specText);
    previews.push({ id: entry.name, ...identity, specFile, svgFile, strings: displayStrings(specText) });
  }
  const levels = { brief: 0, balanced: 1, detailed: 2 };
  previews.sort((a, b) => a.referenceId.localeCompare(b.referenceId) || levels[a.depth] - levels[b.depth] || Number(a.detail) - Number(b.detail));
  if (!previews.length) throw new Error(`No exported spec.json + 408.svg previews found in ${root}`);
  if (referenceIds) {
    const missing = referenceIds.filter(id => !previews.some(preview => preview.referenceId === id));
    if (missing.length) throw new Error(`No exported previews for reference IDs: ${missing.join(', ')}`);
  }
  const templates = await sourceTemplates(sourceFiles), numbers = [];
  for (const preview of previews) {
    for (const string of preview.strings) {
      for (const match of numbersIn(string.text)) {
        const source = findSource(templates, string.field, string.text, match.index, match[0].length);
        numbers.push({
          id: preview.id, referenceId: preview.referenceId, depth: preview.depth, field: string.field,
          literal: match[0], value: Number(match[0].replaceAll(',', '').replace('−', '-')),
          text: string.text, start: match.index, end: match.index + match[0].length,
          sourceKind: source ? 'javascript' : 'preview-spec',
          sourceFile: source?.file ?? preview.specFile, sourceLine: source?.line ?? string.line, sourceColumn: source?.column ?? string.column,
          specFile: preview.specFile, specLine: string.line, specColumn: string.column,
        });
      }
    }
  }
  const { default: sharp } = await import('sharp');
  const rasters = [];
  for (const preview of previews) {
    const { data, info } = await sharp(await readFile(preview.svgFile)).resize({ width: WIDTH }).png().toBuffer({ resolveWithObject: true });
    rasters.push({ data, height: info.height });
  }
  const columns = Math.min(3, previews.length), padding = 16, headerHeight = 44, cellWidth = WIDTH + padding * 2;
  const composites = [];
  let top = padding;
  for (let index = 0; index < previews.length; index += columns) {
    const row = rasters.slice(index, index + columns);
    for (let column = 0; column < row.length; column++) {
      const left = column * cellWidth + padding, preview = previews[index + column];
      composites.push({ input: headerSvg(preview.id, preview.depth, WIDTH, headerHeight), top, left });
      composites.push({ input: row[column].data, top: top + headerHeight, left });
    }
    top += headerHeight + Math.max(...row.map(raster => raster.height)) + padding;
  }
  await mkdir(output, { recursive: true });
  const contactSheetPath = join(output, 'contact-sheet.png'), numbersPath = join(output, 'numbers.json');
  await sharp({ create: { width: columns * cellWidth, height: top, channels: 4, background: '#ffffff' } }).composite(composites).png().toFile(contactSheetPath);
  await writeFile(numbersPath, JSON.stringify({ version: 1, width: WIDTH, previews: previews.map(({ strings, ...preview }) => preview), numbers }, null, 2) + '\n');
  return { contactSheetPath, numbersPath, previewCount: previews.length, numberCount: numbers.length };
}

async function main(args) {
  let input, previewDir, outDir, configFile;
  const sourceFiles = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--out') outDir = args[++index];
    else if (arg === '--previews') previewDir = args[++index];
    else if (arg === '--source') sourceFiles.push(args[++index]);
    else if (arg === '--config') configFile = args[++index];
    else if (!arg.startsWith('-') && !input) input = arg;
    else throw new Error(`Unknown contact-sheet argument: ${arg}`);
  }
  if (!input || !outDir) throw new Error('Usage: node checks/contact-sheet.mjs <preview-directory|reference-module.js> --out <directory> [--previews <directory>] [--source <file.js>] [--config <config.local.json>]');
  let repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  if (configFile) {
    const { loadConfig } = await import('../config.mjs');
    const config = await loadConfig(configFile);
    repoRoot = config.repo.root;
  }
  let references;
  if (['.js', '.mjs'].includes(extname(input))) {
    const modulePath = resolve(input), module = await import(pathToFileURL(modulePath).href);
    references = [...new Map(Object.values(module).filter(Array.isArray).flat().filter(value => value?.id && value?.spec).map(reference => [reference.id, reference])).values()];
    if (!references.length) throw new Error(`No exported reference array in ${modulePath}`);
    sourceFiles.unshift(modulePath);
    previewDir ??= join(repoRoot, 'docs/features/explain-on-canvas/handoff/phase02-library/illustrations');
  } else previewDir ??= input;
  const result = await createContactSheet({ previewDir, outDir, references, sourceFiles });
  console.log(JSON.stringify({ previewCount: result.previewCount, numberCount: result.numberCount }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Contact sheet failed. Check the configured previews and sources.'); process.exitCode = 1; });
}
