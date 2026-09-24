import { findConnection } from '../connections.js';
import { kindLabel, lookup } from './catalog.js';

// RulesRouter (T02 §6.6): deterministic, first match wins, no model call. Anything
// unmatched goes to Ask in the frozen scope, whose tools come back as Confirm cards.
const SETTINGS = { settings: {}, preferences: { tab: 'preferences' }, connections: { tab: 'connections' }, theme: { tab: 'preferences' } };
// owner/repository from a GitHub URL anywhere in the text, plus an explicit /tree/<branch>, are kept;
// credentials before '@' never are (parseRepository wants the bare URL, repositories.js:11-17).
const GITHUB = /(?:^|[\s(<"'])(?:https?:\/\/)?(?:[^\s/@]+@)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/([^\s?#<>"')]+))?/i;

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
  const message = String(text || '').trim();
  const pill = mode === 'auto' ? null : mode;
  if (pill && pill !== 'do') return ask(message, pill);
  // 1. A slash mode at position 0.
  const slash = !pill && message.match(/^\/(ask|teach|research|do)(?:\s+|$)/i);
  if (slash) return { type: 'mode', mode: slash[1].toLowerCase(), text: message.slice(slash[0].length) };
  // 2. A GitHub repository connects; any other URL is a question.
  const github = message.match(GITHUB);
  if (github) {
    const repo = `${github[1]}/${github[2].replace(/\.+$/, '').replace(/\.git$/i, '')}`;
    return command('connect_repository', { url: `https://github.com/${repo}`, repo, ...(github[3] ? { branch: decodeURIComponent(github[3]).replace(/\.+$/, '') } : {}) });
  }
  if (/https?:\/\/\S/i.test(message)) return ask(message);
  // 3. open|go to|show <name>. A Settings word is never looked up: "open settings" opens Settings.
  let m = message.match(/^(?:open|go to|show)\s+(.+)$/i);
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
  // 9. share <name> with <email> [as view|edit]. Projects and canvases route here too; the
  // share command answers that they can't be shared yet (T02 §11).
  if ((m = message.match(/^share\s+(.+?)\s+with\s+(\S+@\S+?)(?:\s+as\s+(view|viewer|edit|editor))?$/i))) {
    const [, name, email, as = 'view'] = m;
    const role = as.toLowerCase().startsWith('edit') ? 'edit' : 'view';
    return byName(catalog, name, (hit) => ({ name: 'share', args: { app: hit.slug, email, role } }));
  }
  // 10. run <job>
  if ((m = message.match(/^run\s+(.+)$/i))) {
    return byName(catalog.filter((row) => row.kind === 'job'), m[1].trim(), (hit) => ({ name: 'run', args: { app: hit.slug } }));
  }
  return ask(message);
}
