import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, Paperclip, Plus, X } from 'lucide-react';
import ChatComposer from '../ChatComposer.jsx';
import { api, navigate, wsName } from '../api.js';
import { PATHS, slugOf, titleFromQuestion } from '../start.js';
import { Button, cn, Menu, MenuItem, toast } from '../ui.jsx';
import { askBody, streamAsk } from './ask-stream.js';
import {
  aboutScope, applyEvent, carry, EXPIRY_MS, follow, getLatest, getTurns, labelOf, learnOutcome, lineOf, MODES, modeAvailability, modeQuery, shortcutsFor,
  offerFor, placeholderFor, pushTurn, rejectBody, resetThread, resultsKey, subscribeTurns, threadIds, updateTurn, widen,
} from './bar.js';
import { kindLabel, titleOf } from './catalog.js';
import { COMMANDS, ctxOf, executeCommand, prepareCommand } from './commands.js';
import { learnAction } from './learn-hook.js';
import ResultSheet from './ResultSheet.jsx';
import { route } from './router.js';
import { chipsFor, endpointFor, scopeKey, scopeOf } from './scope.js';
import { getSurface, useSurface } from './surface.js';

const nameOf = (scope) => labelOf(scope, getSurface().orgName || wsName(scope.org));
const add = (scope, entry) => {
  const id = crypto.randomUUID();
  pushTurn(resultsKey(scope), { id, scope, label: nameOf(scope), ...entry });
  return id;
};
// A choose pill reads '<title> · <Kind>' (Figma F6), as the router's options do.
const chooseLabel = (slug) => {
  const row = (getSurface().catalog || []).find((a) => a.name === slug);
  return `${row ? titleOf(row) : slug} · ${kindLabel(row?.kind)}`;
};

// WP5 review (preview only): ?dock=float|integrated picks the dock variant, kept in this browser.
// ponytail: remove once the user picks one.
const DOCK = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('dock');
    if (q === 'float' || q === 'integrated') localStorage.setItem('small.preview:dock', q);
    return localStorage.getItem('small.preview:dock') === 'float' ? 'float' : true;
  } catch { return true; }
})();

