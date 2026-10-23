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

test('analytics: ⋮ → Analytics is in the owner\'s canvas menu only, for a public canvas only; the views fetch nothing', async () => {
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  // One card menu list since 2026-10-09 (home/card-menu-items.js): a canvas owner row, shown for a public canvas only.
  const { CARD_MENU } = await import('./home/card-menu-items.js');
  assert.deepEqual(CARD_MENU.find(i => i.id === 'analytics'), { id: 'analytics', label: 'Analytics', icon: 'BarChart3', types: ['canvas'], owner: true });
  assert.match(library, /id === 'analytics' \? a\.access === 'public'/);
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
  assert.match(shared, /\{shared\.creator\?\.handle && <span data-shared-creator[^\n]*\n\s+<a data-creator-link href=\{`\/@\$\{shared\.creator\.handle\}`\}/, 'a share link\'s header links too');
});

// Owner, 2026-10-08: Explore is two tabs, Canvases (default, with Sort; "Explainers" until 2026-10-09, "Learning Boards" until
// the owner brief 2026-10-23) and Creators; the search applies to the active tab only, and the tab is in the URL so a reload keeps it.
test('Explore: Canvases and Creators tabs; each tab asks the server for its own search; the card list is the shared one', async () => {
  const home = read('./Home.jsx');
  const explore = home.slice(home.indexOf('function Explore()'));
  const { exploreTab, EXPLORE_TABS } = await import('./home/card-sort.js');
  assert.deepEqual(EXPLORE_TABS, [['explainers', 'Canvases'], ['creators', 'Creators']], 'the tab id stays an identifier');
  assert.deepEqual(['', '?tab=creators', '?tab=bogus', '?tab=explainers'].map(exploreTab), ['explainers', 'creators', 'explainers', 'explainers']);
  assert.match(explore, /window\.history\.replaceState\(window\.history\.state, '', next === 'creators' \? '\/explore\?tab=creators' : '\/explore'\);/);
  assert.match(explore, /if \(tab !== 'explainers'\) return;\n\s+let live = true;\n\s+fetch\(`\/api\/learn\/boards\/published/);
  assert.match(explore, /if \(tab !== 'creators'\) return;\n\s+let live = true;\n\s+fetch\(`\/api\/learn\/creators\$\{q && `\?\$\{q\}`\}`/);
  assert.match(explore, /const searchLabel = tab === 'creators' \? 'Search creators' : 'Search canvases';/);
  assert.match(explore, /\{tab === 'explainers' && cards\?\.length !== 0 && <SortMenu /, 'Sort stays on Canvases');
  // Owner brief 2026-10-23: the subtitle, a blue underline and a focus ring on the tabs, the page's plain background.
  assert.match(explore, />Discover canvases and the people behind them\.<\/p>/);
  assert.match(home, /const EXPLORE_TAB = '[^']*data-\[state=active\]:border-accent! [^']*focus-visible:outline-accent';/);
  assert.match(explore, /<TabsTrigger key=\{id\} value=\{id\} className=\{EXPLORE_TAB\}>/);
  assert.match(explore, /<main data-explore className="browse-page flex-1 overflow-y-auto bg-none!">/, 'no dot grid (index.css main)');
  // The matching creator count is the server's total, past the list's cap.
  assert.match(explore, /setCreatorTotal\(data\.total \?\? \(data\.creators \|\| \[\]\)\.length\)/);
  assert.match(explore, /\{creatorTotal\} \{creatorTotal === 1 \? 'creator' : 'creators'\}/);
  assert.doesNotMatch(explore, /Creators to explore|data-creator-row/, 'the creators row left the Explainers feed');
  assert.match(read('./home/PublicCards.jsx'), /export const CreatorAvatar = \(\{ c, className \}\) => <Avatar email=\{c\.name \|\| c\.handle\} src=\{c\.avatar\}/, 'the initials come from the name or @handle');
});

// Owner brief 2026-10-23 (replaces the square cards of 2026-10-08/09): compact rows - picture, display name, the blue @handle
// link, the description in two lines at most, the non-zero public counts, and a separate View profile link with ArrowRight.
test('creator rows: picture, name, @handle link, two-line description, non-zero counts, View profile; no chain-link, the row is not a link', () => {
  const cards = read('./home/PublicCards.jsx');
  const row = cards.slice(cards.indexOf('function CreatorRow'), cards.indexOf('export function CreatorCards'));
  assert.match(row, /<li data-creator-card=\{c\.handle\} className="[^"]*\bp-6\b[^"]*max-sm:flex-col/, 'a row, 24px padding; stacked on a phone');
  assert.match(row, /<CreatorAvatar c=\{c\} className="h-12 w-12 text-lg! sm:h-16 sm:w-16 sm:text-2xl!" \/>/, '48px on a phone, 64px above');
  assert.match(row, /\{c\.name && <p data-creator-name [^>]*>\{c\.name\}<\/p>\}/, 'the saved display name, omitted when unset');
  assert.match(row, /<a data-creator-handle href=\{c\.url\} className=\{`[^`]*text-accent[^`]*`\}>@\{c\.handle\}<\/a>/, 'the blue @handle opens /@handle');
  assert.match(row, /\{c\.description && <p data-creator-description className="line-clamp-2 break-words [^"]*">\{c\.description\}<\/p>\}/, 'two lines at most, text, no empty line');
  assert.match(row, /c\.project_count && count\(c\.project_count, 'project', 'projects'\), c\.explainer_count && count\(c\.explainer_count, 'canvas', 'canvases'\)\]\.filter\(Boolean\)/, 'a zero count is hidden');
  assert.match(row, /<a data-creator-view href=\{c\.url\} [^>]*>\r?\n\s+View profile<ArrowRight /, 'View profile, a second link to the same profile');
  assert.equal((row.match(/<a /g) || []).length, 2, 'two links; the row itself is not one');
  assert.doesNotMatch(row, /CopyProfileLink|Link2|MoreHorizontal|Ellipsis/, 'no chain-link, no overflow icon');
  assert.match(cards, /<ul data-creator-cards className="flex flex-col gap-3 sm:gap-4">/, 'one per line, 12-16px apart');
  assert.match(cards, /kind === 'creators' \? <CreatorCards creators=\{picks\} \/>/, 'Recommended creators: the same rows');
  assert.match(read('./Home.jsx'), /\{creators\?\.length > 0 && <CreatorCards creators=\{creators\} \/>\}/, 'the Creators tab: the same rows');
});

test('the profile description: edited in Settings > Profile (160 characters, as the server caps it), shown under the name on /@handle as text', async () => {
  const settings = read('./RabbitHoleSettings.jsx'); // Rabbit Hole's Settings (owner L11; it moved out of Sidebar.jsx)
  assert.match(settings, /<HandleRow profile=\{profile\} \/>\n\s+<DescriptionRow profile=\{profile\} \/>/, 'beside name and handle');
  const { DESCRIPTION_MAX } = await import('../../control-plane/src/profile.js');
  assert.match(settings, new RegExp(`const DESCRIPTION_MAX = ${DESCRIPTION_MAX};`), 'the field\'s cap is the server\'s');
  assert.match(settings, /await saveProfile\(\{ description: value \}\)/);
  const profile = read('./CreatorProfile.jsx');
  assert.match(profile, /const description = own \? me\.description : p\?\.description;/, 'your own follows Settings at once');
  assert.match(profile, /<\/div>\n\s+\{\/\*[^\n]*\*\/\}\n\s+\{description && <p data-profile-description className="[^"]+">\{description\}<\/p>\}\n\s+<p data-profile-stats/, 'under the name and @handle, above the counters');
  // Escaped by React as a text child: no HTML injection, and no linkifying of the description anywhere it shows.
  for (const file of ['./CreatorProfile.jsx', './home/PublicCards.jsx', './Sidebar.jsx', './RabbitHoleSettings.jsx']) assert.doesNotMatch(read(file), /dangerouslySetInnerHTML/, file);
});

// Owner, 2026-10-08: "Cretors card and in Creator profile should have a copy profile url button".
test('Copy profile link: the absolute /@handle only, on the profile beside the name (not on a Creators row); in place, no navigation', async () => {
  const { profileUrl } = await import('./home/provenance.js');
  assert.equal(profileUrl('https://digrabbithole.com', 'ada_l'), 'https://digrabbithole.com/@ada_l');
  assert.equal(profileUrl('http://127.0.0.1:8848', null), null, 'no handle, no link - never an email or an id');
  const cards = read('./home/PublicCards.jsx'), profile = read('./CreatorProfile.jsx');
  // The button copies profileUrl(origin, handle), says so on itself, reverts, and stops the click from reaching the card.
  assert.match(cards, /event\.preventDefault\(\); event\.stopPropagation\(\);\n\s+try \{ await navigator\.clipboard\.writeText\(profileUrl\(window\.location\.origin, handle\)\); setCopied\('Profile link copied'\); \}/);
  assert.match(cards, /timer\.current = setTimeout\(\(\) => setCopied\(null\), 1600\);/);
  const button = cards.slice(cards.indexOf('export function CopyProfileLink'), cards.indexOf('function CreatorRow'));
  assert.doesNotMatch(button, /toast\(/, 'no corner toast');
  // The button says it on itself, then reverts (the compact icon-only form left with the creator cards: owner brief 2026-10-23).
  assert.match(button, /const Icon = copied \? Check : Link2;\n\s+const label = copied \|\| 'Copy profile link';/);
  assert.match(button, /aria-label=\{label\} title=\{label\}/);
  assert.match(button, /<span aria-live="polite">\{label\}<\/span>/);
  // On the profile, in the name and handle row, for every viewer (no own or signed-in condition).
  assert.match(profile, /\{p\.name && <span data-profile-handle>@\{p\.handle\}<\/span>\}\n[\s\S]{0,400}<CopyProfileLink handle=\{p\.handle\} \/>/);
  assert.doesNotMatch(profile, /\{own && <CopyProfileLink|\{me && <CopyProfileLink/);
});

// Owner, 2026-10-08: "in creators profile put a search bar so they can search projects or canvas by name for that specific creator".
test('profile search: the projects a search names come from the public cards it returned, any case, counted', async () => {
  const { matchingProjects } = await import('./home/provenance.js');
  const cards = [{ title: 'Attention', project: 'karpathy/nanoGPT' }, { title: 'Softmax', project: 'karpathy/nanoGPT' }, { title: 'Flash', project: null }, { title: 'IK', project: 'acme/robots@dev' }];
  assert.deepEqual(matchingProjects(cards, 'NANO'), [['karpathy/nanoGPT', 2]]);
  assert.deepEqual(matchingProjects(cards, ' @robots '), [['acme/robots@dev', 1]], 'trimmed, a leading @ dropped as the server does');
  assert.deepEqual(matchingProjects(cards, 'flash'), [], 'a canvas title is no project');
  assert.deepEqual(matchingProjects(cards, ''), [], 'no term, no projects');
  assert.deepEqual(matchingProjects([], 'nano'), []);
});

test('profile search: one field above the list for every viewer, filtered on the server, Esc clears, a plain empty line', () => {
  const profile = read('./CreatorProfile.jsx');
  assert.match(profile, /fetch\(`\/api\/learn\/creators\/\$\{encodeURIComponent\(handle\)\}\?sort=\$\{sort\}\$\{term \? `&q=\$\{encodeURIComponent\(term\)\}` : ''\}`/, 'the server filters: the list is capped');
  assert.match(profile, /\{p\.explainer_count > 0 && \(\n\s+<label className="relative block w-72 min-w-0 max-md:order-last max-md:w-full">/, 'shown whenever the creator has something public - signed out too, no own or me condition');
  assert.match(profile, /<Input type="search" data-profile-search aria-label="Search projects and canvases" placeholder="Search projects and canvases"/);
  assert.match(profile, /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); setTyped\(''\); setTerm\(''\); \} \}\}/, 'Esc clears');
  assert.match(profile, /<Search size=\{15\} strokeWidth=\{1\.75\} className="pointer-events-none absolute left-3 top-1\/2 -translate-y-1\/2 text-ink-3" \/>/, 'Explore\'s field');
  assert.match(read('./Home.jsx'), /<Search size=\{15\} strokeWidth=\{1\.75\} className="pointer-events-none absolute left-3 top-1\/2 -translate-y-1\/2 text-ink-3" \/>\n\s+<Input type="search" data-explore-search [^\n]*className="h-9 w-full pl-9" \/>/, 'the same look as Explore');
  assert.match(profile, /\{p\.q && <ProjectMatches projects=\{matchingProjects\(p\.explainers, p\.q\)\} \/>\}\n\s+\{p\.q && p\.explainers\.length > 0 && <h3 className="pb-2 text-xs text-ink-2">Canvases<\/h3>\}/, 'projects, then canvases, each labelled');
  assert.match(profile, /: p\.q \? <p data-profile-search-empty className="text-sm text-ink-3">No canvases or projects match &ldquo;\{p\.q\}&rdquo;\.<\/p>/);
  assert.match(profile, /<PublicCards cards=\{p\.explainers\} me=\{me\?\.handle \|\| null\} attr="data-profile-card" \/>/, 'results on the same cards');
});

// Owner, 2026-10-09: "Rename "Explainers" to "Learning Boards"". The published-canvas copy on Explore, the creator profile
// and creator analytics says learning board(s); identifiers (the tab id `explainers`, explainer_count, data attributes)
// and the Motion explainer, a different thing, keep their names.
test('rename: no Explore, creator profile or creator analytics string says explainer; the new copy is in place', () => {
  // UI copy: string literals with a space or a capital, and JSX text - so identifiers such as the 'explainers' tab id pass.
  const copy = src => {
    const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
    return [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]*[A-Za-z][^<>{}\n]*)[<{]/g)].map(m => m[1] ?? m[2] ?? m[3] ?? m[4]).filter(s => /\s|[A-Z]/.test(s));
  };
  const home = read('./Home.jsx');
  const sources = { Explore: home.slice(home.indexOf('function Explore()')), 'card-sort.js': read('./home/card-sort.js'), 'CreatorProfile.jsx': read('./CreatorProfile.jsx'),
    'PublicCards.jsx': read('./home/PublicCards.jsx'), 'CreatorAnalytics.jsx': read('./CreatorAnalytics.jsx'), 'creator-analytics.js': read('./creator-analytics.js') };
  for (const [name, src] of Object.entries(sources)) assert.deepEqual(copy(src).filter(s => /explainer/i.test(s)), [], name);
  const profile = read('./CreatorProfile.jsx'), analytics = read('./CreatorAnalytics.jsx');
  assert.match(profile, /plural\(p\.explainer_count, 'public learning board'\)/, '1 public learning board, 3 public learning boards');
  assert.match(profile, />Public Learning Boards<\/h2>/);
  assert.match(analytics, /<Section title="Learning Board comparison"/);
  assert.match(read('./creator-analytics.js'), /\['explainer_count', 'Public learning boards', 'all'\]/);
  assert.match(read('./learn-video-label.js'), /Motion explainer/, 'the Motion explainer keeps its name');
});

// Owner, 2026-10-09: "Explore should have a filter for Projects or Canvas"; "same filter as library?" - yes: the Library's
// LibraryFilters and ActiveFilters, its Type labels and its ?type= values, for the two types Explore lists.
test('Explore and the Library render the same Filters control with the same Type labels; Explore shows Projects and Canvas only', async () => {
  const { EXPLORE_TYPES, TYPES } = await import('./library-filter.js');
  assert.deepEqual(EXPLORE_TYPES.map(k => TYPES[k].label), ['Projects', 'Canvas'], 'the Library\'s own labels');
  const home = read('./Home.jsx'), explore = home.slice(home.indexOf('function Explore()'));
  assert.match(home, /import \{ ActiveFilters, LibraryFilters \} from '\.\/LibraryViews\.jsx';/);
  assert.match(explore, /\{tab === 'explainers' && <LibraryFilters type=\{type\} path="\/explore" types=\{EXPLORE_TYPES\} \/>\}\n\s+\{tab === 'explainers' && cards\?\.length !== 0 && <SortMenu /, 'beside Sort, as in the Library');
  assert.match(explore, /<ActiveFilters type=\{type\} path="\/explore" \/>/, 'the same active-filter chip');
  assert.match(read('./App.jsx'), /<LibraryFilters type=\{type\} section=\{section\} archived=\{archived\} menuClass=\{[^\n]*\} \/>/, 'the Library\'s (its menu opens left when the search is hidden; owner brief 2026-10-23)');
  const views = read('./LibraryViews.jsx'), control = views.slice(views.indexOf('export function LibraryFilters'), views.indexOf('export function ActiveFilters'));
  assert.match(control, /\{types\.map\(\(k\) => item\(TYPES\[k\]\.label, /, 'one row per type, its Library label');
  for (const own of ["{library && item('Archived canvas'", "{library && heading('Ownership')}", '{library && Object.entries(SCOPES)']) assert.ok(control.includes(own), `the Library's alone: ${own}`);
  // Projects: one card per project, opening Explore's project filter; the empty lines say which.
  assert.match(explore, /listed === 'projects' \? <div data-explore-projects-list><ProjectCards projects=\{cards\} \/><\/div>/);
  assert.match(home, /const EXPLORE_EMPTY = \{ projects: 'No projects match', canvases: 'No canvases match' \};/);
  const cards = read('./home/PublicCards.jsx'), projects = cards.slice(cards.indexOf('export function ProjectCards'), cards.indexOf('export function ProjectFilter'));
  assert.match(projects, /canvases: count\(p\.boards, 'learning board', 'learning boards'\)/);
  assert.match(projects, /href=\{p\.url\} onOpen=\{\(\) => navigate\(p\.url\)\}/, 'it opens /explore?project=, the existing project view');
});
