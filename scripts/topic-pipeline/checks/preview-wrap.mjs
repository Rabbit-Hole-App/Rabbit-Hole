// Linter rule 12 (owner via reviewer, 2026-11-12): a text line in a preview that ends inside a word is an error. The live card showed
// "Predicte / d positive". The renderer breaks a word that is wider than its box; this finds such breaks in the 408, natural and 960 previews.
// A line ends inside a word when its last token is a proper prefix of a word of the label that the next line continues.
// Breaks after a hyphen or a colon are the renderer's own legitimate break points and are not flagged.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const WIDTHS = ['408', 'natural', '960'];
const decode = text => text.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&amp;/gu, '&');
const strip = token => token.replace(/^[("'[]+|[)"'\].,;!?]+$/gu, '');

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(item => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => strings(item, out));
  return out;
}

// The words a label can contain, from every string of the spec.
export const specWords = spec => new Set(strings(spec).flatMap(text => text.split(/\s+/u)).map(strip).filter(word => word.length >= 3));

// Lines of every <text> element: its <tspan> contents in order.
export function textLines(svg) {
  const blocks = [];
  for (const match of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gu)) {
    const lines = [...match[1].matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/gu)].map(tspan => decode(tspan[1].replace(/<[^>]+>/gu, '')).trim()).filter(Boolean);
    if (lines.length > 1) blocks.push(lines);
  }
  return blocks;
}

export function brokenWords(lines, words) {
  const found = [];
  for (let index = 0; index + 1 < lines.length; index++) {
    const lastRaw = lines[index].split(/\s+/u).at(-1), firstRaw = lines[index + 1].split(/\s+/u)[0];
    if (/[-‐:]$/u.test(lastRaw)) continue;
    const last = strip(lastRaw), first = strip(firstRaw);
    if (!last || !first) continue;
    const word = [...words].find(candidate => candidate.length > last.length && candidate.startsWith(last) && candidate.slice(last.length).startsWith(first));
    if (word) found.push({ before: lines[index], after: lines[index + 1], word });
  }
  return found;
}

const depthOf = id => id.match(/-(brief|balanced|detailed)(?:-detail)?$/u)?.[1] ?? (/-detail$/u.test(id) ? 'detailed' : 'balanced');

/** Rule 12 over a preview directory: one folder per reference id (with spec.json and the 408/natural/960 SVGs). ids limits the folders checked. */
export async function lintPreviewWrap({ previewDir, ids }) {
  const flags = [];
  for (const entry of (await readdir(previewDir, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ids && !ids.some(id => entry.name === id || entry.name.startsWith(`${id}-`))) continue;
    const directory = join(previewDir, entry.name);
    let words;
    try { words = specWords(JSON.parse(await readFile(join(directory, 'spec.json'), 'utf8'))); } catch { continue; }
    for (const width of WIDTHS) {
      let svg;
      try { svg = await readFile(join(directory, `${width}.svg`), 'utf8'); } catch { continue; }
      for (const block of textLines(svg)) for (const hit of brokenWords(block, words)) {
        flags.push({ id: entry.name, depth: depthOf(entry.name), rule: 12, width, severity: 'error',
          detail: `A label is broken inside the word "${hit.word}" at width ${width}: "${hit.before}" / "${hit.after}". Wrap only at spaces: shorten the label or use a wider element.` });
      }
    }
  }
  return flags;
}
