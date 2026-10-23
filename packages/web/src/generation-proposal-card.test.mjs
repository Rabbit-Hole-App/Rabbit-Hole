// UI-15 / MOT-20 (owner messages 39 and 40): the shared generation-proposal card. GenerationProposalCard.jsx is bundled with
// esbuild and rendered with react-dom/server, as usage-gauge-ui.test.mjs renders its gauge. A press needs no browser: a probe
// component calls the card as its own render, so the card's hooks are the probe's, and presses the Generate element's handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'proposal-card-')), outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { default as Card, usageLine, durationOptions } from './GenerationProposalCard.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// The shape generation-proposal.js signProposal returns (sig, input and expiry are not drawn).
const proposal = (over = {}) => ({ proposal_id: 'gp-0123456789abcdef', version: 1, command: 'motion', title: 'Water cycle: evaporation to rain',
  description: 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain.',
  settings: { duration_seconds: 10, audio: false }, usage: { estimate_credits: 100, reserve_credits: 896 }, ...over });
const html = props => B.renderToStaticMarkup(B.createElement(B.Card, { proposal: proposal(), onGenerate: () => {}, onSettingsChange: () => {}, ...props }));
const find = (node, pred) => {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const hit = find(n, pred); if (hit) return hit; } return null; }
  return pred(node) ? node : find(node.props?.children, pred);
};
// Renders once and returns the Generate element as the card drew it.
const generateElement = props => {
  let el = null;
  const Probe = () => { const tree = B.Card({ proposal: proposal(), onSettingsChange: () => {}, ...props }); el = find(tree, n => n.props?.['data-proposal-generate']); return tree; };
  B.renderToStaticMarkup(B.createElement(Probe));
  return el;
};

test('the card: title as the heading, the description as plain text, no labels, one blue Generate, no Cancel', () => {
  const out = html();
  assert.match(out, /<h3[^>]*>Water cycle: evaporation to rain<\/h3>/);
  assert.match(out, /<p[^>]*>Sunlight warms a body of water, causing evaporation\. [^<]*<\/p>/);
  assert.doesNotMatch(out.replace(/<[^>]+>/g, ' '), /Will show|Title|Description/i, 'no labels in the text (owner message 39)');
  assert.equal(out.match(/data-proposal-generate/g).length, 1);
  assert.match(out, /<button[^>]*bg-\(--action-blue\)[^>]*data-proposal-generate="true"[^>]*>Generate<\/button>/, 'the house action Button');
  assert.doesNotMatch(out, />Cancel</);
  assert.match(out, /data-proposal-active="true"/);
  assert.doesNotMatch(out, /Updated below/);
});

test('a double-click on Generate calls onGenerate once', () => {
  const calls = [];
  const el = generateElement({ onGenerate: p => calls.push(p) });
  el.props.onClick();
  el.props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].version, 1, 'the approved version is passed back as is');
});

test('Generate is inert while busy and when superseded; a superseded card says so and its settings are disabled', () => {
  const busy = [];
  generateElement({ busy: true, onGenerate: p => busy.push(p) }).props.onClick();
  assert.equal(busy.length, 0);
  const stale = [];
  const el = generateElement({ active: false, onGenerate: p => stale.push(p) });
  assert.equal(el.props.disabled, true);
  el.props.onClick();
  assert.equal(stale.length, 0);
  const out = html({ active: false });
  assert.match(out, /data-proposal-active="false"/);
  assert.match(out, /Updated below/);
  assert.match(out, /<button[^>]*data-proposal-generate="true" disabled=""/);
  assert.match(out, /<select data-proposal-duration="true" disabled=""/);
  assert.match(out, /data-proposal-audio="off" aria-pressed="true" disabled=""/);
  // A proposal that already added its card is inactive too, and says where it went rather than that it was updated.
  const made = html({ active: false, made: true });
  assert.match(made, /Added to the canvas/);
  assert.doesNotMatch(made, /Updated below/);
});

test('Audio: Off selected, On disabled with the coming-soon tooltip', () => {
  const out = html();
  assert.match(out, /data-proposal-audio="off" aria-pressed="true"/);
  assert.doesNotMatch(out, /data-proposal-audio="off"[^>]*disabled=""/, 'Off is enabled on an active card');
  assert.match(out, /<button type="button" data-proposal-audio="on" aria-pressed="false" disabled="" title="Narration coming soon"/);
  assert.match(out, /role="tooltip"[^>]*><span[^>]*>Narration coming soon</);
});

