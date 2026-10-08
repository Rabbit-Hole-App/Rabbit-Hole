// The creator profile and the Analytics UI in the browser (docs/features/creator-profile.md, creator-analytics-contract.md):
// /@handle routed to anyone, Explore's search and creator row, the owner-only Analytics in its typed not_collected state,
// and no number that is not a canonical public counter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPLAINER_SECTIONS, INSUFFICIENT, NOT_COLLECTED, RANGES, TRAFFIC_SOURCES, counter, creatorAnalytics, explainerAnalytics, metricText } from './creator-analytics.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('analytics: every behavior metric is not collected; the only numbers are FORK_COUNT and the public explainer count', () => {
  const one = explainerAnalytics({ forkCount: 4 });
  assert.equal(one.state, 'not_collected');
  assert.deepEqual(one.insights, [], 'no insight without telemetry evidence');
  for (const [key, metric] of Object.entries(one.metrics)) assert.deepEqual(metric, key === 'fork_count' ? { value: 4, suppressed: false } : NOT_COLLECTED, key);
  for (const [, metric] of Object.entries(one.traffic)) assert.deepEqual(metric, NOT_COLLECTED);
  assert.deepEqual(Object.keys(one.traffic), TRAFFIC_SOURCES.map(([key]) => key));
  assert.deepEqual(one.revisions, NOT_COLLECTED);
  assert.equal(EXPLAINER_SECTIONS.flatMap(s => s.rows).length, Object.keys(one.metrics).length);
  const all = creatorAnalytics({ explainerCount: 2, forkCount: 5, explainers: [{ title: 'A', url: '/e/a', fork_count: 4 }, { title: 'B', url: '/e/b', fork_count: 1 }] });
  assert.deepEqual([all.totals.fork_count.value, all.totals.explainer_count.value], [5, 2]);
  for (const key of ['unique_learners', 'avg_active_seconds', 'rabbit_holes_started']) assert.deepEqual(all.totals[key], NOT_COLLECTED, key);
  assert.deepEqual(all.explainers.map(e => [e.learners, e.avg_active_seconds, e.rabbit_hole_start_rate, e.fork_count.value]), [[NOT_COLLECTED, NOT_COLLECTED, NOT_COLLECTED, 4], [NOT_COLLECTED, NOT_COLLECTED, NOT_COLLECTED, 1]]);
  for (const key of ['wants_next', 'friction', 'trend']) assert.deepEqual(all[key], NOT_COLLECTED, key);
  assert.deepEqual(RANGES.map(r => r.id), ['7d', '30d', 'all']);
});

test('analytics: the typed states read as words, never 0 or an estimate', () => {
  assert.equal(metricText(NOT_COLLECTED), 'Not collected yet');
  assert.equal(metricText(INSUFFICIENT), 'Not enough learners yet (fewer than 10)');
  assert.deepEqual(INSUFFICIENT, { value: null, suppressed: true, reason: 'insufficient_cohort' });
  assert.equal(metricText(counter(1234)), '1,234');
  assert.equal(metricText(counter(0)), '0', 'a public counter shows at any count');
  assert.deepEqual(counter(undefined), NOT_COLLECTED, 'no canonical number, no number');
});

