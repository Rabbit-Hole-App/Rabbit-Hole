
// A check that already carries what an adapter adds is skipped by it (the adapter returns the source unchanged), so a fix the app has
// moved into its check is neither refused as drift nor applied twice. The markers are lines the app's fixed checks contain and the
// older ones lack (fix/move-gate-adapters, 2026-10-13); they are matched after \r\n becomes \n.
export const FIXED = {
  sharedCanvas: "if (!PERSIST || !D1_CONFIG || !WRANGLER) throw Error('shared-canvas-ask-check requires gate-local PERSIST, D1_CONFIG and locked WRANGLER_BIN');",
  selectedPill: 'const safePanPoint = async (page, requested) => page.evaluate(',
  repoBrowser: "await reader.locator('[data-highlighted][data-source-line=",
};
const fixed = (source, marker) => source.replaceAll('\r\n', '\n').includes(marker);

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
  if (fixed(source, FIXED.sharedCanvas)) return source;
  if (!source.includes(D1_OLD)) throw Error('shared-canvas D1 command changed; refusing an unreviewed transformation');
  return source.replace(D1_OLD, D1_NEW);
}

const TUTOR_WAIT = "await page.getByText('Here is CausalSelfAttention.forward').first().waitFor();";
const TUTOR_NEW = `await page.waitForFunction(title => [...document.querySelectorAll('[data-block-id]:not([data-chat-block])')]
  .some(node => node.textContent?.includes(title) && node.className.includes('ring-2')), TITLE('depth-attention-deep'), { timeout: 30000 });
await page.waitForFunction(prior => window.__tutorBench?.length > prior && window.__tutorBench.at(-1)?.ms?.canvas_done != null, priorTutorBenchCount, { timeout: 30000 });
assert.ok(await page.getByText('Here is CausalSelfAttention.forward').count() <= 1, 'navigation does not duplicate narration');`;

// A canvas-only navigate turn has no reply line either (r36 routing: the card is the answer, ask.jsx returns before any
// reply is drawn); its turn completes and focuses the Deep card, and the existing no-"Thinking..." assertion stays.
const AGAIN_ASK = "await ask('Show me the implementation again.');";
const AGAIN_WAIT = "await page.getByText('See the canvas.').first().waitFor({ timeout: 5000 });";
const AGAIN_NEW = `await page.waitForFunction(prior => window.__tutorBench?.length > prior && window.__tutorBench.at(-1)?.ms?.canvas_done != null, priorAgainBenchCount, { timeout: 30000 });
await page.waitForFunction(title => [...document.querySelectorAll('[data-block-id]:not([data-chat-block])')]
  .some(node => node.textContent?.includes(title) && node.className.includes('ring-2')), TITLE('depth-attention-deep'), { timeout: 30000 });`;

export function adaptTutorSlice(source) {
  if (!source.includes(TUTOR_WAIT)) throw Error('tutor navigation wait changed; refusing an unreviewed transformation');
  const ask = 'await ask("Don\'t simplify this. Show me the implementation.");';
  if (!source.includes(ask)) throw Error('tutor navigation trigger changed; refusing an unreviewed transformation');
  if (!source.includes(AGAIN_ASK) || !source.includes(AGAIN_WAIT)) throw Error('tutor canvas-only turn changed; refusing an unreviewed transformation');
  return source.replace(ask, `const priorTutorBenchCount = await page.evaluate(() => window.__tutorBench?.length || 0);\n${ask}`).replace(TUTOR_WAIT, TUTOR_NEW)
    .replace(AGAIN_ASK, `const priorAgainBenchCount = await page.evaluate(() => window.__tutorBench?.length || 0);\n${AGAIN_ASK}`).replace(AGAIN_WAIT, AGAIN_NEW);
}

