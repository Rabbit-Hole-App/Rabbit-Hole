// Explore publishing in the browser (docs/features/explore-publish.md): /e/<token> opens the same read-only shared page,
// the Share panel's Publish to Explore / Remove from Explore, a published board kept live, the Explore list, and a
// Publish without a handle that asks for one and carries on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharingOf } from './canvas-persist.js';
import { signInForAsk } from './shared-ask.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; };

test('/e/<token> opens the shared page, served to anyone like /b/<token>', () => {
  assert.match(read('./main.jsx'), /const SHARED_BOARD = \/\^\\\/\[be\]\\\/\(\[A-Za-z0-9_-\]\{20,64\}\)\$\/;/);
  assert.match(read('../dev-worker.js'), /\/\^\\\/\[be\]\\\/\[A-Za-z0-9_-\]\{20,64\}\$\/\.test\(path\)/);
  // Signed out, Ask goes through sign-in and comes back to the page it was on - /e stays /e.
  assert.equal(signInForAsk('tok', 'q', memory(), '/e/tok'), `/login?next=${encodeURIComponent('/e/tok?ask=1')}`);
  assert.equal(signInForAsk('tok', 'q', memory()), `/login?next=${encodeURIComponent('/b/tok?ask=1')}`, 'a share keeps /b');
  assert.match(read('./SharedBoardPage.jsx'), /signInForAsk\(token, text, undefined, window\.location\.pathname\)/);
});

test('a board published to Explore keeps its server copy live, as a shared one does', () => {
  assert.equal(sharingOf({ shared: false, published: true }), 'shared');
  assert.equal(sharingOf({ shared: false }), 'private');
  assert.equal(sharingOf(null), 'unknown');
});

test('the Share panel: Publish to Explore is its own action, says it is public and live, and has its own /e link', () => {
  const panel = read('./SharePanel.jsx');
  const row = panel.slice(panel.indexOf('function ExploreRow('), panel.indexOf('export default function SharePanel'));
  assert.match(row, /const url = token \? `\$\{window\.location\.origin\}\/e\/\$\{token\}` : '';/);
  assert.match(row, /data-publish[^>]*onClick=\{\(\) => onPublish\(true\)\}[^>]*>Publish to Explore</);
  assert.match(row, /data-unpublish[^>]*onClick=\{\(\) => onPublish\(false\)\}[^>]*>Remove from Explore</);
  assert.match(row, /as it is now and with your later edits - until you remove it/);
  assert.match(panel, /\{onPublish && <ExploreRow published=\{!!current\.published\} token=\{current\.publication\}/, 'outside the share switch: publishing never needs a share link');
});

test('Publish pushes the board first, only for a top-level canvas, and a missing handle asks for one and carries on', () => {
  const learn = read('./LearnPage.jsx');
  const fn = learn.slice(learn.indexOf('const changePublication = async publish => {'), learn.indexOf('const changeRepositoryAccess'));
  assert.match(fn, /if \(publish\) \{\n\s+await pushQueue\(saveBoard\);\n\s+await syncAssets\(\);/, 'the board PUT, through the push queue, then its files');
  assert.match(fn, /api\(`\/api\/apps\/\$\{app\.name\}\/\$\{publish \? 'publish' : 'unpublish'\}`, \{ method: 'POST', body: '\{\}' \}\)/);
  assert.match(fn, /if \(error\.status === 409 && error\.data\?\.needsHandle\) setChoosingHandle\(true\);/);
  assert.match(learn, /onPublish=\{isCanvas && !hole && !board \? changePublication : null\}/);
  assert.match(learn, /<ChooseHandle onDone=\{\(\) => \{ setChoosingHandle\(false\); changePublication\(true\); \}\} \/>/);
});

// The card redesign (docs/features/card-redesign.md): Explore renders the canonical LearningCard the Library and Home use.
test('Explore lists the published canvases on the canonical card: title, the creator @handle, the fork count, and the /e link', () => {
  const home = read('./Home.jsx');
  const explore = home.slice(home.indexOf('function Explore()'));
  assert.match(explore, /fetch\(`\/api\/learn\/boards\/published\?sort=\$\{order\}\$\{q && `&\$\{q\}`\}`/, 'the server sorts (and searches)');
  assert.match(explore, /<PublicCards cards=\{cards\} me=\{me\} attr="data-explore-card" \/>/);
  // The card list Explore and the creator profile share (docs/features/creator-profile.md).
  const all = read('./home/PublicCards.jsx'), cards = all.slice(0, all.indexOf('export const CreatorAvatar'));
  assert.match(cards, /<LearningCard key=\{card\.url\} kind="canvas" m=\{m\} attrs=\{\{ \[attr\]: '' \}\} href=\{card\.url\}/);
  assert.match(cards, /owner_handle: card\.creator\?\.handle, owner_name: card\.creator\?\.name/, 'cardModel\'s @handle attribution, as on every card');
  assert.match(cards, /fork_count: card\.fork_count/, 'the same Forks the Library cards show');
  for (const text of [explore, cards]) assert.doesNotMatch(text, /email|ranking|\.sort\(/i, 'no email; the server\'s order, no client reordering');
  const card = read('./home/LearningCard.jsx');
  assert.match(card, /\{m\.forkCount !== null && <Forks m=\{\{ forks: forkLabel\(m\.forkCount\) \|\| '0 forks' \}\} \/>\}/);
});

// Every owned board is on the server now (docs/features/canvas-persistence.md), so its files and notebook workspaces are
// too; only a review board (?board=) still waits for sharing, where a publication counts as shared.
test('a published board keeps its files and notebook workspaces live too, not only its board', () => {
  const learn = read('./LearnPage.jsx');
  assert.match(learn, /save: \(id, files\) => \(\(!board \|\| sharingOf\(sharingRef\.current\) === 'shared'\) && boardVersion\.current != null && !boardStopped\.current/);
  assert.match(learn, /\/\/ Runs after a board PUT, so the board has its server row\.\n\s+const syncAssets = async \(\) => \{\n\s+try \{/);
  assert.doesNotMatch(learn, /sharingRef\.current\?\.shared/, 'no gate that forgets a publication');
});
