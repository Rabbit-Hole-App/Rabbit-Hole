import { findConnection } from '../connections.js';
import { kindLabel, lookup, onBranch, repositoriesOf, titleOf } from './catalog.js';

// RulesRouter (T02 §6.6): deterministic, first match wins, no model call. Anything
// unmatched goes to Ask in the frozen scope, whose tools come back as Confirm cards.
const SETTINGS = { settings: {}, preferences: { tab: 'preferences' }, connections: { tab: 'connections' }, theme: { tab: 'preferences' } };
// owner/repository from a GitHub URL anywhere in the text, plus an explicit /tree/<branch>, are kept;
// credentials before '@' never are (parseRepository wants the bare URL, repositories.js:11-17).
const GITHUB = /(?:^|[\s(<"'`])(?:https?:\/\/)?(?:[^\s/@]+@)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/([^\s?#<>"'`)]+))?/i;
// The only words that turn a link into a new project, with the filler people type around them;
// anything else around a link is a question.
const CREATE = /^(?:(?:please|pls|can you|could you|let ?s)\s+)?(?:start (?:a )?(?:new )?rabbit ?hole(?:\s+(?:with|from|on|in|for))?|connect|import)(?:\s+(?:to|this|the|a|my|that))?(?:\s+(?:github\s+)?(?:repo|repository|project))?(?:\s+(?:please|thanks|thank you))?$/i;
const decode = (text) => { try { return decodeURIComponent(text); } catch { return text; } };
// owner/repo alone, or after the creation words, names a GitHub repository (user, 2026-09-28). Narrow:
// the whole message, never inside a question; rewritten to its link so rule 2 decides it as a link.
const SHORTHAND = /^((?:(?:please|pls|can you|could you|let ?s)\s+)?(?:start (?:a )?(?:new )?rabbit ?hole(?:\s+(?:with|from|on|in|for))?|connect|import)\s+)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/i;
// Questions about Rabbit Hole itself, and help (user, 2026-09-28): a built-in answer (agent/help.js).
const HELP = /^(?:\/?help|what can (?:you|i) do(?: here)?)\s*\??$/i;
const CONCEPT = /^(?:what(?:'s|\s+is|\s+are)|explain|define|tell me about)\s+(?:(?:a|an|the)\s+)?(projects?|canvas(?:es)?|apps?|jobs?|servers?|library|explore|mothership|agent bar|source owner(?:\s+(?:badge|check))?)\s*\??$/i;
const conceptOf = (word) => {
  const w = word.toLowerCase();
  if (w.startsWith('project')) return 'project';
  if (w.startsWith('canvas')) return 'canvas';
  if (/^(app|job|server)/.test(w)) return 'app';
  if (w.startsWith('source owner')) return 'source owner';
  return w === 'agent bar' ? 'mothership' : w;
};
// Slash shortcuts (user, 2026-09-28): each is its own sentence, so the rules decide '/find x'
// exactly as they decide 'find x'. /new opens Start on a path and creates nothing. No /share: v1 is solo.
const SHORTCUT = /^\/(find|open|new|connect|run)(?:\s+(.*))?$/i;
const NEW_PATH = { repository: 'repository', repo: 'repository', project: 'repository', canvas: 'blank', 'blank canvas': 'blank', blank: 'blank', question: 'question', sources: 'sources', source: 'sources' };
// Library words (user, 2026-09-28): the Library's own filters and a kind-narrowed catalog search.
const KIND = { project: 'projects', canvas: 'canvases', app: 'apps', job: 'apps', server: 'apps' };
const KINDS = { projects: ['repository'], canvases: ['canvas'], apps: ['job', 'server'] };
const kindOf = (word) => KIND[word.toLowerCase().replace(/(es|s)$/, '').replace(/^canvas$/, 'canvas')] || KIND[word.toLowerCase().replace(/s$/, '')];
// Solo v1: no 'shared with me' or 'in the workspace' scope words; 'my' is the one ownership filter.
const LIBRARY = /^(?:show|list|find|search)\s+(?:me\s+)?(?:(my|all|the)\s+)?(?:runnable\s+)?(projects?|canvas(?:es)?|apps?|jobs?|servers?)(?:\s+(?:about|on|named|called|matching|with|for)\s+(.+))?$/i;
const NAMED_KIND = /^(?:find|search|show)\s+(?:for\s+)?(?:my\s+|the\s+)?(.+?)\s+(project|canvas|app|job|server)(?:e?s)?$/i;
const RECENT = /^(?:open|go to|show)\s+(?:the\s+|my\s+)?(?:(?:last|latest|most recent|recent)\s+(project|canvas|app)|(project|canvas|app)\s+i\s+(?:worked on|was working on|opened|used|looked at|edited)(?:\s+(?:recently|last|lately|yesterday|most recently|last time))?)$/i;

// The open-or-connect choice for a repository connected on other branches. Rule 2 offers it, and the
// connect executor returns it when a fresh catalog shows the repository connected meanwhile.
export function branchChoice(same, { url, repo, branch }) {
  const connect = { url, repo, ...(branch ? { branch } : {}) };
  return [
    ...same.map((row) => ({ label: `${titleOf(row)}${row.branch ? ` (${row.branch})` : ''} · ${kindLabel(row.kind)}`, name: 'open_resource', args: { slug: row.name, kind: row.kind, title: titleOf(row) } })),
    ...(branch ? [{ label: `Connect ${repo} at ${branch}`, name: 'connect_repository', args: { ...connect, newBranch: true } }] : []),
  ];
}

const ask = (text, mode = 'ask') => ({ type: 'ask', mode, text });
const command = (name, args) => ({ type: 'command', name, args });

// One match acts; 2-5 ask which one; none or more than 5 open the title search.
function byName(catalog, text, make) {
  const hits = lookup(catalog, text);
  if (hits.length === 1) return { type: 'command', ...make(hits[0]) };
  if (hits.length < 2 || hits.length > 5) return command('search_resources', { text });
  return {
    type: 'choose',
    options: [
      ...hits.map((hit) => ({ label: `${hit.title} · ${kindLabel(hit.kind)}`, ...make(hit) })),
      { label: `Search everything for "${text}"`, name: 'search_resources', args: { text } },
    ],
  };
}

export function route(text, { mode = null, catalog = [], scope = null } = {}) {
  let message = String(text || '').trim();
  const pill = mode === 'auto' ? null : mode;
  if (pill && pill !== 'do') return ask(message, pill);
  // 1. A slash mode at position 0.
  const slash = !pill && message.match(/^\/(ask|teach|research|do)(?:\s+|$)/i);
  if (slash) return { type: 'mode', mode: slash[1].toLowerCase(), text: message.slice(slash[0].length) };
  // 1a. Help and questions about Rabbit Hole's own concepts.
  if (HELP.test(message)) return command('explain', { concept: 'help' });
  const concept = message.match(CONCEPT);
  if (concept) return command('explain', { concept: conceptOf(concept[1]) });
  // 1b. /find /open /new /connect /run.
  const shortcut = !pill && message.match(SHORTCUT);
  if (shortcut) {
    const verb = shortcut[1].toLowerCase(), rest = (shortcut[2] || '').trim();
    if (verb === 'new') return command('open_start', { path: NEW_PATH[rest.toLowerCase()] || 'repository' });
    if (!rest) {
      if (verb === 'run') return command('filter_library', { type: 'apps' });
      if (verb === 'connect') return command('open_start', { path: 'repository' });
      return command('filter_library', {}); // /find, /open
    }
    message = `${verb} ${rest}`;
  }
  // 1c. Any other /word is an unknown command: say so, never a silent Ask.
  const unknown = !pill && !shortcut && message.match(/^\/([a-z][\w-]*)/i);
  if (unknown) return { type: 'unknown_command', name: unknown[1].toLowerCase() };
  // 2. A GitHub repository link. A URL appearing is not a request to create a project (user decision,
  // 2026-09-24): a bare link or explicit creation language connects, and a repository already
  // connected here opens instead. A link inside a question stays a question. Any other URL is a question.
  const short = !GITHUB.test(message) && message.match(SHORTHAND);
  if (short) message = `${short[1] || ''}https://github.com/${short[2]}/${short[3]}`;
  const github = message.match(GITHUB);
  if (github) {
    const repo = `${github[1]}/${github[2].replace(/\.+$/, '').replace(/\.git$/i, '')}`;
    const branch = github[3] ? decode(github[3]).replace(/[.,;:!?]+$/, '') : null;
    const connect = { url: `https://github.com/${repo}`, repo, ...(branch ? { branch } : {}) };
    const same = repositoriesOf(catalog, repo);
    const open = (row) => ({ slug: row.name, kind: row.kind, title: titleOf(row) });
    // The words around the link, without the rest of the link, its brackets or punctuation. A '?'
    // around it, even glued to the end of the link, makes it a question.
    const tail = message.slice(github.index + github[0].length).match(/^\S*/)[0];
    const around = `${message.slice(0, github.index)} ${message.slice(github.index + github[0].length + tail.length)}`;
    const asked = /\?/.test(around) || /\?[)>"'`]*$/.test(tail);
    const rest = around.replace(/[\s<>()"'`.,;:!?]+/g, ' ').trim();
    if (!asked && (!rest || CREATE.test(rest))) {
      if (!same.length) return command('connect_repository', connect);
      const exact = branch ? onBranch(same, branch) : same.length === 1 && same[0];
      if (exact) return command('open_resource', open(exact));
      // Never overwrite or duplicate silently: open what is connected, or connect the named branch too.
      return { type: 'choose', options: branchChoice(same, connect) };
    }
    // A question. The project on the branch it names is context; another branch's project never is,
    // and with several connected and no branch named, none is guessed.
    const target = branch ? onBranch(same, branch) : same.length === 1 ? same[0] : null;
    if (target) return { ...ask(message), about: open(target) };
    if (same.length && branch) {
      const on = same.map((row) => row.branch).filter(Boolean).join(', ');
      return { ...ask(message), note: `${repo} is connected on ${on}, not ${branch}.`, offer: { label: `Connect ${repo} at ${branch}`, name: 'connect_repository', args: { ...connect, newBranch: true } } };
    }
    if (same.length) return ask(message);
    return { ...ask(message), note: `${repo} isn't connected, so answers can't read its code yet.`, offer: { label: `Connect ${repo}`, name: 'connect_repository', args: connect } };
  }
  if (/https?:\/\/\S/i.test(message)) return ask(message);
  // 2b. Library words: "show my canvases" sets the Library's filters; with a topic or a name
  // ("show canvases about attention", "find my nanoGPT project") it searches that kind.
  let m = message.match(RECENT);
  if (m) {
    const word = (m[1] || m[2]).toLowerCase();
    return command('open_recent', { kind: word === 'project' ? 'repository' : word });
  }
  if ((m = message.match(LIBRARY))) {
    const [, owner, kindWord, topic] = m;
    const type = kindOf(kindWord);
    if (topic) return command('search_resources', { text: topic.trim(), kinds: KINDS[type] });
    const section = owner?.toLowerCase() === 'my' ? 'private' : null;
    return command('filter_library', { type, ...(section ? { section } : {}) });
  }
  if ((m = message.match(NAMED_KIND))) return command('search_resources', { text: m[1].trim(), kinds: KINDS[kindOf(m[2])] });
  // 3. open|go to|show <name>. A Settings word is never looked up: "open settings" opens Settings.
  m = message.match(/^(?:open|go to|show)\s+(.+)$/i);
  if (m) {
    const name = m[1].trim();
    if (SETTINGS[name.toLowerCase()]) return command('open_settings', SETTINGS[name.toLowerCase()]);
    return byName(catalog, name, (hit) => ({ name: 'open_resource', args: { slug: hit.slug, kind: hit.kind, title: hit.title } }));
  }
  // 4. find|search <text>
  if ((m = message.match(/^(?:find|search)\s+(?:for\s+)?(.+)$/i))) return command('search_resources', { text: m[1].trim() });
  // 5. connect <provider>: only a row of the Connections catalog (connections.js); anything else is a question.
  m = message.match(/^connect\s+(?:to\s+)?(.+)$/i);
  const provider = m && findConnection(m[1]);
  if (provider) return command('open_settings', { tab: 'connections', focus: provider.id });
  // 6. settings|preferences|connections|theme
  if (SETTINGS[message.toLowerCase()]) return command('open_settings', SETTINGS[message.toLowerCase()]);
  // 7. pin|unpin this, or a name
  if ((m = message.match(/^(pin|unpin)(?:\s+(.+))?$/i))) {
    const name = m[1].toLowerCase(), target = m[2]?.trim();
    if (target && !/^(this|it)$/i.test(target)) return byName(catalog, target, (hit) => ({ name, args: { slug: hit.slug } }));
    if (scope?.slug) return command(name, { slug: scope.slug });
  }
  // 8. new canvas|blank canvas [called <title>]. From the bar it stays put (open: false);
  // asked from a project, the canvas joins it.
  if ((m = message.match(/^(?:new|blank) canvas(?:\s+called\s+(.+))?$/i))) {
    return command('create_canvas', { title: m[1]?.trim() || 'Untitled canvas', ...(scope?.kind === 'project' ? { project: scope.slug } : {}), open: false });
  }
  // 9. No 'share <name> with <email>': Rabbit Hole v1 is solo, so it is a question like any other.
  // 10. run <job>
  if ((m = message.match(/^run\s+(.+)$/i))) {
    return byName(catalog.filter((row) => row.kind === 'job'), m[1].trim(), (hit) => ({ name: 'run', args: { app: hit.slug } }));
  }
  return ask(message);
}