test('analytics: ⋮ → Analytics is in the owner\'s canvas menu only, for a public canvas only; the views fetch nothing', () => {
  const library = read('./LibraryViews.jsx');
  const owned = library.slice(library.indexOf(') : menu?.a.canEdit ? <>'), library.indexOf('</> : null}'));
  assert.match(owned, /\{menu\.a\.access === 'public' && <MenuItem icon=\{BarChart3\} data-menu-analytics/);
  assert.equal(library.split('data-menu-analytics').length, 2, 'nowhere else');
  const views = read('./CreatorAnalytics.jsx') + read('./creator-analytics.js');
  assert.doesNotMatch(views, /fetch\(|api\(|email/, 'no analytics route exists yet (#62 storage awaits GO)');
  const profile = read('./CreatorProfile.jsx');
  assert.match(profile, /\{own && analytics && <CreatorDashboard profile=\{p\} /, 'the creator dashboard: your own profile only, beside it');
});

test('/@handle: routed to anyone in Rabbit Hole, served by the dev worker, and the owner-only parts are only the owner\'s', () => {
  const main = read('./main.jsx');
  assert.match(main, /const CreatorProfilePage = previewBuild \? lazy\(\(\) => import\('\.\/CreatorProfile\.jsx'\)\) : null;/);
  assert.match(main, /const CREATOR = \/\^\\\/@\(\[A-Za-z0-9_\]\{1,40\}\)\$\/;/);
  assert.match(read('../dev-worker.js'), /\/\^\\\/@\[A-Za-z0-9_\]\{1,40\}\$\/\.test\(path\)/);
  const profile = read('./CreatorProfile.jsx');
  assert.match(profile, /\{own && <span data-own-profile className="[^"]+"><OwnerCheck owned \/>Your profile<\/span>\}/, 'the blue check on your own profile only');
  assert.equal(profile.split('<OwnerCheck').length, 2);
  assert.match(profile, /\{own && \(\n\s+<div className="flex shrink-0 gap-2 pt-1">\n\s+<Button size="sm" variant="secondary" data-edit-profile/);
  assert.match(profile, /<PublicCards cards=\{p\.explainers\} me=\{me\?\.handle \|\| null\} attr="data-profile-card" \/>/, 'Explore\'s own card list');
  const code = (profile + read('./home/PublicCards.jsx')).replace(/\/\/[^\n]*|\{\/\*[\s\S]*?\*\/\}/g, ''); // what renders, not the comments
  assert.doesNotMatch(code, /\.email\b|followers?\b|\bFollow\b|\blikes?\b|subscribe|verified|reputation/i, 'no email, no social features');
});

// Owner, 2026-10-08: "make sure i am always able to click on @handles to go to the creator and see their cards" - every
// @handle links to /@handle (Library, Home, Explore and profile cards, fork provenance, a share's or publication's header).
// The profile shows only what that creator published.
test('every @handle links to its creator\'s profile: every card, fork provenance, and the shared header', () => {
  const card = read('./home/LearningCard.jsx');
  assert.match(card, /\? <a data-creator-link href=\{creatorHref\} title="Open the creator's profile" onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(card, /const creatorHref = given \|\| m\.creator\?\.url;/, 'Library and Home cards link through cardModel');
  assert.match(read('./home/provenance.js'), /sourceOwner: false, url: `\/@\$\{a\.owner_handle\}` \}/);
  assert.match(read('./home/PublicCards.jsx'), /creatorHref=\{card\.creator\?\.handle \? `\/@\$\{card\.creator\.handle\}` : null\}/);
  assert.match(read('./home/Provenance.jsx'), /\{f\.creatorUrl\n\s+\? <a data-forked-from-creator href=\{f\.creatorUrl\}/);
  const shared = read('./SharedBoardPage.jsx');
  assert.match(shared, /\{shared\.creator\.handle\n\s+\? <a data-creator-link href=\{`\/@\$\{shared\.creator\.handle\}`\}/, 'a share link\'s header links too');
});

// Owner, 2026-10-08: Explore is two tabs, Explainers (default, with Sort) and Creators; the search applies to the active tab
// only, and the tab is in the URL so a reload keeps it.
test('Explore: Explainers and Creators tabs; each tab asks the server for its own search; the card list is the shared one', async () => {
  const home = read('./Home.jsx');
  const explore = home.slice(home.indexOf('function Explore()'));
  const { exploreTab, EXPLORE_TABS } = await import('./home/card-sort.js');
  assert.deepEqual(EXPLORE_TABS, [['explainers', 'Explainers'], ['creators', 'Creators']]);
  assert.deepEqual(['', '?tab=creators', '?tab=bogus', '?tab=explainers'].map(exploreTab), ['explainers', 'creators', 'explainers', 'explainers']);
  assert.match(explore, /window\.history\.replaceState\(window\.history\.state, '', next === 'creators' \? '\/explore\?tab=creators' : '\/explore'\);/);
  assert.match(explore, /if \(tab !== 'explainers'\) return;\n\s+let live = true;\n\s+fetch\(`\/api\/learn\/boards\/published/);
  assert.match(explore, /if \(tab !== 'creators'\) return;\n\s+let live = true;\n\s+fetch\(`\/api\/learn\/creators\$\{q && `\?\$\{q\}`\}`/);
  assert.match(explore, /const searchLabel = tab === 'creators' \? 'Search creators' : 'Search explainers';/);
  assert.match(explore, /\{tab === 'explainers' && cards\?\.length !== 0 && <SortMenu /, 'Sort stays on Explainers');
  assert.doesNotMatch(explore, /Creators to explore|data-creator-row/, 'the creators row left the Explainers feed');
  assert.match(read('./home/PublicCards.jsx'), /export const CreatorAvatar = \(\{ c, className \}\) => <Avatar email=\{c\.name \|\| c\.handle\} src=\{c\.avatar\}/, 'the initials come from the name or @handle');
});
