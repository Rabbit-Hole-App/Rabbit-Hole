import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { executeCommand, prepareCommand } from './agent/commands.js';
import ConfirmCard from './agent/ConfirmCard.jsx';
import { learnAction } from './agent/learn-hook.js';
import { learnHandoff } from './flags.js';
import { connectionsFor } from './connections.js';
import { PATH_ICONS } from './start-icons.js';
import { canSubmit, PATHS, pathOr, repositoryDecision, slugOf, teachPrompt, titleFromQuestion, UNTITLED } from './start.js';
import { Button, cn, IconBtn, Input, Pill, Tabs, TabsContent, TabsList, TabsTrigger, toast } from './ui.jsx';

const PLANNED = connectionsFor().filter((c) => c.availability === 'planned');
// ponytail: every connection source is planned (connections.js), so Sources offers PDF upload only.
// Flip when a provider can supply sources and canSubmit (start.js) accepts it.
const connectionSources = false;
const LOCAL = 'Only you can see this canvas. Its content stays in this browser.';

// T02 §5: one portaled dialog with four paths, hosted once by StartHost (main.jsx) on
// 'small:start'. Radix mounts only the active tab, so Enter submits the one form on screen.
// Fields live here, so a tab switch, Settings on top, or a failed request never clears them.
// Every action is a registry entry the Agent Bar also uses; run() navigates, this never does.
// ponytail: Start lands on Learn, where the bar yields, so 'Canvas created · Undo' (T02 §8.4)
// has no surface from here; Archive in the Library row menu covers removal. Recorded in T02 §17.
export default function StartDialog({ ctx, initial, onClose }) {
  const self = useRef(null);
  const inFlight = useRef(false); // one request at a time: no duplicate projects or canvases
  const [path, setPath] = useState(() => pathOr(initial));
  useEffect(() => { setPath(pathOr(initial)); }, [initial]);
  const [f, setF] = useState({ url: '', sources: '', method: 'upload', question: '', depth: null, blank: '' });
  const [card, setCard] = useState(null); // connect_repository: { prepared, createdAt, phase, error }
  const [choose, setChoose] = useState(null); // the router's open-or-connect options for another branch
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => { setF((s) => ({ ...s, [key]: value })); setError(''); if (key === 'url') { setCard(null); setChoose(null); } };
  const field = (key) => ({ value: f[key], onChange: (e) => set(key, e.target.value) });
  const close = () => { if (!inFlight.current) onClose(); };
  useEffect(() => {
    // Only the top dialog takes Esc: Settings, or a confirm opened over this one, closes first.
    const esc = (e) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (e.key === 'Escape' && dialogs[dialogs.length - 1] === self.current) close();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const run = (work) => async (e) => {
    e?.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try { await work(); } catch (er) { setError(er.message); } finally { inFlight.current = false; setBusy(false); }
  };
  // open: true makes create_canvas.run navigate to the new canvas (contract: callers never navigate after run).
  const canvas = async (title) => {
    const result = await executeCommand('create_canvas', { title, open: true }, ctx);
    onClose();
    return result;
  };
  // WP1's decision for this workspace (router rule 2 and the connect_repository executor), rendered,
  // never re-derived: open what is connected, offer the choice for another branch, else the card.
  const decide = async ({ name, args }) => {
    if (name === 'open_resource') { await executeCommand('open_resource', args, ctx); onClose(); return; }
    // resolve() reads the default branch, so a private or missing repository fails here, before any card.
    const prepared = await prepareCommand('connect_repository', args, ctx);
    // Defensive: resolve reads the same catalog the router used, so this is normally unreachable; a
    // stale list is caught at Confirm, where run() re-reads /api/apps and opens the existing project.
    if (!prepared.card) { await executeCommand('connect_repository', prepared.args, ctx); onClose(); return; }
    setChoose(null);
    setCard({ prepared, createdAt: Date.now() });
  };
  const onRepository = run(async () => {
    const decision = repositoryDecision(f.url, ctx);
    if (!decision) throw Error('Enter a public GitHub repository URL, like https://github.com/owner/repository.');
    if (decision.type === 'choose') { setChoose(decision.options); return; }
    await decide(decision);
  });
  const onConfirm = run(async () => {
    setCard((c) => ({ ...c, phase: 'executing', error: null }));
    try {
      // run() opens the new project, or the one it finds already connected
      const result = await executeCommand('connect_repository', card.prepared.args, ctx);
      if (result?.choose) { setCard(null); setChoose(result.choose); return; } // connected meanwhile on another branch
      if (result?.message) toast(result.message);
      onClose();
    } catch (er) {
      setCard((c) => ({ ...c, phase: 'failed', error: er }));
    }
  });
  const onSources = run(() => canvas(f.sources.trim() || UNTITLED));
  const onBlank = run(() => canvas(f.blank.trim() || UNTITLED));
  const onQuestion = run(async () => {
    const prompt = teachPrompt(f.question, f.depth);
    // Handoff off: copy the question while the submit gesture is still active, so the fallback line is true.
    const copied = !learnHandoff && (await navigator.clipboard?.writeText(prompt).then(() => true, () => false));
    const { href } = await canvas(titleFromQuestion(f.question));
    // T02 §9 through the one hook: with learnHandoff off nothing is sent and the fallback copy comes back.
    const r = await learnAction('teach', { app: slugOf(href), prompt, from: 'start' }, ctx);
    // learnAction owns navigation and every outcome line (contract v3): it sees the canvas already open,
    // so it does not navigate again, and this shows only its message (null on prefilled).
    if (r.status === 'fallback' && !copied) toast("Opened your canvas. Your question wasn't transferred.");
    else if (r.message) toast(r.message);
  });
  const foot = (label, disabled) => (
    <div className="flex items-center justify-end gap-2 pt-4">
      <Button type="button" variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
      {label && <Button type="submit" variant="primary" disabled={busy || disabled}>{busy && <Loader2 size={14} className="animate-spin" />}{label}</Button>}
    </div>
  );
  const choice = (key, value, label) => (
    <button key={value} type="button" role="radio" aria-checked={f[key] === value}
      onClick={() => set(key, key === 'depth' && f.depth === value ? null : value)}
      className={cn('h-8 rounded-lg border px-3 text-sm', f[key] === value ? 'border-ink bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}>{label}</button>
  );
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 animate-[fade-in_100ms_ease-out]" onMouseDown={close}>
      <div ref={self} role="dialog" aria-modal="true" aria-labelledby="start-title" className="mt-[12vh] w-[520px] max-w-full rounded-2xl bg-white p-4 text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="start-title" className="text-sm font-semibold">Start a rabbit hole</h2>
          <IconBtn aria-label="Close" onClick={close} disabled={busy}><X size={14} /></IconBtn>
        </div>
        <p className="pb-3 text-xs text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>
        <Tabs value={path} onValueChange={(p) => { setPath(p); setError(''); }}>
          <TabsList pill className="max-w-full overflow-x-auto">
            {PATHS.map(([id, label]) => { const Icon = PATH_ICONS[id]; return <TabsTrigger key={id} pill value={id} className="gap-1.5"><Icon size={14} strokeWidth={1.75} aria-hidden="true" />{label}</TabsTrigger>; })}
          </TabsList>
          <TabsContent value="repository">
            <form onSubmit={onRepository} className="pt-4">
              <label className="block text-sm">GitHub URL
                <Input autoFocus inputMode="url" placeholder="https://github.com/owner/repository" className="mt-1" {...field('url')} />
              </label>
              <p className="mt-3 text-xs text-ink-2">Only you can see it. Connected repositories can't be deleted yet. Public GitHub only; private repositories aren't supported yet.</p>
              {/* No branch select: a /tree/<branch> link picks one, and a repository GitHub names no default for stops with its branches (commands.js noDefaultBranch). */}
              {!card && !choose && foot('Check repository', !canSubmit('repository', f))}
            </form>
            {choose && (
              <div className="pt-3">
                <p className="pb-2 text-xs text-ink-2">This repository is already connected on another branch.</p>
                <div className="flex flex-wrap gap-2">
                  {choose.map((option) => <Button key={option.label} size="sm" onClick={run(() => decide(option))} disabled={busy}>{option.label}</Button>)}
                </div>
                {foot(null)}
              </div>
            )}
            {/* Outside the form: the card's buttons are plain <button>s and would submit it (ui.jsx:23-41). */}
            {card && (
              <div className="pt-3">
                <ConfirmCard
                  card={{ model: card.prepared.card, blocked: card.prepared.policy.blocked, reason: card.prepared.policy.reason, createdAt: card.createdAt, phase: card.phase, error: card.error }}
                  onConfirm={onConfirm}
                  onChange={() => setCard(null)}
                  onCancel={() => setCard(null)}
                />
                {foot(null)}
              </div>
            )}
          </TabsContent>
          <TabsContent value="sources">
            <form onSubmit={onSources} className="pt-4">
              <label className="block text-sm">Canvas title
                <Input autoFocus placeholder={UNTITLED} className="mt-1" {...field('sources')} />
              </label>
              {connectionSources && <div role="radiogroup" aria-label="Add sources by" className="flex flex-wrap gap-2 pt-3">
                {choice('method', 'upload', 'Upload (PDF)')}
                {choice('method', 'connection', 'From a connection')}
              </div>}
              {f.method === 'upload'
                ? <p className="mt-3 text-xs text-ink-2">After the canvas opens, add the PDF from the canvas menu: Sources → PDF… {LOCAL}</p>
                : (
                  <div className="mt-3 grid grid-cols-3 gap-2 max-sm:grid-cols-1">
                    {PLANNED.map((c) => (
                      <div key={c.id} aria-disabled="true" className="rounded-lg border border-line p-2 text-sm text-ink-2">
                        <div className="flex items-center justify-between gap-1 text-ink">{c.name}<Pill>Planned</Pill></div>
                        <div className="pt-1 text-xs">{c.adds}</div>
                      </div>
                    ))}
                    <Button type="button" size="sm" className="col-span-full justify-self-start" onClick={() => executeCommand('open_settings', { tab: 'connections' }, ctx)}>Manage connections</Button>
                  </div>
                )}
              {foot('Create canvas', !canSubmit('sources', f))}
            </form>
          </TabsContent>
          <TabsContent value="question">
            <form onSubmit={onQuestion} className="pt-4">
              <label className="block text-sm">Question
                <Input autoFocus placeholder="What do you want to understand?" className="mt-1" {...field('question')} />
              </label>
              <div role="radiogroup" aria-label="Depth (optional)" className="flex flex-wrap gap-2 pt-3">
                {['Overview', 'Guided', 'Deep dive'].map((d) => choice('depth', d, d))}
              </div>
              <p className="mt-3 text-xs text-ink-2">Opens a new canvas named after your question. {LOCAL}</p>
              {foot('Create canvas', !canSubmit('question', f))}
            </form>
          </TabsContent>
          <TabsContent value="blank">
            <form onSubmit={onBlank} className="pt-4">
              <label className="block text-sm">Title
                <Input autoFocus placeholder={UNTITLED} className="mt-1" {...field('blank')} />
              </label>
              <p className="mt-3 text-xs text-ink-2">{LOCAL}</p>
              {foot('Create canvas', !canSubmit('blank', f))}
            </form>
          </TabsContent>
        </Tabs>
        {error && <p role="alert" className="pt-3 text-sm text-danger">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