test('the usage line: server credits on one line, never dollars', () => {
  assert.match(html(), /<p data-proposal-usage="true"[^>]*>About 100 credits<\/p>/, 'the reservation stays internal (owner, 2026-10-21)');
  const big = html({ proposal: proposal({ usage: { estimate_credits: 1200, reserve_credits: 8960 } }) });
  assert.match(big, /About 1,200 credits</);
  for (const usage of [{ estimate_credits: 100, reserve_credits: 896 }, { estimate_credits: 100, reserve_credits: null }, { estimate_credits: null, reserve_credits: 896 }, { estimate_credits: 1200, reserve_credits: 8960 }]) {
    assert.doesNotMatch(B.usageLine(usage), /\$/, JSON.stringify(usage));
  }
  assert.equal(B.usageLine({ estimate_credits: null, reserve_credits: null }), '');
  assert.equal(B.usageLine({ estimate_credits: null, reserve_credits: 896 }), '', 'a reservation alone shows nothing');
  assert.doesNotMatch(html({ proposal: proposal({ usage: { estimate_credits: null, reserve_credits: null } }) }), /data-proposal-usage/, 'no line without numbers');
  assert.doesNotMatch(html(), /\$/);
});

test('the duration options are exactly 5, 10 ... 60 seconds, the value selected', () => {
  const out = html({ proposal: proposal({ settings: { duration_seconds: 20, audio: false } }) });
  const values = [...out.matchAll(/<option value="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(values, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  assert.match(out, /<option value="20" selected="">20 seconds<\/option>/);
  assert.match(out, /<option value="60">60 seconds<\/option>/);
  // A proposal saved before the exact list may hold another whole second; its value stays visible instead of showing a wrong one.
  assert.deepEqual(B.durationOptions(12), [5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  assert.deepEqual(B.durationOptions(10), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
});

test('the aspect ratio field lists the nine Motion ratios with the shared labels, 16:9 for a proposal saved without one', () => {
  const out = html({ proposal: proposal({ settings: { duration_seconds: 10, audio: false } }) });
  assert.match(out, /data-proposal-field="aspect_ratio"/);
  assert.deepEqual([...out.matchAll(/<option value="(\d+:\d+)"/g)].map(m => m[1]), ['9:16', '1:1', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4']);
  assert.match(out, /<option value="16:9" selected="">16:9 landscape<\/option>/, 'no stored ratio is the original 16:9');
  assert.match(html({ proposal: proposal({ settings: { duration_seconds: 10, aspect_ratio: '9:16', audio: false } }) }), /<option value="9:16" selected="">9:16 portrait<\/option>/);
  assert.match(html({ active: false }), /<select[^>]*data-aspect-ratio-select[^>]*disabled=""/, 'a superseded card is inert');
});

test('a duration change sends the whole Motion settings with audio false', () => {
  let el = null;
  const changes = [];
  const Probe = () => { const tree = B.Card({ proposal: proposal(), onGenerate: () => {}, onSettingsChange: s => changes.push(s) }); el = tree; return tree; };
  B.renderToStaticMarkup(B.createElement(Probe));
  const settings = find(el, n => typeof n.type === 'function' && n.props?.settings);
  // The settings and each declared field are component elements (MOT-20b: fields from the capability declaration): render each as a
  // probe in turn to reach the duration select.
  let select = null;
  const open = element => { const Inner = () => { const t = element.type(element.props); select ||= find(t, n => n.props?.['data-proposal-duration']); if (!select) { const field = find(t, n => typeof n.type === 'function' && n.props?.f?.type === 'integer'); if (field) open(field); } return t; }; B.renderToStaticMarkup(B.createElement(Inner)); };
  open(settings);
  select.props.onChange({ target: { value: '25' } });
  assert.deepEqual(changes, [{ duration_seconds: 25, audio: false }]);
});

test('an aspect ratio change keeps the duration and audio in the settings it sends', () => {
  let el = null;
  const changes = [];
  const Probe = () => { const tree = B.Card({ proposal: proposal({ settings: { duration_seconds: 45, audio: false } }), onGenerate: () => {}, onSettingsChange: s => changes.push(s) }); el = tree; return tree; };
  B.renderToStaticMarkup(B.createElement(Probe));
  const settings = find(el, n => typeof n.type === 'function' && n.props?.settings);
  let fields = null;
  const Inner = () => { fields = settings.type(settings.props); return fields; };
  B.renderToStaticMarkup(B.createElement(Inner));
  find(fields, n => n.props?.f?.key === 'aspect_ratio').props.onChange('9:16');
  assert.deepEqual(changes, [{ duration_seconds: 45, audio: false, aspect_ratio: '9:16' }]);
});

// MOT-20b: the fields are the capability's declaration (CHAT_CAPABILITIES settings), never a card of its own per capability.
test('a capability that declares no fields shows no settings: no Duration and no Audio', () => {
  const out = html({ proposal: proposal({ command: 'flashcards', settings: {} }) });
  assert.doesNotMatch(out, /data-proposal-settings|data-proposal-duration|data-proposal-audio|Duration|Audio/);
  assert.match(out, /data-proposal-generate/);
});
