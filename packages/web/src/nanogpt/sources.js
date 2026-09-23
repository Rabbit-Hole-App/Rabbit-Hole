// Source entries for the nanogpt cards (the declarative shape is in
// ../card-sources.js). Every code citation is pinned to the connected revision
// the fixtures were generated from; line numbers are checked against the
// sha-pinned files by each card's test.
import fx from './fixtures/nanogpt-fixtures.generated.js';

const { repo, commit } = fx.provenance.nanogpt;
const REPRODUCE = 'python packages/web/src/nanogpt/fixtures/generate_fixtures.py --check';

export const code = (path, start, end, note) => ({ kind: 'code', repo, revision: commit, path, lines: [start, end ?? start], note });

// Numbers made by the fixture generator (status: 'Calculated toy example',
// 'Recorded toy run' or 'Source value') or computed on the card ('Live calculation').
export const calculation = (status, title, note) => ({
  kind: 'calculation', status, title, note, ...(status === 'Live calculation' ? {} : { reproduce: REPRODUCE }),
});

export const tinyShakespeare = note => ({
  kind: 'dataset', title: 'Tiny Shakespeare (input.txt)', url: fx.provenance.dataset.url, sha256: fx.provenance.dataset.sha256, note,
});

export const tiktoken = note => ({ kind: 'doc', title: `tiktoken ${fx.provenance.tiktoken} (GPT-2 BPE encoding)`, url: 'https://github.com/openai/tiktoken', note });
