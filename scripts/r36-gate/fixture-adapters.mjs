
const D1_OLD = "const d1 = sql => execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to .small/fork-local -c packages/web/wrangler.dev.jsonc --command \"${sql}\"`, { cwd: ROOT, shell: true, stdio: 'ignore' });";
const D1_NEW = `const PERSIST = process.env.PERSIST;
const D1_CONFIG = process.env.D1_CONFIG;
const WRANGLER = process.env.WRANGLER_BIN;
if (!PERSIST || !D1_CONFIG || !WRANGLER) throw Error('shared-canvas-ask-check requires gate-local PERSIST, D1_CONFIG and locked WRANGLER_BIN');
const d1 = sql => {
  const result = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'rabbit-hole-learn-dev', '--local', '--persist-to', PERSIST, '--config', D1_CONFIG, '--command', sql], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return result;
};`;

export function adaptSharedCanvas(source) {
  if (!source.includes(D1_OLD)) throw Error('shared-canvas D1 command changed; refusing an unreviewed transformation');
  return source.replace(D1_OLD, D1_NEW);
}

const TUTOR_WAIT = "await page.getByText('Here is CausalSelfAttention.forward').first().waitFor();";
const TUTOR_NEW = `await page.waitForFunction(title => [...document.querySelectorAll('[data-block-id]:not([data-chat-block])')]
  .some(node => node.textContent?.includes(title) && node.className.includes('ring-2')), TITLE('depth-attention-deep'), { timeout: 30000 });
await page.waitForFunction(prior => window.__tutorBench?.length > prior && window.__tutorBench.at(-1)?.ms?.canvas_done != null, priorTutorBenchCount, { timeout: 30000 });
assert.equal(await page.getByText('Here is CausalSelfAttention.forward').count(), 0, 'navigation does not duplicate narration');`;

export function adaptTutorSlice(source) {
  if (!source.includes(TUTOR_WAIT)) throw Error('tutor navigation wait changed; refusing an unreviewed transformation');
  const ask = 'await ask("Don\'t simplify this. Show me the implementation.");';
  if (!source.includes(ask)) throw Error('tutor navigation trigger changed; refusing an unreviewed transformation');
  return source.replace(ask, `const priorTutorBenchCount = await page.evaluate(() => window.__tutorBench?.length || 0);\n${ask}`).replace(TUTOR_WAIT, TUTOR_NEW);
}

const PAN_MARKER = 'const press = async (page, kind, side = false) => {';
const PAN_HELPER = `const safePanPoint = async (page, requested) => page.evaluate(({ requested }) => {
  const blocked = '[data-block-id],[data-item-id],[data-block],[data-view-selection],[role="dialog"],[data-shared-ask],[data-learn-dock],[data-comments-panel],[data-hooks-slot],button,a,iframe';
  for (let y = 120; y < 700; y += 40) for (let x = 360; x < 1400; x += 40) {
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest('[data-canvas-surface]') && !hit.closest(blocked)) return { x, y };
  }
  const requestedBounds = requested.bounds;
  const hit = document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2))?.closest?.('[data-canvas-surface], [data-learn-dock], [data-comments-panel], [role="dialog"]')?.outerHTML?.slice(0, 240) || null;
  throw new Error(\`no safe canvas pan point for \${JSON.stringify({ requested, requestedBounds })}; hit=\${hit}\`);
}, { requested });
const intendedSelectionPoint = async (page, kind, box, side) => page.evaluate(({ id, item, box, side }) => {
  const target = document.querySelector(item ? \`[data-item-id="\${id}"]\` : \`[data-block-id="\${id}"]\`);
  if (!target) return null;
  const x = side && !item ? box.x + 40 : box.x + box.width / 2;
  const y = item ? box.y + box.height / 2 : box.y + 8;
  const hit = document.elementFromPoint(x, y);
  if (hit && (hit === target || target.contains(hit))) return { x, y };
  // A view-only board (the hand tool) gives its cards and notes no pointer events and selects by the press point
  // (AdaptiveCanvas): there the point is the bare canvas surface inside the target's rectangle, under no panel.
  const r = target.getBoundingClientRect();
  const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const covered = '[data-block-id],[data-item-id],[role="dialog"],[data-shared-ask],[data-learn-dock],[data-comments-panel],[data-hooks-slot],button,a,iframe';
  return inside && hit?.closest('[data-canvas-surface]') && !hit.closest(covered) ? { x, y } : null;
}, { id: kind.id, item: Boolean(kind.item), box, side });
`;

export function adaptSelectedPill(source) {
  source = source.replaceAll('\r\n', '\n');
  if (!source.includes(PAN_MARKER) || !source.includes('await page.mouse.move(1250, 400);')) throw Error('selected-pill pan point changed; refusing an unreviewed transformation');
  const withHelper = source.replace(PAN_MARKER, `${PAN_HELPER}${PAN_MARKER}`);
  let out = withHelper.replace('await page.mouse.move(1250, 400);', "const pan = await safePanPoint(page, { kind: kind.label, bounds: box });\n    await page.mouse.move(pan.x, pan.y);");
  out = out.replace(
    'for (let i = 0; i < 12 && box && off(box); i++) {',
    "for (let i = 0; i < 12 && box && (off(box) || !(await intendedSelectionPoint(page, kind, box, side))); i++) {",
  );
  const wheel = 'await page.mouse.wheel(off({ ...box, y: 300 }) ? box.x - 600 : 0, box.y + 8 < 90 || box.y + 8 > 720 ? box.y - 300 : 0);';
  if (!out.includes(wheel)) throw Error('selected-pill wheel changed; refusing an unreviewed transformation');
  out = out.replace(wheel, `const occluded = !(await intendedSelectionPoint(page, kind, box, side));
    if (occluded) await page.mouse.wheel(box.x + box.width / 2 - 600, (kind.item ? box.y + box.height / 2 : box.y + 8) - 300);
    else ${wheel}`);
  out = out.replace(
    '  assert.ok(box, `${kind.label} is on the canvas`);\n  // side:',
    "  assert.ok(box, `${kind.label} is on the canvas`);\n  const selectionPoint = await intendedSelectionPoint(page, kind, box, side);\n  assert.ok(selectionPoint, `${kind.label} selection point is visible: ${JSON.stringify({ bounds: box, hit: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML?.slice(0, 240) || null, { x: box.x + box.width / 2, y: kind.item ? box.y + box.height / 2 : box.y + 8 }) })}`);\n  // side:",
  );
  const click = '  await page.mouse.click(side && !kind.item ? box.x + 40 : box.x + box.width / 2, kind.item ? box.y + box.height / 2 : box.y + 8);';
  if (!out.includes(click)) throw Error('selected-pill click changed; refusing an unreviewed transformation');
  out = out.replace(click, '  await page.mouse.click(selectionPoint.x, selectionPoint.y);');
  return out;
}

export function adaptAll({ shared, tutor, selected }) {
  return { shared: adaptSharedCanvas(shared), tutor: adaptTutorSlice(tutor), selected: adaptSelectedPill(selected) };
}
