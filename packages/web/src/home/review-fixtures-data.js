// REVIEW FIXTURE DATA - Rabbit Hole preview build only. Loaded on demand by useFixtures
// (review-fixtures.js) and only when a preview URL asked for ?fixtures=1; the live build never
// even emits this chunk. Field names mirror the future contract: source_owner_verified,
// forked_from_resource_id, forked_from_creator, fork_count.
const yudhisteer = { name: 'Yudhisteer' }, karpathy = { name: 'Karpathy', source_owner_verified: true };
const day = (n) => new Date(Date.UTC(2026, 8, 28 - n)).toISOString().slice(0, 19).replace('T', ' ');
const base = { fixture: true, visibility: 'domain', forked_from_resource_id: null, forked_from_title: null, forked_from_creator: null };

export const FIXTURES = [
  // 1. Original project from the user's own repository: check, meaningful fork count.
  { ...base, name: 'fixture-proj-nanogpt-lab', kind: 'repository', title: 'nanoGPT from First Principles', repo: 'yudhisteer/nanogpt-lab', commit_sha: '9c1e4b2a', status: 'ready',
    creator: yudhisteer, source_owner_verified: true, summary: 'Build and understand a tiny GPT.', fork_count: 84, created_at: day(1) },
  // A popular project by someone who does not own the source: no check, compact count.
  { ...base, name: 'fixture-proj-annotated-transformer', kind: 'repository', title: 'Attention Is All You Need, Line by Line', repo: 'harvardnlp/annotated-transformer', commit_sha: '4f2d9e10', status: 'ready',
    creator: { name: 'Alice' }, source_owner_verified: false, summary: 'The paper, one runnable cell at a time.', fork_count: 1240, created_at: day(6) },
  { ...base, name: 'fixture-proj-minbpe', kind: 'repository', title: 'minbpe, Explained', repo: 'karpathy/minbpe', commit_sha: '1a7c3d55', status: 'ready',
    creator: karpathy, source_owner_verified: true, summary: 'Byte-pair encoding, merge by merge.', fork_count: 1, created_at: day(9) },
  // 2. Original learn canvas from the user's own repository: check, fork count.
  { ...base, name: 'fixture-canvas-nanogpt-internals', kind: 'canvas', title: 'nanoGPT Internals', source_repo: 'yudhisteer/nanogpt-lab',
    creator: yudhisteer, source_owner_verified: true, summary: 'How the forward pass fits together.', fork_count: 1, created_at: day(2) },
  // 3. Forks of another creator's canvas: no check on the forking user; the original keeps its check.
  { ...base, name: 'fixture-canvas-attention-deep-dive', kind: 'canvas', title: 'My Attention Deep Dive', creator: { name: 'Maya' }, source_owner_verified: false,
    forked_from_resource_id: 'fixture-proj-nanogpt-lab', forked_from_title: 'nanoGPT from First Principles', forked_from_creator: { name: 'Yudhisteer', source_owner_verified: true },
    fork_count: 12, created_at: day(0) },
  { ...base, name: 'fixture-canvas-transformer-deep-dive', kind: 'canvas', title: 'Transformer Deep Dive', creator: { name: 'Alice' }, source_owner_verified: false,
    forked_from_resource_id: 'fixture-canvas-karpathy-internals', forked_from_title: 'nanoGPT Internals', forked_from_creator: karpathy, summary: 'Where the residual stream goes.',
    fork_count: 24, created_at: day(3) },
  // Same display name as a source owner, no verified relationship: no check (never inferred from names).
  { ...base, name: 'fixture-canvas-speedrun-notes', kind: 'canvas', title: 'nanoGPT speedrun notes', creator: { name: 'Karpathy' }, source_owner_verified: false,
    forked_from_resource_id: 'fixture-canvas-karpathy-internals', forked_from_title: 'nanoGPT Internals', forked_from_creator: karpathy, fork_count: 2, created_at: day(5) },
  // 4. Normal standalone canvases: no repository provenance, no check.
  { ...base, name: 'fixture-canvas-btrees', kind: 'canvas', title: 'Why B-trees stay shallow', creator: yudhisteer, source_owner_verified: false, fork_count: 0, created_at: day(4) },
  { ...base, name: 'fixture-canvas-fourier', kind: 'canvas', title: 'Reading a Fourier transform when the signal has more than one frequency', creator: { name: 'Priya' }, source_owner_verified: false,
    summary: 'What each frequency bin is telling you.', fork_count: 2, created_at: day(7) },
  // 5. A runnable app: an operational row, the only fixture with Run.
  { ...base, name: 'fixture-nightly-eval', kind: 'job', title: null, deployed_at: day(1), created_at: day(20),
    lastRun: { runId: 'r-fixture', status: 'finished', startedAt: day(0) } },
];

// Home Recent with fixtures on: an original, a fork, and an original canvas lead the list.
export const RECENT_FIXTURES = ['fixture-proj-nanogpt-lab', 'fixture-canvas-attention-deep-dive', 'fixture-canvas-nanogpt-internals'];

// 6. WP6 App -> source Project: the backend records no app->project relationship yet, so with ?fixtures=1 every
// job and server claims this one, labelled "Fixture · UI preview". Never inferred from repo_url (provenance.js).
export const BUILT_FROM = 'karpathy/nanoGPT';