const PAN_MARKER = 'const press = async (page, kind, side = false) => {';
const PAN_HELPER = `const safePanPoint = async (page, requested) => page.evaluate(({ requested }) => {
  const blocked = '[data-block-id],[data-item-id],[data-block],[data-view-selection],[role="dialog"],[data-shared-ask],[data-learn-dock],[data-chat-pane],[data-comments-panel],[data-hooks-slot],button,a,iframe';
  for (let y = 120; y < 700; y += 40) for (let x = 360; x < 1400; x += 40) {
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest('[data-canvas-surface]') && !hit.closest(blocked)) return { x, y };
  }
  const requestedBounds = requested.bounds;
  const hit = document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2))?.closest?.('[data-canvas-surface], [data-learn-dock], [data-chat-pane], [data-comments-panel], [role="dialog"]')?.outerHTML?.slice(0, 240) || null;
  throw new Error(\`no safe canvas pan point for \${JSON.stringify({ requested, requestedBounds })}; hit=\${hit}\`);
}, { requested });
const intendedSelectionPoint = async (page, kind, box, side) => page.evaluate(({ id, item, box, side }) => {
  const target = document.querySelector(item ? \`[data-item-id="\${id}"]\` : \`[data-block-id="\${id}"]\`);
  if (!target) return null;
  const handle = item ? null : target.querySelector('[data-drag-handle]');
  const hr = handle?.getBoundingClientRect();
  // Use rendered geometry: the 24px strip is only 4.8 screen pixels tall at 20% zoom.
  // A fixed y+8 can hit a notebook action which stops pointer propagation instead of selecting.
  const points = !item && hr?.width > 0 && hr?.height > 0
    ? (side ? [0.3, 0.7, 0.5] : [0.5, 0.3, 0.7]).map(fraction => ({ x: hr.left + hr.width * fraction, y: hr.top + hr.height / 2 }))
    : [{ x: side && !item ? box.x + 40 : box.x + box.width / 2, y: item ? box.y + box.height / 2 : box.y + 8 }];
  const controls = 'button,a,input,textarea,select,[role="button"],[contenteditable="true"],iframe,[data-port]';
  const covered = '[data-block-id],[data-item-id],[role="dialog"],[data-shared-ask],[data-learn-dock],[data-chat-pane],[data-comments-panel],[data-hooks-slot]';
  const r = target.getBoundingClientRect();
  for (const { x, y } of points) {
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit.closest(controls)) continue;
    if ((hit === target || target.contains(hit)) && (item || !handle || hit.closest('[data-drag-handle]') === handle)) return { x, y };
    // A view-only board (the hand tool) gives its cards and notes no pointer events and selects by the press point
    // (AdaptiveCanvas): there the point is the bare canvas surface inside the target's rectangle, under no panel.
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (inside && hit.closest('[data-canvas-surface]') && !hit.closest(covered)) return { x, y };
  }
  return null;
}, { id: kind.id, item: Boolean(kind.item), box, side });
`;

export function adaptSelectedPill(source) {
  if (fixed(source, FIXED.selectedPill)) return source;
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
  // A view-only board's cards and notes take no pointer events, so elementFromPoint calls a point on a card bare canvas
  // and the "blank" click selected that card (run 38343974325). A blank point is also outside every card and note box.
  // The blank point keeps clear of the main composer: the canvas dock (r38) or, since the chat workspace (A3b 8fa30fcd), the Chat pane.
  const bare = ['[data-learn-dock]', '[data-chat-pane]'].map(composer => `      if (element?.closest('[data-canvas-surface]') && !element.closest('[data-block-id],[data-item-id],[data-block],[data-view-selection],[role="dialog"],[data-shared-ask],${composer},button,a,iframe')) return { x, y };`).find(line => out.includes(line));
  if (!bare) throw Error('selected-pill blank point changed; refusing an unreviewed transformation');
  out = out.replace(bare, `      const onObject = [...document.querySelectorAll('[data-block-id],[data-item-id]')].some(node => { const r = node.getBoundingClientRect(); return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8; });
${bare.replace('if (element', 'if (!onObject && element')}`);
  return out;
}

// Gate 38348435978: Graph -> Files read the highlight before the reader loaded (the screenshot shows line 29 lit).
export function adaptRepoBrowser(source) {
  if (fixed(source, FIXED.repoBrowser)) return source;
  source = source.replaceAll('\r\n', '\n');
  const pattern = /^(\s*)(assert\.deepEqual\(await lit\(\), \[(\d+)[^\n]*)$/gm;
  const found = [...source.matchAll(pattern)].length;
  if (!source.includes("const lit = () => reader.locator('[data-highlighted]')") || found < 6) throw Error('repo-browser highlight checks changed; refusing an unreviewed transformation');
  return source.replace(pattern, (_, indent, assertion, line) =>
    `${indent}await reader.locator('[data-highlighted][data-source-line="${line}"]').first().waitFor({ timeout: 10000 }).catch(() => {});\n${indent}${assertion}`);
}

export function adaptAll({ shared, tutor, selected }) {
  return { shared: adaptSharedCanvas(shared), tutor: adaptTutorSlice(tutor), selected: adaptSelectedPill(selected) };
}
