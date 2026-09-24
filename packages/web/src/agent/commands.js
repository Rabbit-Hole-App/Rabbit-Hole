import { api, getTheme, navigate, setTheme, wsName } from '../api.js';
import { openedNotice } from '../connections.js';
import { learnPreview } from '../flags.js';
import { canvasKeys, deviceId, hasLocalContent } from '../home/canvas-local.js';
import { readPinned, togglePin } from '../home/pinned.js';
import { kindLabel, lookup, titleOf } from './catalog.js';
import { scopeOf } from './scope.js';

// One registry for the Agent Bar and the buttons that do the same things (T02 §7).
// Risk comes from here, never from a model's confidence. run() resolves a Result:
// { message?, href?, notice?, results?: [{slug, title, kind, detail}], undoable?, resetThread?, data? }.
// A command that navigates does so inside run(); callers never navigate after it.
// ponytail: §7.1 requires(ctx) is left out; the server rechecks edit rights at approve (index.js:1425-1430).
export const D7_REASON = 'Blocked on this preview: it would change live apps.';

// The one ctx. The Start dialog, the Project hub and the canvas gate pass ctxOf(getSurface()); the bar
// passes the scope it froze at Send (T02 §6.3), ctxOf(getSurface(), { scope }). scope is the only override.
export const ctxOf = (surface, { scope = scopeOf(surface) } = {}) => ({
  org: surface.org, email: surface.email, orgName: surface.orgName, devBuild: learnPreview,
  storage: window.localStorage, catalog: surface.catalog || [], scope, surface,
});

const ok = () => ({ ok: true });
const workspace = (ctx) => ctx.orgName || wsName(ctx.org);
const card = (ctx, model) => ({ workspace: workspace(ctx), ...model });
const rowOf = (ctx, slug) => (ctx.catalog || []).find((row) => row.name === slug);
const titleFor = (ctx, slug) => (rowOf(ctx, slug) ? titleOf(rowOf(ctx, slug)) : slug);
const go = (to) => {
  navigate(to);
  return {};
};
function targetOf(ctx, slug) {
  const row = rowOf(ctx, slug);
  return row ? `${titleOf(row)} (${row.kind}) · /apps/${slug}` : `${slug} · /apps/${slug}`;
}

// The seven Ask tools (control-plane ask.js:103-159) execute only by approving the
// proposal the Ask agent made, through /api/ask/approve (index.js:1415).
// ponytail: a rule-routed share or run has no proposal yet; D7 blocks all seven on the preview
// until the §7.4 fixes are promoted, and that promotion adds a route that creates one.
const ASK_TOOLS = {
  run: ['Run', (a) => `Starts a run of ${a.app} now.`],
  run_again: ['Run again', (a) => `Starts a new run with the inputs of ${a.run_id}.`],
  set_schedule: ['Set schedule', (a) => (a.schedule ? `${a.app} runs on ${a.schedule} (UTC) from now on.` : `${a.app} stops running on a schedule.`)],
  pause_schedule: ['Pause schedule', (a) => `${a.app} stops running on its schedule. Runs missed while paused are not made up.`],
  resume_schedule: ['Resume schedule', (a) => `${a.app} runs on its schedule again.`],
  share: ['Share', (a) => `${a.email} gets ${a.role === 'edit' ? 'edit' : 'view'} access to ${a.app} now.`],
  unshare: ['Unshare', (a) => `${a.email} loses access to ${a.app} now.`],
};

function proposal(name) {
  const [label, effect] = ASK_TOOLS[name];
  return {
    risk: 'confirm',
    touchesLive: true,
    available: ok,
    preview: ({ proposal_id, ...args }, ctx) => card(ctx, {
      title: `${label} ${args.app ? titleFor(ctx, args.app) : args.run_id}`,
      target: args.app ? targetOf(ctx, args.app) : `run ${args.run_id}`,
      operation: name,
      params: args,
      effect: effect(args),
    }),
    run: async ({ proposal_id, ...args }) => {
      if (!proposal_id) throw Error(`${label} needs a proposal from Ask first.`);
      const data = await api('/api/ask/approve', { method: 'POST', body: JSON.stringify({ proposal_id }) });
      return { ...(data.runId && args.app ? { href: `/apps/${args.app}/runs/${data.runId}` } : {}), data };
    },
  };
}

