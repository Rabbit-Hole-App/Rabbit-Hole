import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// The accepted C01 SVG and HTML provide the exact sheet shell, CSS and fonts.
// Raw renderer SVG/spec assets are saved unchanged. Only hosted foreignObjects
// receive the XHTML namespace needed when they are placed inside an SVG file.
const [repoArg, idsArg, outArg, templateArg] = process.argv.slice(2);
if (!templateArg) throw new Error('Usage: node render-evidence.mjs REPO IDS_JSON OUTPUT C01_TEMPLATE_DIRECTORY');
const repo = resolve(repoArg), output = resolve(outArg), idsPath = resolve(idsArg), template = resolve(templateArg);
const ids = JSON.parse(await readFile(idsPath, 'utf8'));
const require = createRequire(join(repo, 'packages/web/package.json'));
const { renderToStaticMarkup } = require('react-dom/server');
const { diagramReferences } = await import(pathToFileURL(join(repo, 'packages/web/src/tutor-diagrams/reference-library.js')));
const { singleDiagramReferences } = await import(pathToFileURL(join(repo, 'packages/web/src/tutor-diagrams/reference-single-variants.js')));
const { renderTutorDiagram } = await import(pathToFileURL(join(repo, 'packages/web/src/tutor-diagrams/TutorDiagram.js')));
const templateSvg = await readFile(join(template, 'contact-sheet.svg'), 'utf8');
const templateHtml = await readFile(join(template, 'index.html'), 'utf8');
const svgStyle = templateSvg.match(/<style><!\[CDATA\[([\s\S]*?)\]\]><\/style>/)[1];
const htmlStyle = templateHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
const sha = value => createHash('sha256').update(value).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const artifacts = [];
const save = async (path, value) => {
  const bytes = Buffer.from(value);
  await mkdir(dirname(join(output, path)), { recursive: true });
  await writeFile(join(output, path), bytes);
  const item = { path, bytes: bytes.length, sha256: sha(bytes) };
  artifacts.push(item);
  return item;
};
const saveJson = (path, value) => save(path, JSON.stringify(value, null, 2) + '\n');
const references = [], rows = [], vectorRows = [], htmlRows = [];
let top = 96;
for (const id of ids) {
  const reference = diagramReferences.find(ref => ref.id === id);
  if (!reference) throw new Error('Missing reference: ' + id);
  const single = singleDiagramReferences.find(ref => ref.panelReferenceId === id);
  const source = await saveJson(`raw/${id}/reference.json`, reference);
  const entry = { id, sourceReference: source.path, sourceReferenceSha256: source.sha256, linkedSingleId: single?.id ?? null, views: [] };
  const views = [];
  for (const depth of ['overview', 'standard', 'deep']) {
    const item = reference.depths?.[depth];
    if (!item?.spec) throw new Error(`${id} has no ${depth} spec`);
    views.push({ depth, role: 'main', spec: item.spec, source: `depths.${depth}.spec` });
    if (item.detailSpec) views.push({ depth, role: 'detail', spec: item.detailSpec, source: `depths.${depth}.detailSpec` });
  }
  if (single) views.push({ depth: 'author', role: 'single', spec: single.spec, source: `singleDiagramReferences.${single.id}.spec` });
  for (const view of views) {
    const name = `${view.depth}-${view.role}`, key = `${id}--${name}`;
    const specFile = await saveJson(`raw/${id}/${name}.json`, view.spec);
    const metadata = { key, depth: view.depth, role: view.role, kind: view.spec.diagram.kind,
      source: view.source, spec: specFile.path, specSha256: specFile.sha256, renders: [] };
    const heading = `${id} · ${view.depth[0].toUpperCase() + view.depth.slice(1)} · ${view.role}`;
    const columns = [], svgColumns = [];
    for (const [index, requestedWidth] of [408, 720].entries()) {
      const result = renderTutorDiagram(view.spec, requestedWidth);
      const raw = renderToStaticMarkup(result.element);
      const file = await save(`raw/${id}/${name}-${requestedWidth}.svg`, raw);
      const scale = Math.min(1, requestedWidth / result.width), frameHeight = Math.ceil(result.height * scale);
      let annotations = 0;
      const hosted = raw.replace(/(<foreignObject\b[^>]*>\s*<div)(?![^>]*\bxmlns=)/g, match => {
        annotations++;
        return match + ' xmlns="http://www.w3.org/1999/xhtml"';
      });
      const left = index === 0 ? 29 : 461, svgTop = top + 63;
      const label = `${requestedWidth} px · native ${result.width} × ${result.height} · scale ${scale.toFixed(4)}`;
      const render = { requestedWidth, naturalWidth: result.width, naturalHeight: result.height, scale,
        displayWidth: result.width * scale, displayHeight: result.height * scale, frameHeight,
        svg: file.path, svgSha256: file.sha256,
        vector: { left, top: svgTop, nativeViewportFullyInsideRow: true, xhtmlNamespaceAnnotations: annotations,
          foreignObjects: (raw.match(/<foreignObject\b/g) ?? []).length,
          katexSpans: (raw.match(/class="katex"/g) ?? []).length } };
      metadata.renders.push(render);
      svgColumns.push(`<text x="${left}" y="${top + 52}" font-size="11" font-weight="500" fill="#32211C">${escape(label)}</text><g transform="translate(${left} ${svgTop}) scale(${scale})" data-requested-width="${requestedWidth}">${hosted}</g>`);
      columns.push(`<section class="column" data-requested="${requestedWidth}"><p class="column-label">${escape(label)}</p><div class="frame" style="width:${requestedWidth}px;height:${frameHeight}px"><div class="natural" style="width:${result.width}px;height:${result.height}px;transform:scale(${scale})">${raw}</div></div><p class="links"><a href="${file.path}">Raw SVG</a> · <a href="${specFile.path}">Exact spec JSON</a></p></section>`);
    }
    const height = Math.max(...metadata.renders.map(r => r.frameHeight)) + 76;
    rows.push({ key, left: 16, top, width: 1178, height });
    vectorRows.push(`<g data-evidence-row="${key}"><rect x="16.5" y="${top + 0.5}" width="1177" height="${height - 1}" fill="#FFFCF0" stroke="#32211C"/><text x="29" y="${top + 29}" font-size="14" font-weight="700" fill="#32211C">${escape(heading)}</text>\n${svgColumns.join('\n')}</g>`);
    htmlRows.push(`<article class="evidence-row" id="${key}"><h2>${escape(heading)}</h2><div class="columns">${columns.join('')}</div></article>`);
    top += height + 12;
    entry.views.push(metadata);
  }
  references.push(entry);
}
const width = 1210, height = top + 4;
const heading = 'Rebased diagram evidence · 408 / 720 px';
const subheading = `${ids.length} references · Overview / Standard / Deep main and detail views, plus linked author singles.`;
const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rebased diagram contact sheet at 408 and 720 pixels" font-family="Inter,Arial,sans-serif"><title>${heading}</title><desc>Actual production renderer output, preserved as nested SVGs. Vector evidence; browser raster and foreignObject formula appearance have not been visually verified.</desc><style><![CDATA[${svgStyle}]]></style><rect width="${width}" height="${height}" fill="#FFFCF0"/><text x="16" y="36" font-size="20" font-weight="700" fill="#32211C">${heading}</text><text x="16" y="56" font-size="12" fill="#32211C">${subheading}</text><text x="16" y="74" font-size="12" fill="#32211C">Production SVG output; native viewports scale to fit. Browser raster and formula appearance remain unverified.</text>${vectorRows.join('')}</svg>\n`;
await save('index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';font-src data:;img-src data:;base-uri 'none';form-action 'none'"><title>Rebased diagram evidence</title><style>${htmlStyle}</style></head><body><main class="sheet"><header class="sheet-header"><h1>${heading}</h1><p>${subheading}</p><p>Production renderTutorDiagram output. Native SVGs are scaled to fit their column when needed; dimensions and scale are recorded below and in manifest.json.</p></header>\n${htmlRows.join('\n')}</main></body></html>\n`);
const sheet = await save('contact-sheet.svg', svg);
const manifest = { formatVersion: 1, status: 'rendered-vector', generator: 'render-evidence.mjs', repo,
  ref: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), ids,
  inputs: { ids: { path: idsPath, sha256: sha(await readFile(idsPath)) },
    approvedC01Sheet: { sha256: sha(templateSvg) }, approvedC01Html: { sha256: sha(templateHtml) } },
  renderer: { module: 'packages/web/src/tutor-diagrams/TutorDiagram.js', export: 'renderTutorDiagram',
    react: require('react/package.json').version, widths: [408, 720],
    rawSvg: 'Unmodified renderToStaticMarkup(element) bytes; no stylesheet injection or dimension edits.',
    rawSpec: 'Unmodified source payload serialized as indented JSON with one trailing newline.' },
  vector: { engine: 'Production renderTutorDiagram SVG composition', offline: true,
    layout: 'Accepted C01: 1210px sheet; 408px / 720px columns with 24px gap; 12px row gaps; native viewports uniformly scaled without cropping.',
    fonts: { inter: 'Embedded Inter Latin variable WOFF2', katex: 'Production katex.min.css with all WOFF2 faces embedded', embeddedKatexFaces: 20 },
    scalePolicy: 'min(1, requestedWidth / naturalWidth)',
    namespaceHosting: 'Only missing XHTML xmlns annotations are added to hosted foreignObject div roots. Raw SVGs are untouched.',
    ground: '#FFFCF0', outline: '#32211C' },
  browserRasterVerified: false,
  contactSheet: { ...sheet, format: 'svg', width, height, rows }, references, artifacts,
  limitations: ['Deterministic offline production-renderer evidence, not live model/provider output.',
    'Vector evidence only; no browser raster or visual verification was performed. The owner rasterises the SVG sheet.'] };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, references: references.length, views: rows.length, renders: rows.length * 2, width, height, sha256: sheet.sha256 }));
