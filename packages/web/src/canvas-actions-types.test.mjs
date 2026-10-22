import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPE_ACTIONS, contentText, rabbitHoleTarget } from './canvas-actions-types.js';
import { publishCodeCard } from './code-card.js';
import { registerNotebookEditor } from './notebook-inline-client.js';
import { publishView, dropView } from './cad-viewer-store.js';

// The engine's filter as contract-actions.md section 2 states it (U1 owns the real one, canvas-actions.js actionsFor).
// shortcut: a local mirror until U1's engine is on this branch; then these tests call actionsFor.
const KINDS = ['primary', 'chat', 'type', 'content', 'clipboard', 'lock', 'arrange', 'group', 'canvas', 'delete'];
function rows(target, ctx) {
  const out = [];
  for (const entry of TYPE_ACTIONS) {
    if (!entry.targets.includes(target.kind)) continue;
    const members = target.kind === 'multi' ? target.members : [target];
    if (entry.types && !members.every(member => entry.types.includes(member.type))) continue;
    if (entry.part && !entry.part.includes(target.part?.kind)) continue;
    if (target.kind === 'multi' ? entry.applies && !members.every(member => entry.applies(member, ctx)) : entry.applies && !entry.applies(target, ctx)) continue;
    const state = entry.state?.(target, ctx) || null;
    if (state?.hidden) continue;
    if (entry.mutates && ctx.readOnly) continue;
    const allowed = entry.requires ? ctx.can(entry.requires) : { allowed: true };
    if (!allowed.allowed && !allowed.signIn && (entry.denied || 'hide') === 'hide') continue;
    const reason = state?.disabled || (!allowed.allowed && !allowed.signIn ? allowed.reason : null) || (entry.mutates && ctx.locked?.(target.id) ? 'Locked' : null);
    out.push({ id: entry.id, label: typeof entry.label === 'function' ? entry.label(target, ctx) : entry.label, disabled: !!reason, reason, checked: entry.checked?.(target, ctx), run: () => entry.run(target, ctx) });
  }
  return out.sort((a, b) => KINDS.indexOf(byId(a.id).group) - KINDS.indexOf(byId(b.id).group) || byId(a.id).order - byId(b.id).order);
}
const byId = id => TYPE_ACTIONS.find(entry => entry.id === id);

// S1's rules (contract-permissions.md) for the capabilities these rows use.
const writes = role => role === 'owner' || role === 'editor';
const owned = what => role => (writes(role) ? { allowed: true } : role === 'guest' ? { allowed: false, signIn: true, reason: `Sign in to ${what}` } : { allowed: false, reason: `Fork to ${what} in your own copy` });
const RULES = {
  'canvas.view': () => ({ allowed: true }), 'canvas.local-edit': () => ({ allowed: true }), 'content.copy': () => ({ allowed: true }),
  'card.open': () => ({ allowed: true }), 'media.playback': () => ({ allowed: true }), 'chat.ask': () => ({ allowed: true }),
  'canvas.child': role => (role === 'guest' ? { allowed: false, signIn: true, reason: 'Sign in to start a Rabbit Hole' } : { allowed: true }),
  'code.execute': owned('run code'), 'webpage.capture': owned('capture webpages'),
};
const USED = new Set(Object.keys(RULES));