// Pinned is device-local (T02 §2); togglePin announces small:pinned so the sidebar re-reads.
// Never toggle blindly: a repeat changes nothing, and Undo reverses only a real change.
function pinCommand(on) {
  return {
    risk: 'undo',
    touchesLive: false,
    available: ok,
    run: async ({ slug }, ctx) => {
      const changed = readPinned(ctx.storage, ctx.org, ctx.email).includes(slug) !== on;
      if (changed) togglePin(ctx.storage, ctx.org, ctx.email, slug);
      const verb = changed ? (on ? 'Pinned' : 'Unpinned') : on ? 'Already pinned' : 'Not pinned';
      return { message: `${verb} · ${titleFor(ctx, slug)}`, undoable: changed, data: { slug, changed } };
    },
    undo: async ({ data }, ctx) => {
      if (data.changed) togglePin(ctx.storage, ctx.org, ctx.email, data.slug);
    },
  };
}

// ponytail: the 'opens a screen only' actions of §7.2 have no entry; no rule or Ask tool reaches them in phase 1.
export const COMMANDS = {
  open_resource: { risk: 'immediate', touchesLive: false, available: ok, run: async ({ slug }) => go(`/apps/${slug}`) },
  open_tab: { risk: 'immediate', touchesLive: false, available: ok, run: async ({ slug, tab }) => go(`/apps/${slug}?tab=${encodeURIComponent(tab)}`) },
  open_settings: {
    risk: 'immediate', touchesLive: false, available: ok,
    run: async ({ tab, focus } = {}) => {
      window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab, focus } }));
      return { notice: openedNotice(tab, focus) };
    },
  },
  // The Library's type, scope and folder parameters (App.jsx:116-117; ?type= from the Library chips).
  filter_library: {
    risk: 'immediate', touchesLive: false, available: ok,
    run: async ({ type, section, folder } = {}) => {
      const query = String(new URLSearchParams({ ...(type ? { type } : {}), ...(section ? { s: section } : {}), ...(folder ? { f: folder } : {}) }));
      return go(query ? `/library?${query}` : '/library');
    },
  },
  search_resources: {
    risk: 'immediate', touchesLive: false, available: ok,
    run: async ({ text }, ctx) => ({ results: lookup(ctx.catalog, text).map((hit) => ({ ...hit, detail: kindLabel(hit.kind) })) }),
  },
  // Reads on the live control plane, each one model call (index.js:595-638). Immediate, so D7 never blocks a read.
  find_apps_ai: {
    risk: 'immediate', touchesLive: true, available: ok,
    run: async ({ q }, ctx) => {
      const { apps = [], note } = await api('/api/apps/find', { method: 'POST', body: JSON.stringify({ q }) });
      const results = apps.map((slug) => ({ slug, title: titleFor(ctx, slug), kind: rowOf(ctx, slug)?.kind || 'app', detail: kindLabel(rowOf(ctx, slug)?.kind) }));
      return { results, ...(note ? { message: note } : {}) };
    },
  },
  find_runs_ai: {
    risk: 'immediate', touchesLive: true,
    available: (ctx) => (ctx.scope?.kind === 'app' ? { ok: true } : { ok: false, reason: 'Open an app to search its runs.' }),
    run: async ({ q }, ctx) => {
      const app = ctx.scope.slug;
      const { runs = [], note } = await api('/api/runs/find', { method: 'POST', body: JSON.stringify({ app, q }) });
      // The slug is the path under /apps, so opening a result opens the run page.
      const results = runs.map((id) => ({ slug: `${app}/runs/${id}`, title: id, kind: 'run', detail: `Run of ${titleFor(ctx, app)}` }));
      return { results, ...(note ? { message: note } : {}) };
    },
  },
  new_thread: { risk: 'immediate', touchesLive: false, available: ok, run: async () => ({ resetThread: true }) },
  pin: pinCommand(true),
  unpin: pinCommand(false),
  set_theme: {
    risk: 'undo', touchesLive: false, available: ok,
    run: async ({ theme }) => {
      if (!['system', 'light', 'dark'].includes(theme)) throw Error('Theme is system, light or dark.');
      const previous = getTheme();
      setTheme(theme);
      return { message: `Theme set to ${theme}`, undoable: true, data: { previous } };
    },
    undo: async ({ data }) => setTheme(data.previous),
  },
  // open: true for Start, the Project hub and the canvas gate (lands on the canvas);
  // open: false for the bar, which stays put and offers Undo (T02 §8.4).
  create_canvas: {
    risk: 'undo', touchesLive: false, available: ok,
    run: async ({ title = 'Untitled canvas', project, open = false } = {}, ctx) => {
      const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title, ...(project ? { project } : {}), device_id: deviceId(ctx.storage) }) });
      const href = `/apps/${canvas.name}`;
      if (open) {
        navigate(href);
        return { href, data: canvas };
      }
      return { message: `Canvas created · ${canvas.title}`, href, undoable: true, data: canvas };
    },
    // Untouched = no content in this browser (canvas-local.js) and no threads, which the
    // server checks in the same DELETE and refuses with 405 otherwise.
    undo: async ({ data: canvas }, ctx) => {
      if (hasLocalContent(ctx.storage, canvasKeys({ org: canvas.org, email: ctx.email, slug: canvas.name }))) {
        throw Error('This canvas has content now. Archive it from Library instead.');
      }
      await api(`/api/apps/${canvas.name}`, { method: 'DELETE' });
    },
  },
  // Confirm class, but allowed on the preview (T02 §16): the row goes only to LEARN_DB
  // (small-learn-dev) and the snapshot only under learn-repositories-dev/ (repositories.js:90,124).
  connect_repository: {
    risk: 'confirm', touchesLive: false, available: ok,
    // prepareCommand runs this before the card, so the card shows the exact branch and a
    // repository that is not public fails before any card.
    resolve: async ({ url, repo }) => {
      try {
        return { url, repo, branch: (await api(`/api/repositories/branches?url=${encodeURIComponent(url)}`)).defaultBranch };
      } catch (error) {
        throw Error(/not found/i.test(error.message) ? `Can't connect ${repo}: no public repository found there. Private repositories aren't supported yet; public GitHub works.` : error.message);
      }
    },
    preview: (args, ctx) => card(ctx, {
      title: `Connect ${args.repo}`,
      target: `${args.repo} · public GitHub · ${args.url}`,
      operation: 'connect_repository',
      params: { branch: args.branch },
      effect: `Visible to everyone in ${workspace(ctx)}. Connected repositories can't be deleted yet.`,
    }),
    run: async ({ url, branch }) => {
      const { name } = await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url, branch }) });
      navigate(`/apps/${name}`);
      return { href: `/apps/${name}`, data: { name } };
    },
  },
  ...Object.fromEntries(Object.keys(ASK_TOOLS).map((name) => [name, proposal(name)])),
  // Projects and canvases can't be shared yet (T02 §11). That answer touches nothing, so it
  // is never a card and never Blocked (prepareCommand, executeCommand).
  share: {
    ...proposal('share'),
    unsupported: (args, ctx) => (['repository', 'canvas'].includes(rowOf(ctx, args.app)?.kind) ? "Sharing projects and canvases isn't available yet." : null),
  },
};

