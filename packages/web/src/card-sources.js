// Evidence behind a teaching card, declared as data on the block
// (`block.sources`) and shown collapsed under the card by SourcesDisclosure.
// The card itself keeps only a short status label ("Calculated toy example");
// citations, line references and generation notes live here. Nothing in this
// module knows which card, repository or lesson it describes.

export const SOURCE_GROUPS = [
  { id: 'code', label: 'Code', kinds: ['code'] },
  { id: 'docs', label: 'Paper/documentation', kinds: ['paper', 'doc', 'web'] },
  { id: 'data', label: 'Dataset/source material', kinds: ['dataset'] },
  { id: 'example', label: 'Example/calculation provenance', kinds: ['calculation'] },
];

// What kind of evidence a number on the card is. The same words appear as the
// short label inside the card, so the learner can match the two.
export const PROVENANCE_STATUSES = ['Calculated toy example', 'Recorded toy run', 'Live calculation', 'What-if', 'Source value', 'Recorded model output'];

const HTTPS = /^https:\/\/\S+$/;
const text = value => typeof value === 'string' && value.trim().length > 0;
const optionalText = value => value === undefined || typeof value === 'string';

// Problems with one entry; an empty list means it can be shown.
export function sourceProblems(source) {
  if (!source || typeof source !== 'object') return ['not an object'];
  const problems = [];
  if (!optionalText(source.note)) problems.push('note must be text');
  const need = (ok, message) => { if (!ok) problems.push(message); };
  switch (source.kind) {
    case 'code': {
      need(/^[\w.-]+\/[\w.-]+$/.test(source.repo || ''), 'code needs repo "owner/name"');
      need(/^[0-9a-f]{40}$/.test(source.revision || ''), 'code needs the full 40-character revision');
      need(text(source.path) && !source.path.startsWith('/'), 'code needs a repository-relative path');
      const [start, end] = Array.isArray(source.lines) ? source.lines : [];
      need(Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start, 'code needs lines [start, end]');
      break;
    }
    case 'paper':
      need(text(source.title), 'paper needs a title');
      need(/^\d{4}\.\d{4,5}(v\d+)?$/.test(source.arxiv || '') || HTTPS.test(source.url || ''), 'paper needs an arXiv id or an https url');
      need(source.page === undefined || (Number.isInteger(source.page) && source.page >= 1), 'paper page must be a positive integer');
      break;
    case 'doc': case 'web': case 'dataset':
      need(text(source.title), `${source.kind} needs a title`);
      need(HTTPS.test(source.url || ''), `${source.kind} needs an https url`);
      need(source.sha256 === undefined || /^[0-9a-f]{64}$/.test(source.sha256), 'sha256 must be 64 hex characters');
      break;
    case 'calculation':
      need(PROVENANCE_STATUSES.includes(source.status), `calculation status must be one of: ${PROVENANCE_STATUSES.join(', ')}`);
      need(text(source.title), 'calculation needs a title');
      need(text(source.note), 'calculation needs a note saying how the numbers were made');
      need(optionalText(source.reproduce), 'reproduce must be text');
      break;
    default:
      problems.push(`unknown kind "${source.kind}"`);
  }
  return problems;
}

// Stored boards can carry anything; only well-formed entries are shown.
export const validSources = sources => (Array.isArray(sources) ? sources.filter(source => !sourceProblems(source).length) : []);

export function sourceLabel(source) {
  if (source.kind !== 'code') return source.title;
  const [start, end] = source.lines;
  return `${source.path}:${start}${end > start ? `-${end}` : ''}`;
}

// The hosted file at the cited revision and lines. Imported repositories come
// from GitHub (control-plane repositories.js), so that is the one host here.
export function repositoryUrl({ repo, commit, path, line, lineEnd }) {
  const lines = line ? `#L${line}${lineEnd && lineEnd > line ? `-L${lineEnd}` : ''}` : '';
  return `https://github.com/${repo}/blob/${commit}/${path}${lines}`;
}

const WIKIPEDIA = /^https:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/;

// Where a click on the entry goes: code to the source inspector, a paper to the
// paper reader (the lesson page opens arXiv links there), a Wikipedia article to
// the wiki reader, other pages out, and generated numbers nowhere - their
// explanation is the entry itself.
export function sourceTarget(source) {
  if (source.kind === 'code') {
    const [line, lineEnd] = source.lines;
    const file = { repo: source.repo, commit: source.revision, path: source.path, line, lineEnd };
    return { open: 'file', ...file, href: repositoryUrl(file) };
  }
  if (source.kind === 'paper') {
    const href = source.arxiv ? `https://arxiv.org/abs/${source.arxiv}${source.page ? `#page=${source.page}` : ''}` : source.url;
    return { open: 'link', href };
  }
  if (source.kind === 'calculation') return { open: 'detail' };
  const wiki = source.url.match(WIKIPEDIA);
  if (wiki) return { open: 'wiki', title: decodeURIComponent(wiki[1]), href: source.url };
  return { open: 'link', href: source.url };
}

export function groupSources(sources) {
  const valid = validSources(sources);
  return SOURCE_GROUPS.map(group => ({ ...group, items: valid.filter(source => group.kinds.includes(source.kind)) }))
    .filter(group => group.items.length);
}