// Every hook a row may call, recorded; opening the menu must call none of the ones that act.
function context({ role = 'owner', readOnly = false, locked = [], job = null, attached = [], cardAction = true } = {}) {
  const calls = [];
  const act = name => (...args) => { calls.push([name, ...args]); return true; };
  const canvas = {
    appName: 'app-1', attached: id => attached.includes(id),
    cardAction: cardAction ? act('cardAction') : null, startRabbitHole: act('startRabbitHole'), presentFrom: act('presentFrom'),
    openUrl: act('openUrl'), copyText: act('copyText'), addToChat: act('addToChat'), edit: act('edit'), editEquation: act('editEquation'),
    patchItem: act('patchItem'), updateBlock: act('updateBlock'), openStyle: act('openStyle'), openInNotebook: act('openInNotebook'),
    downloadText: act('downloadText'), downloadUrl: act('downloadUrl'), downloadOriginal: act('downloadOriginal'), downloadCad: act('downloadCad'),
    insertText: act('insertText'), insertSticky: act('insertSticky'), zoomFit: act('zoomFit'),
  };
  return { role, readOnly, calls, canvas, can: capability => RULES[capability](role), locked: id => locked.includes(id), jobOf: () => job };
}
const card = (object, extra = {}) => ({ kind: 'card', family: 'block', type: object.type, id: object.id, object, ids: [object.id], part: null, point: { x: 10, y: 20 }, ...extra });
const item = object => ({ kind: 'object', family: 'item', type: object.kind, id: object.id, object, ids: [object.id], part: null, point: { x: 0, y: 0 } });
const shape = object => ({ kind: 'object', family: 'shape', type: object.kind, id: object.id, object, ids: [object.id], part: null, point: { x: 0, y: 0 } });
const connector = object => ({ kind: 'connector', family: 'link', type: 'connector', id: object.id, object, ids: [object.id], part: null, point: { x: 0, y: 0 } });
const labels = (target, ctx) => rows(target, ctx).map(row => row.label);
const run = (target, ctx, label) => { const row = rows(target, ctx).find(entry => entry.label === label); assert.ok(row, `${label} is offered`); assert.ok(!row.disabled, `${label} is enabled`); row.run(); return ctx.calls.at(-1); };

test('every row is well formed: <type>.<verb> id, a known group and capability, no ellipsis, a handler', () => {
  const ids = new Set();
  for (const entry of TYPE_ACTIONS) {
    assert.match(entry.id, /^[a-z]+\.[a-z0-9-]+$/, entry.id);
    assert.ok(!ids.has(entry.id), `${entry.id} once`); ids.add(entry.id);
    assert.ok(KINDS.includes(entry.group), `${entry.id} group`);
    assert.ok(!entry.requires || USED.has(entry.requires), `${entry.id} requires a published capability`);
    assert.equal(typeof entry.run, 'function');
    assert.ok(typeof entry.label === 'function' || !/\.\.\.|…/.test(entry.label), `${entry.id} has no ellipsis`);
    assert.ok(entry.targets.length);
  }
});

// Targets for every object type of the brief's table.
const TARGETS = () => [
  card({ id: 'e1', type: 'explanation', title: 'Tides', body: 'The moon pulls.' }),
  card({ id: 'w1', type: 'wiki', title: 'Tide', section: 2 }),
  card({ id: 'y1', type: 'video', videoId: 'abc', start: 61.5, title: 'Tides' }),
  card({ id: 'g1', type: 'video', mode: 'generate', status: 'ready', operation: { op: 'motion_render' }, src: '/v.mp4', title: 'Motion' }),
  card({ id: 'p1', type: 'paper', title: 'Attention', paper: { id: '1706.03762', page: 3 } }),
  card({ id: 'd1', type: 'pdf', assetKey: 'pdf:abc', label: 'Notes.pdf' }),
  card({ id: 's1', type: 'slide', pdf: 'pdf:abc', number: 4, assetKey: 'page:1', label: 'Notes.pdf' }),
  card({ id: 'i1', type: 'file', kind: 'image', assetKey: 'drop:1', mediaId: 'm1', label: 'cat.png' }),
  card({ id: 'a1', type: 'file', kind: 'audio', fileRef: { source: { id: 'f', rev: 1 } }, label: 'talk.mp3' }),
  card({ id: 'm1', type: 'file', kind: 'model', assetKey: 'drop:2', label: 'cube.glb' }),
  card({ id: 'c1', type: 'snippet', title: 'Loop', language: 'python', code: 'for i in range(3): print(i)' }),
  card({ id: 'x1', type: 'code', title: 'Sum', language: 'python', setup: 'n = 3', starter: 'total = 0', draft: 'total = n' }),
  card({ id: 'r1', type: 'repo-code', title: 'model.py', source: { kind: 'repository', repo: 'o/r', commit: 'c', path: 'model.py' } }),
  card({ id: 'n1', type: 'notebook', notebook_id: 'nb', ipynb_path: 'work/lesson.ipynb', ipynb: { cells: [] } }),
  card({ id: 'k1', type: 'cad', jobId: 'j', manifest: { revisionId: 'r1', artifacts: [{ kind: 'step', url: '/a.step', name: 'part.step' }, { kind: 'glb', url: '/a.glb', name: 'part.glb' }] }, revisionId: 'r1', title: 'Bracket' }),
  card({ id: 'an', type: 'animation', title: 'Pendulum', scene: {}, explain: { revision: 1 } }),
  card({ id: 'wp', type: 'webpage', url: 'https://example.com/a', title: 'Example', scrollLocked: false }),
  card({ id: 'h1', type: 'heading', title: 'Part 1' }),
  card({ id: 't1', type: 'table', title: 'Moons', columns: ['Name', 'Km'], rows: [['Io', '3643']] }),
  { kind: 'card', family: 'chat', type: 'chat', id: 'q1', object: { id: 'q1', question: 'Why?', answer: 'Because.' }, ids: ['q1'], part: null, point: { x: 0, y: 0 } },
  item({ id: 'tx', kind: 'text', text: 'Hello' }),
  item({ id: 'st', kind: 'sticky', text: 'Note' }),
  item({ id: 'cb', kind: 'text', mode: 'code', text: 'print(1)', lang: 'python' }),
  item({ id: 'eq', kind: 'equation', latex: 'e^{i\\pi}+1=0' }),
  shape({ id: 'sh', kind: 'rect' }),
  shape({ id: 'ar', kind: 'arrow' }),
  connector({ id: 'ln', from: 'a', to: 'b' }),
  { kind: 'canvas', family: null, type: null, id: null, object: null, ids: [], part: null, point: { x: 120, y: 80 } },
];

