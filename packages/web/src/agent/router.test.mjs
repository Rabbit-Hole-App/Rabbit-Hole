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
const OPEN_NANOGPT = { type: 'command', name: 'open_resource', args: { slug: 'repo-1a2b3c4d-nanogpt', kind: 'repository', title: 'karpathy/nanoGPT' } };
const ABOUT_NANOGPT = { slug: 'repo-1a2b3c4d-nanogpt', kind: 'repository', title: 'karpathy/nanoGPT' };

test('rule 1: a slash mode at position 0 comes before every other rule', () => {
  assert.deepEqual(at('/teach https://github.com/karpathy/nanoGPT'), { type: 'mode', mode: 'teach', text: 'https://github.com/karpathy/nanoGPT' });
  assert.deepEqual(at('/do'), { type: 'mode', mode: 'do', text: '' });
  assert.deepEqual(at('/asking about masks'), { type: 'ask', mode: 'ask', text: '/asking about masks' });
});

test('a mode pill wins over the rules; Auto is no pill; /do still runs the rules', () => {
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT', { mode: 'ask' }), { type: 'ask', mode: 'ask', text: 'https://github.com/karpathy/nanoGPT' });
  assert.deepEqual(at('open counter', { mode: 'teach' }), { type: 'ask', mode: 'teach', text: 'open counter' });
  assert.deepEqual(at('open counter', { mode: 'research' }), { type: 'ask', mode: 'research', text: 'open counter' });
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT', { mode: 'auto' }), OPEN_NANOGPT);
  assert.equal(at('share counter with y@example.com', { mode: 'do' }).name, 'share');
  assert.deepEqual(at('explain the training loop', { mode: 'do' }), { type: 'ask', mode: 'ask', text: 'explain the training loop' });
});

// A URL appearing is not a request to create a project (user decision, 2026-09-24): only a bare link
// or explicit creation language connects, and an already-connected repository opens instead.
test('rule 2: a bare repository link connects it when new and opens its project when already connected', () => {
  assert.deepEqual(at('https://github.com/karpathy/minGPT'), connect('karpathy/minGPT'));
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT'), OPEN_NANOGPT);
});

test('rule 2: host and owner/repository casing, .git, a trailing slash, query and fragment all name the same repository', () => {
  for (const text of ['https://GitHub.com/Karpathy/NanoGPT', 'https://github.com/karpathy/nanoGPT.git', 'https://github.com/karpathy/nanoGPT/', 'github.com/KARPATHY/nanogpt?tab=readme-ov-file#install', '<https://www.github.com/karpathy/nanoGPT.git/>']) {
    assert.deepEqual(at(text), OPEN_NANOGPT, text);
  }
});

test('rule 2: explicit creation language still connects: start a rabbit hole with, connect, import', () => {
  assert.deepEqual(at('Start a rabbit hole with https://github.com/karpathy/minGPT.git'), connect('karpathy/minGPT'));
  assert.deepEqual(at('connect https://github.com/karpathy/minGPT'), connect('karpathy/minGPT'));
  assert.deepEqual(at('Import github.com/karpathy/minGPT'), connect('karpathy/minGPT'));
  assert.deepEqual(at('Start a rabbit hole with https://github.com/karpathy/nanoGPT'), OPEN_NANOGPT);
});

test('rule 2: a link inside a question is a question; a connected repository comes along as context, never a Connect card', () => {
  for (const text of ['How does attention work in https://github.com/karpathy/nanoGPT?', 'look at http://www.github.com/karpathy/nanoGPT/tree/master/model.py.', 'what is https://github.com/karpathy/nanoGPT.']) {
    assert.deepEqual(at(text), { type: 'ask', mode: 'ask', text, about: ABOUT_NANOGPT }, text);
  }
});

test('rule 2: a question about a repository that is not connected asks, and offers Connect only as an explicit next step', () => {
  const text = 'How does attention work in https://github.com/karpathy/minGPT?';
  assert.deepEqual(at(text), {
    type: 'ask', mode: 'ask', text,
    note: "karpathy/minGPT isn't connected, so answers can't read its code yet.",
    offer: { label: 'Connect karpathy/minGPT', name: 'connect_repository', args: { url: 'https://github.com/karpathy/minGPT', repo: 'karpathy/minGPT' } },
  });
});