// D7 (T02 §7.5) is checked first and is absolute on every dev build.
export function policy(name, ctx) {
  const command = COMMANDS[name];
  if (!command) return { risk: null, blocked: true, reason: `Unknown command: ${name}` };
  if (ctx.devBuild && command.touchesLive && command.risk === 'confirm') return { risk: command.risk, blocked: true, reason: D7_REASON };
  const { ok: allowed, reason } = command.available(ctx);
  return allowed ? { risk: command.risk, blocked: false } : { risk: command.risk, blocked: true, reason };
}

// Before a card: resolve (connect_repository's default branch), the card model, the policy.
export async function prepareCommand(name, args, ctx) {
  const command = COMMANDS[name];
  if (command?.unsupported?.(args, ctx)) return { args, card: null, policy: { risk: 'immediate', blocked: false } };
  const resolved = (await command?.resolve?.(args, ctx)) ?? args;
  return { args: resolved, card: command?.preview?.(resolved, ctx) ?? null, policy: policy(name, ctx) };
}

// The only way a command runs. The policy is checked again here, so a caller that skipped
// the card still cannot pass D7.
export async function executeCommand(name, args, ctx) {
  const command = COMMANDS[name];
  const unsupported = command?.unsupported?.(args, ctx);
  if (unsupported) return { message: unsupported };
  const { blocked, reason } = policy(name, ctx);
  if (blocked) throw Error(reason);
  return command.run(args, ctx);
}
