import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from './router.js';

const CATALOG = [
  { name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' },
  { name: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' },
  { name: 'attention-viz', kind: 'server' },
  { name: 'counter', kind: 'server' },
  { name: 'counter-2', kind: 'server' },
  { name: 's3-log', kind: 'job' },
];
const HOME = { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null };
const NANOGPT = { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: null };
const at = (text, options = {}) => route(text, { catalog: CATALOG, scope: HOME, ...options });
const connect = (repo) => ({ type: 'command', name: 'connect_repository', args: { url: `https://github.com/${repo}`, repo } });

test('rule 1: a slash mode at position 0 comes before every other rule', () => {
  assert.deepEqual(at('/teach https://github.com/karpathy/nanoGPT'), { type: 'mode', mode: 'teach', text: 'https://github.com/karpathy/nanoGPT' });
  assert.deepEqual(at('/do'), { type: 'mode', mode: 'do', text: '' });
  assert.deepEqual(at('/asking about masks'), { type: 'ask', mode: 'ask', text: '/asking about masks' });
});

test('a mode pill wins over the rules; Auto is no pill; /do still runs the rules', () => {
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT', { mode: 'ask' }), { type: 'ask', mode: 'ask', text: 'https://github.com/karpathy/nanoGPT' });
  assert.deepEqual(at('open counter', { mode: 'teach' }), { type: 'ask', mode: 'teach', text: 'open counter' });
  assert.deepEqual(at('open counter', { mode: 'research' }), { type: 'ask', mode: 'research', text: 'open counter' });
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT', { mode: 'auto' }), connect('karpathy/nanoGPT'));
  assert.equal(at('share counter with y@example.com', { mode: 'do' }).name, 'share');
  assert.deepEqual(at('explain the training loop', { mode: 'do' }), { type: 'ask', mode: 'ask', text: 'explain the training loop' });
});

test('rule 2: a GitHub repository URL connects it, wherever it sits in the sentence', () => {
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT'), connect('karpathy/nanoGPT'));
  assert.deepEqual(at('Start a rabbit hole with https://github.com/karpathy/nanoGPT.git'), connect('karpathy/nanoGPT'));
  assert.deepEqual(at('look at http://www.github.com/karpathy/nanoGPT/tree/master/model.py.'), { ...connect('karpathy/nanoGPT'), args: { ...connect('karpathy/nanoGPT').args, branch: 'master/model.py' } });
  assert.deepEqual(at('what is https://github.com/karpathy/nanoGPT.'), connect('karpathy/nanoGPT'));
});

// Privacy is decided by the server's public-refs lookup, never guessed from the URL.
test('rule 2: private-looking URLs still go to connect, and credentials never leave the draft', () => {
  assert.deepEqual(at('connect github.com/acme/private-tools'), connect('acme/private-tools'));
  const tokenUrl = at('https://x-access-token:ghp_abc123@github.com/acme/secret-tools');
  assert.deepEqual(tokenUrl, connect('acme/secret-tools'));
  assert.doesNotMatch(JSON.stringify(tokenUrl), /ghp_abc123|x-access-token/);
});

test('rule 2: any other URL, a gist or a profile goes to Ask', () => {
  for (const text of ['open https://arxiv.org/abs/1706.03762', 'https://gist.github.com/karpathy/abc123', 'https://github.com/karpathy', 'see notgithub.com/a/b']) {
    assert.deepEqual(at(text), { type: 'ask', mode: 'ask', text });
  }
});

test('catalog lookup: one match acts, 2-5 ask which one, 0 or more than 5 search', () => {
  assert.deepEqual(at('open nanogpt'), { type: 'command', name: 'open_resource', args: { slug: 'repo-1a2b3c4d-nanogpt', kind: 'repository', title: 'karpathy/nanoGPT' } });
  assert.equal(at('go to counter').args.slug, 'counter');
  const which = at('show attention');
  assert.equal(which.type, 'choose');
  assert.deepEqual(which.options, [
    { label: 'Attention deep dive · Canvas', name: 'open_resource', args: { slug: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' } },
    { label: 'attention-viz · App · server', name: 'open_resource', args: { slug: 'attention-viz', kind: 'server', title: 'attention-viz' } },
    { label: 'Search everything for "attention"', name: 'search_resources', args: { text: 'attention' } },
  ]);
  assert.deepEqual(at('open quantum'), { type: 'command', name: 'search_resources', args: { text: 'quantum' } });
  const jobs = Array.from({ length: 6 }, (_, i) => ({ name: `job-${i}`, kind: 'job' }));
  assert.equal(route('open job', { catalog: jobs.slice(0, 5), scope: HOME }).options.length, 6);
  assert.deepEqual(route('open job', { catalog: jobs, scope: HOME }), { type: 'command', name: 'search_resources', args: { text: 'job' } });
});

test('rules 4-6 in order: find beats a settings word; connect needs a provider Connections knows', () => {
  assert.deepEqual(at('find settings'), { type: 'command', name: 'search_resources', args: { text: 'settings' } });
  assert.deepEqual(at('search for masks'), { type: 'command', name: 'search_resources', args: { text: 'masks' } });
  assert.deepEqual(at('connect Google Slides'), { type: 'command', name: 'open_settings', args: { tab: 'connections', focus: 'google-slides' } });
  assert.deepEqual(at('connect to notion'), { type: 'command', name: 'open_settings', args: { tab: 'connections', focus: 'notion' } });
  assert.deepEqual(at('connect google docs'), { type: 'command', name: 'open_settings', args: { tab: 'connections', focus: 'google-drive' } });
  assert.deepEqual(at('connect the dots in attention'), { type: 'ask', mode: 'ask', text: 'connect the dots in attention' });
  assert.deepEqual(at('Settings'), { type: 'command', name: 'open_settings', args: {} });
  assert.deepEqual(at('theme'), { type: 'command', name: 'open_settings', args: { tab: 'preferences' } });
  assert.deepEqual(at('connections'), { type: 'command', name: 'open_settings', args: { tab: 'connections' } });
  assert.deepEqual(at('open settings'), { type: 'command', name: 'open_settings', args: {} });
});

test('rule 7: pin this pins the current resource; with nothing to pin it is a question', () => {
  assert.deepEqual(at('pin this', { scope: NANOGPT }), { type: 'command', name: 'pin', args: { slug: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(at('unpin s3-log'), { type: 'command', name: 'unpin', args: { slug: 's3-log' } });
  assert.deepEqual(at('pin this'), { type: 'ask', mode: 'ask', text: 'pin this' });
});

test('rule 8: a new canvas takes its title, and its project when asked from one; the bar stays put', () => {
  assert.deepEqual(at('blank canvas'), { type: 'command', name: 'create_canvas', args: { title: 'Untitled canvas', open: false } });
  assert.deepEqual(at('new canvas called Causal masks', { scope: NANOGPT }), { type: 'command', name: 'create_canvas', args: { title: 'Causal masks', project: 'repo-1a2b3c4d-nanogpt', open: false } });
});

// Projects and canvases route to share as well: the command answers that they can't be shared yet (T02 §11).
test('rules 9-10: share names anything in the catalog, run names jobs', () => {
  assert.deepEqual(at('share counter with y@example.com as editor'), { type: 'command', name: 'share', args: { app: 'counter', email: 'y@example.com', role: 'edit' } });
  assert.deepEqual(at('share counter with y@example.com'), { type: 'command', name: 'share', args: { app: 'counter', email: 'y@example.com', role: 'view' } });
  assert.deepEqual(at('share nanoGPT with y@example.com'), { type: 'command', name: 'share', args: { app: 'repo-1a2b3c4d-nanogpt', email: 'y@example.com', role: 'view' } });
  assert.deepEqual(at('share deep dive with y@example.com'), { type: 'command', name: 'share', args: { app: 'canvas-0f9e8d7c', email: 'y@example.com', role: 'view' } });
  assert.deepEqual(at('run s3-log'), { type: 'command', name: 'run', args: { app: 's3-log' } });
  assert.deepEqual(at('run counter'), { type: 'command', name: 'search_resources', args: { text: 'counter' } });
});

test('anything else is a question for Ask in the frozen scope', () => {
  assert.deepEqual(at('  explain the training loop '), { type: 'ask', mode: 'ask', text: 'explain the training loop' });
});

test('rule 2: a GitHub branch link carries its branch; credentials never do (Gate C G2)', () => {
  assert.deepEqual(at('connect https://github.com/o/r/tree/feature/x'), { type: 'command', name: 'connect_repository', args: { url: 'https://github.com/o/r', repo: 'o/r', branch: 'feature/x' } });
  assert.deepEqual(at('https://user:token@github.com/o/r'), connect('o/r'));
});