// T02 §6: one Agent Bar over every page, mounted once in Root (dev only), so a
// draft and an in-flight answer survive Shell remounts and navigation. Where it
// shows comes from surface.barHidden (routes.js baseSurfaceFor, then the page).
export default function AgentBar() {
  const surface = useSurface();
  const hidden = surface.barHidden;
  const root = useRef(null), inputRef = useRef(null), abort = useRef(null);

  // §6.2-6.3: × widens the page's scope for this visit. Drafts are kept per
  // scope key; a waiting draft keeps its scope until the user picks (follow).
  const [removed, setRemoved] = useState([]);
  useEffect(() => setRemoved([]), [surface.resource?.slug, surface.selected?.id]);
  const live = scopeOf(widen(surface, removed));
  const [drafts, setDrafts] = useState(() => new Map());
  const [held, setHeld] = useState(null);
  const target = follow(held, live, drafts);
  const targetKey = scopeKey(target);
  useEffect(() => setHeld(target), [targetKey]);
  const draft = drafts.get(targetKey) || '';
  const [kept, setKept] = useState(null); // the page scope the user chose not to switch to
  useEffect(() => setKept(null), [scopeKey(live)]);
  const offer = kept === scopeKey(live) ? null : offerFor(target, live);
  const switchTo = (scope, keep) => { setDrafts((d) => carry(d, target, scope, keep)); setHeld(scope); inputRef.current?.focus(); };
  const clearDraft = (scope, sent) => setDrafts((d) => (d.get(scopeKey(scope)) === sent ? new Map(d).set(scopeKey(scope), '') : d));
  const keepDraft = (scope, text) => setDrafts((d) => (d.get(scopeKey(scope))?.trim() ? d : new Map(d).set(scopeKey(scope), text)));
  const waiting = [...drafts.values()].some((text) => text.trim());

  const [streaming, setStreaming] = useState(null); // name of the one in-flight answer's scope
  const [sheet, setSheet] = useState(null); // the scope whose results are open
  const latest = useSyncExternalStore(subscribeTurns, getLatest);
  const here = useSyncExternalStore(subscribeTurns, () => getTurns(resultsKey(target)));
  const line = here[here.length - 1] || latest;

  // §6.2 mode: Auto unless picked; '/' at position 0 opens the picker.
  const [mode, setMode] = useState('auto');
  const [picker, setPicker] = useState(false);
  const [hi, setHi] = useState(0);
  const entries = [...MODES.map(([name, desc]) => ({ name, desc, shortcut: false })), ...shortcutsFor(target, surface.catalog).map(([name, desc]) => ({ name, desc, shortcut: true }))]
    .filter((e) => e.name.startsWith(modeQuery(draft) || ''));
  const pickerOpen = picker && entries.length > 0;
  const hiIndex = Math.min(hi, entries.length - 1);
  // A mode becomes the pill; a shortcut is typed into the draft ('/find ') for the rest of the request.
  const pick = ({ name, shortcut }) => {
    if (shortcut) {
      setDrafts((d) => new Map(d).set(targetKey, `/${name} `)); setPicker(false); setHi(0);
      inputRef.current?.focus();
      return;
    }
    if (!modeAvailability(name, target.kind).ok) return;
    setMode(name); setPicker(false); setHi(0);
    if (modeQuery(draft) !== null) setDrafts((d) => new Map(d).set(targetKey, ''));
    inputRef.current?.focus();
  };
  const [adding, setAdding] = useState(false); // the [+] Add menu

  // Pages pad their <main> by the bar's height (index.css); 0 while hidden.
  useEffect(() => {
    const set = (h) => document.documentElement.style.setProperty('--agent-bar-h', `${h}px`);
    if (hidden) { set(0); return; }
    const observer = new ResizeObserver(([entry]) => set(entry.borderBoxSize[0].blockSize));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [hidden]);
  // Ctrl/Cmd+J (Shell.jsx:45-49). While hidden the ref is empty, so it does nothing.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('small:ask-focus', focus);
    return () => window.removeEventListener('small:ask-focus', focus);
  }, []);
  // Switching workspace reloads the page (Sidebar.jsx:883), which drops every draft.
  useEffect(() => {
    if (!waiting) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [waiting]);

  // Map and the app Graph tab may show results in their Context panel (§6.5).
  const showResults = (scope) => {
    const page = getSurface();
    if (page.resultsHost !== 'panel' || resultsKey(scopeOf(page)) !== resultsKey(scope)) setSheet(scope);
  };

  // §6.6: mode pill, then rules, then /ask. Scope is frozen here, before any await,
  // and every command gets the one ctx with that scope: ctxOf(surface, { scope }).
  async function submit(raw, pill = mode, text = raw) {
    const scope = target;
    const can = modeAvailability(pill, scope.kind);
    if (!can.ok) { add(scope, { kind: 'note', text: can.reason, error: true }); return showResults(scope); }
    const r = route(text, { mode: pill, catalog: getSurface().catalog || [], scope });
    if (r.type === 'mode') return submit(raw, r.mode, r.text);
    if (r.type === 'note') { add(scope, { kind: 'note', text: r.text }); return showResults(scope); }
    if (r.type === 'command') return runCommand(r.name, r.args, raw, scope);
    if (r.type === 'choose') {
      clearDraft(scope, raw);
      add(scope, { kind: 'choose', options: r.options.map((o) => ({ label: o.label, run: () => runCommand(o.name, o.args, raw, scope) })) });
      return showResults(scope);
    }
    // A question naming a repository that is not connected here (or not on that branch):
    // say why its code can't be read and offer Connect, which runs only when clicked. The
    // question is still asked wherever asking is on (router.test.mjs: asks, offers Connect).
    if (r.offer) {
      add(scope, { kind: 'note', text: r.note, action: { label: r.offer.label, run: () => runCommand(r.offer.name, r.offer.args, raw, scope, true) } });
      if (!modeAvailability('ask', scope.kind).ok) return showResults(scope);
    }
    if (r.mode === 'teach') return teach(r.text, raw, scope);
    // A question about a connected repository is asked in that project's scope.
    return ask(r.text, raw, r.about ? aboutScope(scope, r.about) : scope, null, scope);
  }

  // §7: prepare (resolve, preview, policy), then a card for Confirm class, the
  // reason for a blocked command, or run it now and report its Result. The
  // command navigates itself; the bar never navigates after run().
  async function runCommand(name, args, raw, scope, keep = false) {
    const ctx = ctxOf(getSurface(), { scope });
    try {
      const ready = await prepareCommand(name, name === 'create_canvas' ? { ...args, open: false } : args, ctx);
      if (ready.card) {
        card(scope, { name, args: ready.args, model: ready.card, policy: ready.policy, change: raw });
        if (!keep) clearDraft(scope, raw);
        return null;
      }
      if (ready.policy.blocked) { add(scope, { kind: 'note', text: ready.policy.reason, error: true }); showResults(scope); return null; }
      const result = (await executeCommand(name, ready.args, ctx)) || {};
      if (!keep) clearDraft(scope, raw);
      report(scope, name, result, ctx, raw);
      return result;
    } catch (e) {
      add(scope, { kind: 'note', text: `✗ ${e.message}`, error: true }); // the draft stays (§13)
      showResults(scope);
      return null;
    }
  }

  // Result (commands.js): message or notice, a results list, Undo, a new thread.
  function report(scope, name, result, ctx, raw) {
    const key = resultsKey(scope);
    if (result.resetThread) resetThread(key);
    const text = result.message || result.notice;
    if (text) {
      const undo = COMMANDS[name]?.undo && result.undoable ? async () => {
        updateTurn(key, id, (n) => ({ ...n, undo: null }));
        try { await COMMANDS[name].undo(result, ctx); updateTurn(key, id, (n) => ({ ...n, text: `${n.text} · Undone`, open: null })); }
        catch (e) { updateTurn(key, id, (n) => ({ ...n, text: `✗ ${e.message}`, error: true })); }
      } : null;
      const id = add(scope, { kind: 'note', text, undo, open: result.href ? () => navigate(result.href) : null });
    }
    if (result.results) {
      add(scope, {
        kind: 'results',
        results: result.results,
        pick: (item) => runCommand('open_resource', { slug: item.slug, kind: item.kind, title: item.title }, '', scope, true),
        askInstead: () => ask(raw, raw, scope),
      });
    }
    if (text || result.results) showResults(scope);
  }

  // §7.3 card. Nothing runs until Confirm; D7 (policy.blocked) disables it.
  function card(scope, { name, args, model, policy, change, proposalId = null }) {
    const key = resultsKey(scope);
    const current = () => getTurns(key).find((t) => t.id === id).card;
    const set = (patch) => updateTurn(key, id, (t) => ({ ...t, card: { ...t.card, ...patch } }));
    const id = add(scope, {
      kind: 'card',
      card: { model, blocked: policy.blocked, reason: policy.reason, proposalId, createdAt: Date.now() },
      confirm: async () => {
        if (Date.now() - current().createdAt > EXPIRY_MS) return set({}); // re-renders as Expired
        set({ phase: 'executing', error: undefined });
        try {
          const result = await executeCommand(name, args, ctxOf(getSurface(), { scope }));
          set({ phase: 'done', href: result?.href, message: result?.choose ? 'Already connected on another branch. Choose below.' : result?.message });
          if (result?.choose) add(scope, { kind: 'choose', options: result.choose.map((o) => ({ label: o.label, run: () => runCommand(o.name, o.args, change, scope) })) });
        }
        catch (error) { set({ phase: 'failed', error }); }
      },
      change: () => { setDrafts((d) => new Map(d).set(scopeKey(scope), change)); setHeld(scope); inputRef.current?.focus(); },
      cancel: async () => {
        const body = rejectBody(current());
        if (!body) return set({ phase: 'cancelled' });
        try { await api('/api/ask/reject', { method: 'POST', body: JSON.stringify(body) }); set({ phase: 'cancelled' }); }
        catch (error) { set({ phase: 'failed', error }); }
      },
    });
    showResults(scope);
  }

  // Ask tools come back as proposals (§6.4 /ask). Server data: an unknown tool is refused.
  async function proposal(scope, p, raw) {
    if (!COMMANDS[p.tool]) { add(scope, { kind: 'note', text: `✗ Unknown action proposed: ${p.tool}. Nothing ran.`, error: true }); return; }
    const ctx = ctxOf(getSurface(), { scope });
    try {
      const ready = await prepareCommand(p.tool, { ...p.args, proposal_id: p.id }, ctx);
      // No card (e.g. share of a project or canvas): the executor explains itself.
      if (!ready.card) return report(scope, p.tool, (await executeCommand(p.tool, ready.args, ctx)) || {}, ctx, raw);
      card(scope, { name: p.tool, args: ready.args, model: ready.card, policy: ready.policy, change: raw, proposalId: p.id });
    } catch (e) { add(scope, { kind: 'note', text: `✗ ${e.message}`, error: true }); }
  }

  // ponytail: /research and [Add to canvas] are not wired - research needs canvas scope, the bar
  // is hidden on canvases (routes.js) and learnHandoff is off (flags.js). Wire learnAction('research')
  // when the bar shows on a canvas.

  // §6.4 /teach through the Learn hook (§9). From the workspace a canvas comes
  // first. learnAction opens Learn itself, so the bar never navigates after it;
  // the bar is hidden on Learn, so its message is a toast.
  async function teach(text, raw, scope) {
    try {
      let app = scope.slug;
      if (scope.kind === 'workspace') {
        const made = await runCommand('create_canvas', { title: titleFromQuestion(text) }, raw, scope, true);
        app = slugOf(made?.href);
        if (!app) return;
      }
      const outcome = learnOutcome(await learnAction('teach', { app, prompt: text }, ctxOf(getSurface(), { scope })));
      if (outcome.done) clearDraft(scope, raw); // otherwise the prompt stays in this scope's draft
      if (outcome.text) toast(outcome.text, outcome.tone ? { tone: outcome.tone } : {});
    } catch (e) {
      toast(`✗ ${e.message}`, { tone: 'error' });
    }
  }

  // Scope is frozen at Send: the answer lands in that scope's list and thread
  // wherever the user goes meanwhile (§6.3, §6.5). The draft belongs to the
  // scope it was typed in (from), which differs when a question names a project.
  async function ask(text, raw, scope, only = null, from = scope) {
    if (abort.current) return; // one answer at a time; Stop (the send slot) belongs to it
    // Workspace and app asks would write live chat history (bar.js modeAvailability): refuse, keep the draft.
    const can = modeAvailability('ask', scope.kind);
    if (!can.ok) { add(scope, { kind: 'note', text: can.reason, error: true }); return showResults(scope); }
    const key = resultsKey(scope);
    add(scope, { kind: 'user', text });
    const id = add(scope, { kind: 'answer', text: '' });
    clearDraft(from, raw);
    showResults(scope);
    const controller = new AbortController();
    abort.current = controller;
    setStreaming(nameOf(scope));
    // a {choose} pick asks about one app: a fresh thread, never the workspace one
    const body = only ? { ...askBody({ scope, message: text }), scope: only } : askBody({ scope, message: text, threadId: threadIds.get(key) || null });
    let graph = null, failed = null;
    try {
      await streamAsk({
        path: endpointFor(scope).path,
        body,
        signal: controller.signal,
        onEvent: (type, data) => {
          if (type === 'done' && data.threadId && !only) threadIds.set(key, data.threadId);
          if (type === 'graph') graph = data;
          if (type === 'error') failed = data.error;
          if (type === 'proposal') return proposal(scope, data, raw);
          if (type === 'choose') return updateTurn(key, id, (t) => ({ ...t, kind: 'choose', options: data.choose.map((c) => ({ label: chooseLabel(c.app), hint: c.hint, run: () => ask(text, raw, scope, { app: c.app }, from) })) }));
          updateTurn(key, id, (t) => applyEvent(t, type, data));
        },
      });
    } catch (e) {
      if (e.name === 'AbortError') updateTurn(key, id, (t) => ({ ...t, done: true, stopped: true }));
      else failed = e.name === 'TypeError' ? "Couldn't reach the server." : e.message;
    } finally {
      abort.current = null;
      setStreaming(null);
    }
    if (failed) {
      updateTurn(key, id, (t) => ({ ...t, done: true, error: failed, retry: () => ask(text, raw, scope, only, from) }));
      keepDraft(from, raw); // Your message is kept (§13)
    }
    if (graph) {
      const show = () => { const page = getSurface(); if (resultsKey(scopeOf(page)) === key) page.handlers?.onGraph?.(graph); };
      updateTurn(key, id, (t) => ({ ...t, showGraph: show }));
      show();
    }
  }

  // Esc closes the picker, then the sheet (§6.2). Stopped here, so Esc in the bar
  // never also closes a SlidePanel or the search modal (window listeners). Enter on
  // the picker is handled in onSubmit: the textarea sends before this handler runs.
  const onKeyDown = (e) => {
    if (pickerOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setHi((hiIndex + (e.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length); return; }
    if (e.key === 'Escape' && (adding || pickerOpen || sheet)) { e.stopPropagation(); if (adding) setAdding(false); else if (pickerOpen) setPicker(false); else setSheet(null); return; }
    if (e.key === 'Backspace' && e.target === inputRef.current && !draft && mode !== 'auto') setMode('auto');
  };

  if (hidden) return null;
  const chips = chipsFor(target);
  const own = scopeKey(target) === scopeKey(live); // × only while the draft is not held elsewhere
  const widenTo = (chip) => {
    const next = chip === 'resource' ? ['resource'] : [...removed, chip];
    switchTo(scopeOf(widen(surface, next)), false);
    setRemoved(next);
  };
  return (
    <div ref={root} data-agent-bar onKeyDown={onKeyDown}
      className={cn('fixed right-0 bottom-0 left-0 z-20 px-4 pt-3 pb-5 transition-[left] duration-200 max-md:px-3 max-md:pt-2 max-md:pb-3 md:left-[var(--sidebar-w,0px)]', DOCK === 'float' ? 'bg-white/75 backdrop-blur-md' : 'bg-white')}>
      {sheet && <ResultSheet key={resultsKey(sheet)} scope={sheet} label={nameOf(sheet)} onClose={() => setSheet(null)} />}
      <div className="relative mx-auto max-w-[780px]">
        {pickerOpen && (
          <div role="listbox" aria-label="Modes" className="absolute bottom-full left-0 z-10 mb-1 w-[26rem] max-w-full rounded-md bg-white p-1 shadow-pop">
            {entries.map((entry, i) => {
              const { name: m, desc } = entry;
              const can = entry.shortcut ? { ok: true } : modeAvailability(m, target.kind);
              return (
                <div key={m} className="contents">
                {entry.shortcut && !entries[i - 1]?.shortcut && i > 0 && <div role="separator" className="my-1 border-t border-line" />}
                <div role="option" aria-selected={i === hiIndex} aria-disabled={!can.ok} onMouseDown={(e) => { e.preventDefault(); pick(entry); }}
                  className={cn('flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm', can.ok ? 'cursor-pointer' : 'cursor-default', i === hiIndex && 'bg-hover')}>
                  <span className={cn('w-20 shrink-0 font-medium', !can.ok && 'text-ink-3')}>/{m}</span>
                  <span className={cn('min-w-0 flex-1', can.ok ? 'text-ink-2' : 'text-ink-3')}>{can.ok ? desc : can.reason}{can.ok && can.reason ? ` · ${can.reason}` : ''}</span>
                  {m === 'research' && target.kind === 'project' && (
                    <Button size="sm" variant="soft" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setPicker(false); runCommand('create_canvas', { title: 'Untitled canvas', project: target.slug }, '', target, true); }}>New canvas for this project</Button>
                  )}
                </div>
                </div>
              );
            })}
          </div>
        )}
        {streaming && (
          <div role="status" className="flex items-center gap-2 pb-1.5 text-xs text-ink-2">
            <Loader2 size={13} className="shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 truncate">Answering in {streaming}…</span>
          </div>
        )}
        {!sheet && !streaming && line && (
          <button type="button" data-result-line onClick={() => setSheet(line.scope)} className="block w-full cursor-pointer truncate pb-1.5 text-left text-xs text-ink-2 hover:text-ink">{lineOf(line)}</button>
        )}
        {offer && (
          <div role="status" className="flex flex-wrap items-center gap-2 pb-1.5 text-xs text-ink-2">
            {offer === 'resource' && <span>you're now viewing {nameOf(live)}</span>}
            <Button size="sm" variant="soft" onClick={() => switchTo(live, offer === 'resource')}>
              {offer === 'selection' ? `Use selection: ${live.selected.label}?` : `Ask about ${nameOf(live)} instead`}
            </Button>
            <Button size="sm" onClick={() => setKept(scopeKey(live))}>Keep {nameOf(target)}</Button>
          </div>
        )}
        <ChatComposer multiline dock={DOCK} value={draft} onStop={() => abort.current?.abort()}
          onChange={(value) => { setDrafts((d) => new Map(d).set(targetKey, value)); setHeld(target); setPicker(mode === 'auto' && modeQuery(value) !== null); }}
          onSubmit={(raw) => (pickerOpen ? pick(entries[hiIndex]) : submit(raw))} inputRef={inputRef} busy={!!streaming} maxLength={4000} placeholder={placeholderFor(target, surface)}
          leading={<>
            {/* [+] Add (T02 §6.2, revised 2026-09-28): the Start paths through open_start. ponytail: Attach stays off on
                the preview - workspace asks are off (G1), project asks are JSON only (repositories.js:169), and a multipart
                ask would fall through the dev worker to live R2 (index.js:954). streamAsk already takes a file. */}
            <div className="relative shrink-0">
              <button type="button" aria-label="Add" aria-haspopup="menu" aria-expanded={adding} onMouseDown={(e) => e.stopPropagation()} onClick={() => setAdding(!adding)}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-hover hover:text-ink max-md:w-8"><Plus size={16} /></button>
              <Menu open={adding} onClose={() => setAdding(false)} className="bottom-full left-0 mb-2 w-64">
                <div className="px-2 pb-1 pt-1 text-xs text-ink-3">Start from</div>
                {PATHS.map(([path, label]) => <MenuItem key={path} onClick={() => { setAdding(false); runCommand('open_start', { path }, '', target, true); }}>{label}</MenuItem>)}
                <div className="my-1 border-t border-line" />
                <MenuItem icon={Paperclip} disabled className="cursor-default opacity-50 hover:bg-transparent">Attach a file</MenuItem>
                <p className="px-2 pb-1 text-xs text-ink-3">Attachments aren't available on this preview.</p>
              </Menu>
            </div>
            {mode === 'auto'
            ? <button type="button" aria-haspopup="listbox" aria-expanded={pickerOpen} onMouseDown={(e) => { e.preventDefault(); setPicker(!picker); }} className="h-9 shrink-0 cursor-pointer rounded-lg border border-line px-2.5 text-sm text-ink-2 hover:bg-hover hover:text-ink max-md:px-1.5">Auto</button>
            : <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-hover pr-1.5 pl-2.5 text-sm text-ink">/{mode}<button type="button" aria-label="Back to Auto" onClick={() => setMode('auto')} className="cursor-pointer rounded-full p-0.5 text-ink-2 hover:bg-active hover:text-ink"><X size={11} /></button></span>}
          </>} />
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {chips.map((chip) => (
              <span key={chip.key} data-scope-chip={chip.key} className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-hover pr-1.5 pl-2.5 text-xs text-ink">
                <span className="truncate">{chip.label}</span>
                {own && <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => widenTo(chip.key)} className="shrink-0 cursor-pointer rounded-full p-0.5 text-ink-2 hover:bg-active hover:text-ink"><X size={11} /></button>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
