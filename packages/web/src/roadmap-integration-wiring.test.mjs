// R4 integration gaps, pinned in the page source (effects never run in node; the controller and pure helpers are unit-tested in
// roadmap-controller.test.mjs and roadmap-client.test.mjs, the clicks in e2e/roadmap-mvp-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = read('LearnPage.jsx'), ask = read('ask.jsx'), workspace = read('chat-workspace.jsx'), hook = read('use-roadmap.js');

test('gap 1: a dropped Markdown card is registered, and sourceReady runs from a successful board save with the server key', () => {
  assert.match(page, /block\.type === 'file' && block\.kind === 'markdown'\) \{ droppedMarkdown\.current\.add\(block\.id\);/);
  const effect = page.slice(page.indexOf("saveState?.state !== 'saved' || !droppedMarkdown.current.size"));
  assert.match(effect.slice(0, 700), /readyMarkdownSources\(\{ pending: droppedMarkdown\.current, blocks: .*savedBlocks \}\)/);
  assert.match(effect.slice(0, 700), /roadmap\.sourceReady\(key\)/);
  // The card is found by its stored source (id + rev), not by the 'file:<id>@<rev>' chat ref nor a fileRef.revision that does not exist.
  assert.match(page, /sourceBlock = key => .*block\.fileRef\?\.source\?\.id === String\(key/);
  assert.match(page, /sourceRev: key => sourceBlock\(key\)\?\.fileRef\?\.source\?\.rev/);
  assert.doesNotMatch(page, /fileRef\?\.revision/);
});

test('gap 2: the roadmap is created with the learner\'s selected Depth, not a constant', () => {
  assert.match(page, /depth: \(\) => chat\?\.settings\?\.depth \|\| 'balanced'/);
  assert.doesNotMatch(page, /depth: \(\) => 'balanced'/);
});

test('gap 3: a non-empty Chat or ToC draft and a streaming answer hold the invitation back', () => {
  assert.match(page, /composerTyping = !!\(chat\?\.composer\?\.text\?\.trim\(\) \|\| chat\?\.toc\?\.composer\?\.text\?\.trim\(\)\)/);
  assert.match(page, /typing: composerTyping, answering: !!chat\?\.answering/);
  assert.match(workspace, /answering, reportAnswering, canvas/);
  assert.match(ask, /reportAnswering\(1\); return \(\) => reportAnswering\(-1\)/);
  assert.match(hook, /typing = false, answering = false/);
  assert.match(hook, /busyRef\.current = typing \|\| answering/);
});

test('gap 4: delivery acknowledges only a saved board: the real revision and a saved-card check, never null', () => {
  assert.match(page, /boardRevision: \(\) => boardVersion\.current/);
  assert.match(page, /savedHas: id => /);
  assert.doesNotMatch(page, /boardRevision: \(\) => null/);
  assert.match(hook, /'persist', 'boardRevision', 'savedHas'/);
});

// UI.01/UI.03 (chat lane): Tutor entries render in place inside the real Chat transcript, the Edit roadmap target goes to the revision with the
// typed words, and the drop path has no idle deferral.
test('Tutor entries are real transcript messages; Edit roadmap revises with the typed text; drops are reported at once', () => {
  const transcript = read('RoadmapTranscript.jsx'), messages = read('ChatMessages.jsx'), controller = read('roadmap-controller.js');
  assert.match(ask, /renderTutor=\{chat && !tocView && roadmap\?\.on \? m => <SurfaceBoundary artifact="tutor_entry"[^\n]*<TutorMessage/);
  assert.match(messages, /renderTutor && m\.meta\?\.tutor \? <div key=\{i\}>\{renderTutor\(m\)\}<\/div>/);
  assert.match(transcript, /saveTutorEntry\(\{ app: chat\.canvas, threadId, clientId: entry\.clientId/);
  assert.match(ask, /edit\?\.command === 'roadmap'/);
  assert.match(workspace, /restoredDraft/);
  assert.match(controller, /sourceReady: key => report\(key\), idleTick: \(\) => false/);
  assert.doesNotMatch(hook, /idleTick\(\)/);
});

// Accept roadmap crashed production (undefined.left): RoadmapCanvas reads roadmap.position/surface/showOverlay whenever a proposal is pending.
test('useRoadmap returns every field RoadmapCanvas reads, so a pending proposal never throws', () => {
  const surfaces = read('RoadmapSurfaces.jsx');
  for (const field of ['position', 'surface', 'showOverlay']) assert.ok(surfaces.includes('roadmap.' + field), field + ' is read by RoadmapCanvas');
  assert.ok(hook.includes('position: overlayPosition(geometry.anchor, surface), surface, showOverlay,'), 'the hook returns position, surface and showOverlay');
});