test('rule 2: a different /tree/ branch of a connected repository asks: open the project, or connect that branch', () => {
  const catalog = [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'master' }];
  assert.deepEqual(route('https://github.com/karpathy/nanoGPT/tree/master', { catalog, scope: HOME }), OPEN_NANOGPT);
  assert.deepEqual(route('https://github.com/karpathy/nanoGPT/tree/master/model.py', { catalog, scope: HOME }), OPEN_NANOGPT);
  assert.deepEqual(route('https://github.com/karpathy/nanoGPT/tree/dev', { catalog, scope: HOME }), {
    type: 'choose',
    options: [
      { label: 'karpathy/nanoGPT (master) · Project', name: 'open_resource', args: ABOUT_NANOGPT },
      { label: 'Connect karpathy/nanoGPT at dev', name: 'connect_repository', args: { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'dev', newBranch: true } },
    ],
  });
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

// Verification of 827501d (workflow wf_c0c71676-3f7): ordinary wording around creation, question marks,
// branches in questions, backticks and malformed branch links.
test('rule 2: creation wording with ordinary extra words still connects; a question mark keeps it a question', () => {
  for (const words of ['please connect', 'Connect repository:', 'connect repo', 'connect this:', 'import repo', 'import this repo:', 'please import', 'start a new rabbit hole with', 'start a rabbit hole for', 'start a rabbithole with']) {
    assert.deepEqual(at(`${words} https://github.com/karpathy/minGPT`), connect('karpathy/minGPT'), words);
    assert.deepEqual(at(`${words} https://github.com/karpathy/nanoGPT`), OPEN_NANOGPT, words);
  }
  assert.deepEqual(at('connect https://github.com/karpathy/minGPT please'), connect('karpathy/minGPT'));
  assert.deepEqual(at("let's start a rabbit hole with https://github.com/karpathy/minGPT"), connect('karpathy/minGPT'));
  for (const text of ['should I connect https://github.com/karpathy/minGPT?', 'connect https://github.com/karpathy/minGPT?']) {
    assert.equal(at(text).type, 'ask', text);
    assert.equal(at(text).offer.name, 'connect_repository', text);
  }
});

test('rule 2: a question about another branch of a connected repository never borrows the connected branch', () => {
  const catalog = [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'master' }];
  const text = 'How does https://github.com/karpathy/nanoGPT/tree/dev differ from master?';
  assert.deepEqual(route(text, { catalog, scope: HOME }), {
    type: 'ask', mode: 'ask', text,
    note: 'karpathy/nanoGPT is connected on master, not dev.',
    offer: { label: 'Connect karpathy/nanoGPT at dev', name: 'connect_repository', args: { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'dev', newBranch: true } },
  });
  const both = [...catalog, { name: 'repo-2b3c4d5e-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'dev' }];
  assert.equal(route(text, { catalog: both, scope: HOME }).about.slug, 'repo-2b3c4d5e-nanogpt');
  // Two connected branches and no branch in the link: no guess.
  assert.deepEqual(route('what is https://github.com/karpathy/nanoGPT?', { catalog: both, scope: HOME }), { type: 'ask', mode: 'ask', text: 'what is https://github.com/karpathy/nanoGPT?' });
});

test('rule 2: a link in backticks counts; a malformed or punctuated branch link never breaks the router', () => {
  assert.deepEqual(at('what does `https://github.com/karpathy/nanoGPT` do'), { type: 'ask', mode: 'ask', text: 'what does `https://github.com/karpathy/nanoGPT` do', about: ABOUT_NANOGPT });
  assert.deepEqual(at('`https://github.com/karpathy/minGPT`'), connect('karpathy/minGPT'));
  assert.equal(at('connect https://github.com/o/r/tree/%E0%A4%A').args.branch, '%E0%A4%A');
  assert.equal(at('connect https://github.com/o/r/tree/dev!').args.branch, 'dev');
  assert.equal(at('connect https://github.com/o/r/tree/dev,').args.branch, 'dev');
});
