// pdf-to-canvas.md follow-up 5: a journey Tutor turn about one PDF page carries that page. The composer picks the one page
// (pdf-source.js tutorPage) and it rides the plan request as page_context; the plan route reads it (learn-tutor.test.js).
// A turn about several pages keeps the page-aware fallback, /api/learn/ask (chat-route.js pageTurn).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyStore } from './learn-tutor-evidence.js';
import { tutorContext } from './learn-tutor-domains.js';
import { runTurn } from './learn-tutor.js';
import { pageRef, tutorPage } from './pdf-source.js';
import { tutorTurn } from './chat-route.js';

const PLAN = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Page 12 defines attention.' }] };
const canvas = { canvas: { app: 'canvas-0000aaaa', board: 'main' }, access: { app: 'canvas-0000aaaa' }, domain: tutorContext({ title: 'Pages' }).domain };
const paperPage = pageRef({ type: 'slide', pdf: 'pdf:upload:0123456789ab', number: 12, label: 'pages.pdf', home: 'canvas-11112222' });
const docPage = pageRef({ type: 'slide', pdf: 'doc:ctx:0123456789ab', number: 12, label: 'pages.pdf' });

test('the one page of a turn: a selected page or one page chip, for either source; several pages, or none, is null', () => {
  assert.deepEqual(tutorPage({ paper: { id: 'upload:0123456789ab', page: 12 } }, []), { paper: { id: 'upload:0123456789ab', page: 12 } });
  assert.deepEqual(tutorPage(null, [paperPage]), { paper: { id: 'upload:0123456789ab', page: 12, home: 'canvas-11112222' } }, 'after the selection is cleared');
  assert.deepEqual(tutorPage({ docPage }, [docPage]), { doc: { id: 'ctx:0123456789ab', page: 12 } }, 'the selected page and its own chip are one page');
  assert.equal(tutorPage(null, [paperPage, docPage]), null, 'two pages stay on /api/learn/ask');
  assert.equal(tutorPage(null, [{ sourceId: 'card:b1', kind: 'card', range: null }]), null);
});

test('Auto keeps the Tutor for one page and falls back for several; never a Tutor turn that drops a page', () => {
  const tutor = { active: true };
  const route = (target, refs) => tutorTurn({ tutor, pageTurn: (!!target || refs.length > 0) && !tutorPage(target, refs), chat: { thread: { mode: 'auto' } }, mode: 'auto' });
  assert.equal(route(null, [paperPage]), true);
  assert.equal(route({ docPage }, []), true);
  assert.equal(route(null, [paperPage, docPage]), false);
  // The composer computes exactly this (learn-journey-ui.test.mjs pins the line).
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.match(ask, /const pdfPage = tutorPage\(target, attachedRefs\);/);
  assert.match(ask, /image: tutorImage, page: pdfPage, opening/);
});

test('the page rides the plan request as page_context; a turn without one sends none', async () => {
  for (const [page, expected] of [[{ paper: { id: 'upload:0123456789ab', page: 12, home: 'canvas-11112222' } }, true], [null, false]]) {
    const sent = [];
    const post = async (path, body) => { sent.push({ path, body }); if (path === '/api/learn/tutor/plan') return PLAN; return { status: 'error', evaluator: 'jev', events: [] }; };
    await runTurn({ raw: 'What does this page say?', block: null, store: emptyStore(), post, ...canvas, page });
    const plan = sent.find(entry => entry.path === '/api/learn/tutor/plan').body;
    assert.equal('page_context' in plan, expected);
    if (expected) assert.deepEqual(plan.page_context, page);
  }
});