test('opening a menu on any object, for any role, calls no handler, no fetch and no model', async () => {
  const fetches = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { fetches.push(args); return Promise.reject(new Error('no network in a menu')); };
  try {
    for (const role of ['owner', 'editor', 'viewer', 'guest']) {
      for (const readOnly of [false, true]) {
        const ctx = context({ role, readOnly });
        for (const target of TARGETS()) rows(target, ctx);
        assert.deepEqual(ctx.calls, [], `${role} readOnly=${readOnly}: nothing acted`);
      }
    }
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(fetches, []);
});

test('general cards: Start Rabbit Hole on content, Copy text of the card itself', () => {
  const ctx = context();
  const [explanation] = TARGETS();
  assert.deepEqual(labels(explanation, ctx), ['Start Rabbit Hole', 'Copy text']);
  assert.deepEqual(run(explanation, ctx, 'Copy text'), ['copyText', 'Tides\n\nThe moon pulls.']);
  assert.deepEqual(run(explanation, ctx, 'Start Rabbit Hole'), ['startRabbitHole', 'e1']);
  assert.equal(contentText(TARGETS()[18]), 'Moons\nName\tKm\nIo\t3643');
  assert.equal(contentText(TARGETS()[19]), 'Why?\n\nBecause.');
  // Structure is not a Rabbit Hole origin.
  for (const type of ['heading', 'divider', 'canvas-ref']) assert.equal(rabbitHoleTarget({ type }), false, type);
  assert.equal(rabbitHoleTarget({ type: 'file', kind: 'attachment' }), false);
  assert.ok(!labels(TARGETS()[17], ctx).includes('Start Rabbit Hole'), 'not on a heading');
});

test('Start Rabbit Hole: disabled while generating, hidden on a failed card, sign-in for a guest, none without the flow', () => {
  const explanation = TARGETS()[0];
  assert.deepEqual(rows(explanation, context({ job: 'running' })).find(row => row.id === 'card.start-rabbit-hole').reason, 'Still generating');
  assert.ok(!labels(card({ id: 'f', type: 'video', status: 'failed', title: 'x' }), context()).includes('Start Rabbit Hole'));
  const guest = rows(explanation, context({ role: 'guest', readOnly: true })).find(row => row.id === 'card.start-rabbit-hole');
  assert.ok(guest && !guest.disabled, 'a guest keeps it and goes through sign-in');
  const none = context(); none.canvas.startRabbitHole = null;
  assert.ok(!labels(explanation, none).includes('Start Rabbit Hole'));
});

test('wiki, paper, PDF and slide open their reader at the right page; their sources open', () => {
  const ctx = context({ attached: ['wiki:w1'] });
  const [, wiki, , , paper, pdf, slide] = TARGETS();
  assert.deepEqual(labels(wiki, ctx), ['Start Rabbit Hole', 'Open in reader', 'Open on Wikipedia', 'Detach article from tutor']);
  assert.deepEqual(run(wiki, ctx, 'Open in reader'), ['cardAction', 'wiki-reader', { title: 'Tide', section: 2 }]);
  assert.deepEqual(run(wiki, ctx, 'Open on Wikipedia'), ['openUrl', 'https://en.wikipedia.org/wiki/Tide']);
  assert.deepEqual(run(wiki, ctx, 'Detach article from tutor'), ['cardAction', 'attach-toggle', { sourceId: 'wiki:w1' }]);
  assert.deepEqual(run(paper, ctx, 'Open in reader'), ['cardAction', 'paper-reader', { id: '1706.03762', title: 'Attention', page: 3 }]);
  assert.deepEqual(run(paper, ctx, 'Open on arXiv'), ['openUrl', 'https://arxiv.org/abs/1706.03762']);
  assert.ok(labels(paper, ctx).includes('Attach paper to tutor'));
  assert.deepEqual(run(pdf, ctx, 'Open in reader'), ['cardAction', 'pdf-reader', { id: 'abc', title: 'Notes.pdf', page: 1 }]);
  assert.deepEqual(run(slide, ctx, 'Open in reader'), ['cardAction', 'pdf-reader', { id: 'abc', title: 'Notes.pdf', page: 4 }]);
  assert.deepEqual(run(pdf, ctx, 'Download PDF'), ['downloadUrl', '/api/learn/paper?app=app-1&id=abc', 'Notes.pdf']);
  // The stored PDF is read as its owner: no Download PDF on a view-only board; no reader without the page's readers.
  assert.ok(!labels(pdf, context({ role: 'viewer', readOnly: true, cardAction: false })).some(label => /Download|reader/.test(label)));
});

test('video: a YouTube moment opens at its time; a generated or Motion clip has no YouTube row', () => {
  const ctx = context();
  const [, , youtube, motion] = TARGETS();
  assert.deepEqual(run(youtube, ctx, 'Open on YouTube'), ['openUrl', 'https://www.youtube.com/watch?v=abc&t=61s']);
  assert.ok(labels(youtube, ctx).includes('Attach video to tutor'));
  assert.deepEqual(labels(motion, ctx), ['Start Rabbit Hole'], 'no Open on YouTube with an undefined id, no invented play or download');
});

test('images, audio and 3D files download their original; an image shows to the tutor', () => {
  const ctx = context();
  const [image, audio, model] = TARGETS().slice(7, 10);
  assert.deepEqual(labels(image, ctx), ['Start Rabbit Hole', 'Attach image to tutor', 'Show the tutor this image', 'Download original']);
  assert.deepEqual(run(image, ctx, 'Show the tutor this image'), ['cardAction', 'image-attach', { blockId: 'i1', mediaId: 'm1', label: 'cat.png' }]);
  assert.equal(run(audio, ctx, 'Download original')[0], 'downloadOriginal');
  assert.equal(run(model, ctx, 'Download original')[1].id, 'm1');
  const region = card({ id: 'x', type: 'file', kind: 'image', assetKey: 'k', excerpt: { kind: 'region' } });
  assert.ok(!labels(region, ctx).includes('Download original'), 'a crop is not an original');
});

test('code: Copy code, Open in notebook (Python only), Edit only for a code box, repository source never editable', () => {
  const ctx = context();
  const targets = TARGETS();
  const [snippet, exercise, repo] = targets.slice(10, 13);
  const box = targets[22];
  assert.deepEqual(labels(snippet, ctx), ['Start Rabbit Hole', 'Open in notebook', 'Copy code']);
  assert.deepEqual(run(snippet, ctx, 'Copy code'), ['copyText', 'for i in range(3): print(i)']);
  assert.deepEqual(run(exercise, ctx, 'Copy code'), ['copyText', 'total = n']);
  assert.deepEqual(run(snippet, ctx, 'Open in notebook'), ['openInNotebook', 'c1']);
  const js = rows(card({ id: 'j', type: 'snippet', language: 'javascript', code: 'x' }), ctx).find(row => row.id === 'code.open-notebook');
  assert.equal(js.reason, 'Notebooks run Python only');
  // A repository card offers its code once read, and its own Open source; never Edit.
  assert.deepEqual(labels(repo, ctx), ['Start Rabbit Hole']);
  let opened = 0;
  const unpublish = publishCodeCard('r1', { code: 'import torch', openSource: () => { opened += 1; } });
  try {
    assert.deepEqual(labels(repo, ctx), ['Start Rabbit Hole', 'Open source', 'Copy code']);
    assert.deepEqual(run(repo, ctx, 'Copy code'), ['copyText', 'import torch']);
    rows(repo, ctx).find(row => row.label === 'Open source').run();
    assert.equal(opened, 1);
  } finally { unpublish(); }
  assert.deepEqual(labels(box, ctx), ['Edit code', 'Open in notebook', 'Copy code']);
  assert.deepEqual(run(box, ctx, 'Edit code'), ['edit', 'cb']);
});

test('selected text and code lines: copied and added to chat as the quote, never as the whole card', () => {
  const ctx = context();
  const page = card({ id: 'wp', type: 'webpage', url: 'https://example.com', title: 'E' }, { part: { kind: 'text', text: 'the quoted bit' } });
  assert.deepEqual(labels(page, ctx).filter(label => /select/i.test(label)), ['Add selection to chat', 'Copy selected text']);
  assert.deepEqual(run(page, ctx, 'Add selection to chat'), ['addToChat', { quote: 'the quoted bit' }]);
  assert.deepEqual(run(page, ctx, 'Copy selected text'), ['copyText', 'the quoted bit']);
  const lines = card({ id: 'c1', type: 'snippet', language: 'python', code: 'a\nb' }, { part: { kind: 'code-lines', text: 'b' } });
  assert.ok(labels(lines, ctx).includes('Add selected lines to chat'));
  assert.ok(!labels(lines, ctx).includes('Copy code'), 'Copy selected text, not the whole code, while lines are selected');
  assert.ok(labels(lines, context({ role: 'guest', readOnly: true })).includes('Add selected lines to chat'), 'a guest asks with the same allowance');
});

test('notebook: Run all and Restart wait for Python and a notebook file; the .ipynb downloads as it is', () => {
  const ctx = context();
  const notebook = TARGETS()[13];
  assert.deepEqual(rows(notebook, ctx).filter(row => row.disabled).map(row => [row.label, row.reason]), [['Run all', 'Starting Python'], ['Restart', 'Starting Python']]);
  let ready = false, kind = 'file';
  const sent = [];
  const unregister = registerNotebookEditor('n1', { ready: () => ready, isNotebook: () => kind === 'notebook', runAll: () => sent.push('run-all'), restart: () => sent.push('restart') });
  try {
    ready = true;
    assert.equal(rows(notebook, ctx).find(row => row.label === 'Run all').reason, 'Open a notebook file');
    kind = 'notebook';
    run(notebook, ctx, 'Run all'); run(notebook, ctx, 'Restart');
    assert.deepEqual(sent, ['run-all', 'restart']);
    assert.ok(!labels(notebook, context({ role: 'viewer', readOnly: true })).includes('Run all'), 'a view-only board runs nothing');
    assert.deepEqual(rows(notebook, context({ locked: ['n1'] })).find(row => row.label === 'Run all').reason, 'Locked');
  } finally { unregister(); }
  assert.deepEqual(run(notebook, ctx, 'Download lesson.ipynb'), ['downloadText', 'lesson.ipynb', JSON.stringify({ cells: [] }, null, 1), 'application/x-ipynb+json']);
});

test('text, sticky notes, shapes, arrows and connectors: local edit and the existing style panel', () => {
  const ctx = context();
  const targets = TARGETS();
  const [text, sticky] = targets.slice(20, 22);
  const [rect, arrow, link] = targets.slice(24, 27);
  assert.deepEqual(labels(text, ctx), ['Edit text', 'Style', 'Copy text']);
  assert.deepEqual(labels(sticky, ctx), ['Edit text', 'Style', 'Copy text']);
  assert.deepEqual(labels(rect, ctx), ['Edit text', 'Style']);
  assert.deepEqual(labels(arrow, ctx), ['Edit label', 'Style']);
  assert.deepEqual(labels(link, ctx), ['Edit label', 'Style']);
  assert.deepEqual(run(link, ctx, 'Edit label'), ['edit', 'ln']);
  assert.deepEqual(run(rect, ctx, 'Style'), ['openStyle']);
  assert.deepEqual(labels(text, context({ role: 'viewer', readOnly: true })), ['Copy text'], 'read-only keeps only copying');
  assert.deepEqual(rows(text, context({ locked: ['tx'] })).filter(row => row.disabled).map(row => row.reason), ['Locked', 'Locked']);
});

test('equations: Edit and Copy LaTeX, display size from the existing ladder', () => {
  const ctx = context();
  const equation = TARGETS()[23];
  assert.deepEqual(labels(equation, ctx), ['Edit LaTeX', 'Size S', 'Size M', 'Size L', 'Size XL', 'Copy LaTeX']);
  assert.deepEqual(rows(equation, ctx).filter(row => row.checked).map(row => row.label), ['Size M'], 'the default size is M');
  assert.deepEqual(run(equation, ctx, 'Copy LaTeX'), ['copyText', 'e^{i\\pi}+1=0']);
  assert.deepEqual(run(equation, ctx, 'Edit LaTeX'), ['editEquation', 'eq']);
  assert.equal(run(equation, ctx, 'Size XL')[0], 'patchItem');
});

test('CAD: only the saved formats download; Interact and Reset view only while its viewer is live', () => {
  const ctx = context();
  const cad = TARGETS()[14];
  assert.deepEqual(labels(cad, ctx), ['Start Rabbit Hole', 'Download STEP', 'Download GLB']);
  assert.deepEqual(run(cad, ctx, 'Download STEP'), ['downloadCad', cad.object, { kind: 'step', url: '/a.step', name: 'part.step' }]);
  const did = [];
  publishView('k1', { live: true, interacting: false, api: { enter: () => did.push('enter'), exit: () => did.push('exit'), fit: () => did.push('fit') } });
  try {
    assert.deepEqual(labels(cad, ctx), ['Start Rabbit Hole', 'Interact', 'Reset view', 'Download STEP', 'Download GLB']);
    rows(cad, ctx).find(row => row.label === 'Interact').run();
    rows(cad, ctx).find(row => row.label === 'Reset view').run();
    assert.deepEqual(did, ['enter', 'fit']);
  } finally { dropView('k1'); }
});

test('webpage: open the original URL and lock scrolling; no Refresh from the menu', () => {
  const ctx = context();
  const page = TARGETS()[16];
  assert.deepEqual(labels(page, ctx), ['Start Rabbit Hole', 'Open original page', 'Lock scroll']);
  assert.deepEqual(run(page, ctx, 'Lock scroll'), ['updateBlock', 'wp', { scrollLocked: true }]);
  assert.equal(rows(card({ ...page.object, scrollLocked: true }), ctx).find(row => row.label === 'Lock scroll').checked, true);
  assert.ok(!TYPE_ACTIONS.some(entry => /refresh|capture/i.test(entry.id)), 'Refresh stays on the card (webpage.capture), not invented here');
});

test('Explanation: no invented playback or edit rows; headings keep Mark done and Present', () => {
  const ctx = context();
  assert.deepEqual(labels(TARGETS()[15], ctx), ['Start Rabbit Hole']);
  const heading = TARGETS()[17];
  assert.deepEqual(labels(heading, ctx), ['Mark done', 'Present from here']);
  assert.deepEqual(run(heading, ctx, 'Mark done'), ['updateBlock', 'h1', { done: true }]);
});

test('empty canvas: add text or a note where the menu opened, Fit canvas; a view-only board only fits', () => {
  const ctx = context();
  const blank = TARGETS().at(-1);
  assert.deepEqual(labels(blank, ctx), ['Add text', 'Add sticky note', 'Fit canvas']);
  assert.deepEqual(run(blank, ctx, 'Add sticky note'), ['insertSticky', { x: 120, y: 80 }]);
  assert.deepEqual(labels(blank, context({ role: 'guest', readOnly: true })), ['Fit canvas']);
});

test('mixed selections show only rows valid for every member', () => {
  const ctx = context();
  const targets = TARGETS();
  const multi = members => ({ kind: 'multi', family: null, type: null, id: null, object: null, ids: members.map(member => member.id), members, part: null, point: { x: 0, y: 0 } });
  assert.deepEqual(labels(multi([targets[20], targets[24], targets[26]]), ctx), ['Style'], 'text, shape and connector share Style');
  assert.deepEqual(labels(multi([targets[20], targets[0]]), ctx), [], 'a card in the mix: no per-type row');
  assert.deepEqual(labels(multi([targets[10], targets[11]]), ctx), [], 'no single-object row on two code cards');
});
