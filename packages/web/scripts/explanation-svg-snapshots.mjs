import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from '../src/tutor-diagrams/reference-library.js';
import kindGallery from '../src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { renderTutorDiagram } from '../src/tutor-diagrams/TutorDiagram.js';
import { usesIllustrations } from '../src/tutor-diagrams/illustration-kinds.js';
import { illustrationCases } from './illustration-previews.mjs';

const WIDTHS = Object.freeze([320, 408, 720]);
const VERSION = 1;

function* diagramCases() {
  const gallery = kindGallery.map(spec => ({ id: `shape-${spec.diagram.kind}`, spec }));
  const specs = new Map();
  for (const { id, spec } of [...diagramReferences, ...gallery]) {
    if (usesIllustrations(spec.diagram)) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid SVG export ID ${id}`);
    if (specs.has(id)) throw new Error(`Duplicate SVG export ID ${id}`);
    specs.set(id, spec);
  }
  for (const id of [...specs.keys()].sort()) {
    for (const available of WIDTHS) yield { key: `${id}/${available}`, spec: specs.get(id), available };
  }
}

function renderSvg(render, { key, spec, available }) {
  try {
    const { element, width, height } = render(spec, available);
    const svg = renderToStaticMarkup(element);
    if (!svg.startsWith('<svg ') || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('Renderer must return SVG with finite dimensions');
    }
    return { svg, fingerprint: { sha256: createHash('sha256').update(svg).digest('hex'), width, height } };
  } catch (error) {
    throw new Error(`Could not render ${key}`, { cause: error });
  }
}

export function captureSvgSnapshots() {
  const entries = {};
  for (const example of [...diagramCases(), ...illustrationCases()]) {
    entries[example.key] = renderSvg(renderTutorDiagram, example).fingerprint;
  }
  return { version: VERSION, widths: WIDTHS, entries };
}

function writeOutput(root, path, contents) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function svgDiff(temp, beforePath, afterPath, beforeSvg, afterSvg) {
  // Split adjacent tags for readable hunks. Keep the raw text if the only change is whitespace at a tag boundary.
  const beforeLines = beforeSvg.replaceAll('><', '>\n<');
  const afterLines = afterSvg.replaceAll('><', '>\n<');
  const format = beforeLines !== afterLines;
  writeOutput(temp, beforePath, format ? `${beforeLines}\n` : beforeSvg);
  writeOutput(temp, afterPath, format ? `${afterLines}\n` : afterSvg);
  const result = spawnSync('git', [
    '--no-pager', '-c', 'core.autocrlf=false', 'diff', '--no-index', '--text', '--no-prefix',
    '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--diff-algorithm=myers',
    '--no-indent-heuristic', '--full-index', '--unified=3', '--', beforePath, afterPath,
  ], { cwd: temp, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 1 || !result.stdout) throw new Error(`Git could not diff ${beforePath}\n${result.stderr}`);
  return result.stdout;
}

async function main(args) {
  const { values: { before, out } } = parseArgs({ args, options: { before: { type: 'string' }, out: { type: 'string' } } });
  if (!before || !out) throw new Error('Usage: node packages/web/scripts/explanation-svg-snapshots.mjs --before <worktree> --out <empty-directory>');
  const baseline = pathToFileURL(resolve(before, 'packages/web/src/tutor-diagrams/TutorDiagram.js')).href;
  const { renderTutorDiagram: renderBefore } = await import(baseline);
  if (typeof renderBefore !== 'function') throw new Error('Baseline module must export renderTutorDiagram');
  const output = resolve(out);
  mkdirSync(output, { recursive: true });
  if (readdirSync(output).length) throw new Error(`SVG export directory must be empty (${output})`);

  const entries = {};
  let changed = 0;
  const temp = mkdtempSync(join(tmpdir(), 'tutor-svg-diffs-'));
  try {
    for (const example of diagramCases()) {
      const { key, spec } = example;
      const previous = renderSvg(renderBefore, example);
      const current = renderSvg(renderTutorDiagram, example);
      const beforePath = `before/${key}.svg`;
      const afterPath = `after/${key}.svg`;
      writeOutput(output, beforePath, previous.svg);
      writeOutput(output, afterPath, current.svg);
      let diff = null;
      if (previous.svg !== current.svg) {
        diff = `diff/${key}.diff`;
        writeOutput(output, diff, svgDiff(temp, beforePath, afterPath, previous.svg, current.svg));
        changed++;
      }
      entries[key] = {
        kind: spec.diagram.kind,
        before: { path: beforePath, ...previous.fingerprint },
        after: { path: afterPath, ...current.fingerprint },
        diff,
      };
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  const pairs = Object.keys(entries).length;
  writeOutput(output, 'manifest.json', JSON.stringify({ version: VERSION, widths: WIDTHS, pairs, changed, entries }, null, 2) + '\n');
  console.log(`Exported ${pairs} SVG pairs (${changed} changed) to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
