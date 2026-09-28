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
  assert.deepEqual(at('/asking about masks'), { type: 'unknown_command', name: 'asking' }); // WP5: an unknown /word says so
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

test('Library words set the Library filter state through filter_library, the same state as the Filters control', () => {
  const filter = (args) => ({ type: 'command', name: 'filter_library', args });
  assert.deepEqual(at('Show my canvases'), filter({ type: 'canvases', section: 'private' }));
  assert.deepEqual(at('show projects shared with me'), filter({ type: 'projects', section: 'shared' }));
  assert.deepEqual(at('Show runnable apps'), filter({ type: 'apps' }));
  assert.deepEqual(at('list canvases in the workspace'), filter({ type: 'canvases', section: 'apps' }));
});

test('a kind word narrows a catalog search: find my nanoGPT project, show canvases about attention', () => {
  const search = (text, kinds) => ({ type: 'command', name: 'search_resources', args: { text, kinds } });
  assert.deepEqual(at('Find my nanoGPT project'), search('nanoGPT', ['repository']));
  assert.deepEqual(at('Show canvases about attention'), search('attention', ['canvas']));
  assert.deepEqual(at('find apps called counter'), search('counter', ['job', 'server']));
  assert.deepEqual(at('Find nanoGPT'), { type: 'command', name: 'search_resources', args: { text: 'nanoGPT' } }); // unchanged
  assert.equal(at('open counter').name, 'open_resource'); // rule 3 unchanged: an exact name opens
});

test('the resource I worked on recently opens from this browser (open_recent)', () => {
  const recent = (kind) => ({ type: 'command', name: 'open_recent', args: { kind } });
  assert.deepEqual(at('Open the project I worked on recently'), recent('repository'));
  assert.deepEqual(at('open the canvas I was working on yesterday'), recent('canvas'));
  assert.deepEqual(at('open my last project'), recent('repository'));
});

test('owner/repo on its own, or after creation words, is a repository reference; inside a question it stays a question', () => {
  assert.deepEqual(at('Start a rabbit hole from karpathy/minGPT'), connect('karpathy/minGPT'));
  assert.deepEqual(at('karpathy/minGPT'), connect('karpathy/minGPT'));
  assert.deepEqual(at('connect karpathy/nanoGPT'), OPEN_NANOGPT); // the same WP1 decision: connected opens
  assert.deepEqual(at('what does karpathy/minGPT do?'), { type: 'ask', mode: 'ask', text: 'what does karpathy/minGPT do?' });
});

test('slash shortcuts are the same requests as their sentences: /find /open /connect /run', () => {
  for (const [slash, words] of [['/find nanoGPT', 'find nanoGPT'], ['/find canvases about attention', 'find canvases about attention'], ['/open counter', 'open counter'],
    ['/open last project', 'open last project'], ['/connect karpathy/minGPT', 'connect karpathy/minGPT'], ['/connect google slides', 'connect google slides'], ['/run s3-log', 'run s3-log']]) {
    assert.deepEqual(at(slash), at(words), slash);
  }
});

test('a bare shortcut goes somewhere useful; /new opens Start on its path without creating anything', () => {
  const start = (path) => ({ type: 'command', name: 'open_start', args: { path } });
  assert.deepEqual(at('/find'), { type: 'command', name: 'filter_library', args: {} });
  assert.deepEqual(at('/open'), { type: 'command', name: 'filter_library', args: {} });
  assert.deepEqual(at('/run'), { type: 'command', name: 'filter_library', args: { type: 'apps' } });
  assert.deepEqual(at('/new'), start('repository'));
  assert.deepEqual(at('/new canvas'), start('blank'));
  assert.deepEqual(at('/new question'), start('question'));
  assert.deepEqual(at('/new sources'), start('sources'));
  assert.deepEqual(at('/new repository'), start('repository'));
  assert.deepEqual(at('/connect'), start('repository'));
});

test('/share acts on what is in scope; with nothing in scope it says how', () => {
  assert.deepEqual(at('/share this project', { scope: NANOGPT }), { type: 'command', name: 'share', args: { app: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(at('/share', { scope: NANOGPT }), { type: 'command', name: 'share', args: { app: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(at('/share'), { type: 'note', text: 'Open a project, canvas or app to share it, or type /share <name> with <email>.' });
  assert.deepEqual(at('/share counter with a@b.co'), at('share counter with a@b.co'));
});

test('questions about Rabbit Hole itself get a built-in answer; help lists what the bar can do', () => {
  const explain = (concept) => ({ type: 'command', name: 'explain', args: { concept } });
  assert.deepEqual(at('What is a Project?'), explain('project'));
  assert.deepEqual(at("what's a canvas"), explain('canvas'));
  assert.deepEqual(at('What are apps?'), explain('app'));
  assert.deepEqual(at('explain the Library'), explain('library'));
  assert.deepEqual(at('what is the source owner badge?'), explain('source owner'));
  assert.deepEqual(at('help'), explain('help'));
  assert.deepEqual(at('/help'), explain('help'));
  assert.deepEqual(at('What can you do?'), explain('help'));
  assert.equal(at('what is a project in nanoGPT?').type, 'ask'); // a real question stays a question
});

test('an unknown slash command says so instead of going to Ask', () => {
  assert.deepEqual(at('/foobar'), { type: 'unknown_command', name: 'foobar' });
  assert.deepEqual(at('/foobar with words'), { type: 'unknown_command', name: 'foobar' });
  assert.equal(at('/find nanoGPT').name, 'search_resources');
});
