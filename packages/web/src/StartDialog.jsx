import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CircleAlert, Check, File, FileText, FolderGit2, Globe, Link2, Loader2, Upload, Video, X } from 'lucide-react';
import { moreBranches, prepareCommand, withBranch } from './agent/commands.js';
import { acceptList } from './file-capabilities.js';
import { repositoryDecision } from './start.js';
import { COPY, capabilities, canBlank, canStart, contextNote, effective, editable, excluded, problems, statusText, summaryText } from './start-draft.js';
import { startJob, useStartDraft } from './start-run.js';
import { Button, cn, IconBtn, Input, Select } from './ui.jsx';

const MORE = 'More branches'; // the Branch select's last option while GitHub has more than this page
const REPOSITORY_FACTS = "Only you can see it. Connected repositories can't be deleted yet. Public GitHub only; private repositories aren't supported yet.";
const LINK_ICONS = { arxiv: FileText, youtube: Video, wikipedia: BookOpen, webpage: Globe };
const rowIcon = (row) => (row.kind === 'repository' ? FolderGit2 : row.kind === 'link' ? LINK_ICONS[row.meta.type] || Link2 : /\.(md|txt|pdf|docx?)$/i.test(row.label) ? FileText : File);

// Start a rabbit hole (owner brief 2026-10-23, docs/features/start-sources.md): one dialog, one draft of files, links and at
// most one repository, each source with its own Use as context and Add to canvas. The draft and the start job live in
// start-run.js, so closing this never cancels a start; the dialog only renders them. Hosted once by StartHost on 'small:start'.
export default function StartDialog({ ctx, initial, onClose }) {
  const self = useRef(null), picker = useRef(null);
  const draft = useStartDraft();
  const [adding, setAdding] = useState(initial === 'repository' ? 'repository' : null); // 'link' | 'repository' | null
  const [linkText, setLinkText] = useState(''), [url, setUrl] = useState('');
  const [card, setCard] = useState(null); // a checked repository: { prepared, page }
  const [choose, setChoose] = useState(null); // the router's open-or-connect options for another branch
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [over, setOver] = useState(false);
  useEffect(() => { if (initial === 'repository') setAdding('repository'); }, [initial]);
  const starting = draft.phase === 'starting';
  const close = () => onClose();

  useEffect(() => {
    // Only the top dialog takes Esc: Settings, or a window opened over this one, closes first. Tab stays inside.
    const keys = (e) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== self.current) return;
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab') return;
      const items = [...self.current.querySelectorAll('button, input, select, [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !self.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [onClose]);

  const hide = () => { setAdding(null); setUrl(''); setLinkText(''); setCard(null); setChoose(null); setError(''); };
  // Cancel on a checked repository goes back to the field with the URL kept (owner, 2026-10-08); on a bare input it hides it. Either way the list stays.
  const cancel = () => { if (card || choose) { setCard(null); setChoose(null); } else hide(); };
  const reveal = (kind) => { setError(''); setAdding(adding === kind ? null : kind); };
  const addFiles = (list) => { if (list?.length) startJob.addFiles(list); };

  // ---- link
  const onLink = (e) => {
    e.preventDefault();
    const before = startJob.getDraft().rows.length;
    startJob.dispatch({ type: 'add-link', text: linkText });
    if (startJob.getDraft().rows.length > before) hide();
  };

  // ---- repository: the bar's rule (start.js repositoryDecision) decides, the dialog renders it; nothing is created here
  const attempt = (work) => async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); } catch (er) { setError(er.message); } finally { setBusy(false); }
  };
  const addExisting = (found, from) => {
    startJob.dispatch({ type: 'add-repository', url: from, repo: found.repo || found.title, branch: found.branch || 'default', existing: { slug: found.slug, kind: found.kind, title: found.title } });
    hide();
  };
  const connected = (slug) => (ctx.catalog || []).find((row) => row.name === slug) || {};
  const decide = async ({ name, args }) => {
    if (name === 'open_resource') { const row = connected(args.slug); addExisting({ ...args, repo: row.repo, branch: row.branch }, url); return; }
    // resolve() reads the default branch, so a private or missing repository fails here, before anything is added.
    const prepared = await prepareCommand('connect_repository', args, ctx);
    if (prepared.args.existing) { const row = connected(prepared.args.existing); addExisting({ slug: prepared.args.existing, kind: 'repository', title: row.repo || prepared.args.repo, repo: prepared.args.repo, branch: row.branch }, url); return; }
    setChoose(null);
    setCard({ prepared });
  };
  const onCheck = attempt(async () => {
    if (startJob.getDraft().rows.some((row) => row.kind === 'repository')) throw Error(COPY.oneRepository);
    const decision = repositoryDecision(url, ctx);
    if (!decision) throw Error('Enter a public GitHub repository URL, like https://github.com/owner/repository.');
    if (decision.type === 'choose') { setChoose(decision.options); return; }
    await decide(decision);
  });
  // Branch (owner, 2026-10-08): GitHub's default, or the /tree/<branch> a link named, preselected; another pick rebuilds
  // the choice for that branch (commands.js withBranch), or offers the project already connected on it.
  const branches = card && [...new Set([card.prepared.args.branch, ...(card.prepared.args.branches || [])])];
  const pickBranch = (value) => {
    if (value !== MORE) { setCard((c) => ({ ...c, prepared: withBranch(c.prepared, value, ctx) })); return; }
    attempt(async () => {
      const page = (card.page || 1) + 1, meta = await moreBranches(card.prepared.args.url, page);
      setCard((c) => ({ ...c, page, prepared: { ...c.prepared, args: { ...c.prepared.args, branches: [...c.prepared.args.branches, ...(meta.branches || [])], hasMore: !!meta.hasMore } } }));
    })();
  };
  const addRepository = () => {
    const { prepared } = card, args = prepared.args;
    if (prepared.open) { addExisting({ slug: prepared.open.slug, kind: prepared.open.kind, title: prepared.open.title, repo: args.repo, branch: prepared.open.branch || args.branch }, args.url); return; }
    const { url: from, repo, branch, newBranch, defaulted } = args;
    startJob.dispatch({ type: 'add-repository', url: from, repo, branch, connect: { url: from, repo, branch, ...(newBranch ? { newBranch } : {}), ...(defaulted ? { defaulted } : {}) } });
    hide();
  };

  // ---- start
  const act = (work) => async () => { setError(''); try { await work(); } catch (er) { setError(er.message); } };
  // A start that finished cleanly has nothing left to show; one that needs another try keeps the list (or the chip) up.
  const onStart = act(async () => { if (await startJob.start(ctx)) { const d = startJob.getDraft(); if (!d.error && d.phase !== 'partial') onClose(); } });
  const onBlank = act(async () => { if (await startJob.blank(ctx) && !startJob.getDraft().error) onClose(); });

  const list = problems(draft), global = list.filter((p) => p.id === null);
  const hasRows = draft.rows.length > 0;
  const shown = error || draft.error;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 animate-[fade-in_100ms_ease-out]" onMouseDown={close}>
      <div ref={self} role="dialog" aria-modal="true" aria-labelledby="start-title" data-start-dialog data-start-phase={draft.phase} onMouseDown={(e) => e.stopPropagation()}
        className="mt-[8vh] flex max-h-[84vh] w-[560px] max-w-full flex-col rounded-2xl bg-white p-4 text-ink shadow-pop">
        <div className="flex items-center justify-between">
          <h2 id="start-title" className="text-sm font-semibold">{COPY.title}</h2>
          <IconBtn aria-label="Close" onClick={close}><X size={14} /></IconBtn>
        </div>
        <p className="pb-3 text-xs text-ink-2">{COPY.subtitle}</p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={starting} onClick={() => picker.current?.click()} autoFocus={!adding}><Upload size={14} aria-hidden="true" />{COPY.addFiles}</Button>
            <Button variant="secondary" disabled={starting} aria-expanded={adding === 'link'} onClick={() => reveal('link')}><Link2 size={14} aria-hidden="true" />{COPY.addLink}</Button>
            <Button variant="secondary" disabled={starting} aria-expanded={adding === 'repository'} onClick={() => reveal('repository')}><FolderGit2 size={14} aria-hidden="true" />{COPY.connectRepository}</Button>
            <input ref={picker} type="file" multiple accept={acceptList()} className="hidden" tabIndex={-1} data-start-file-input aria-label="Choose files"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {adding === 'link' && (
            <form onSubmit={onLink} data-start-input="link" className="flex flex-wrap items-end gap-2 pt-3">
              <label className="block min-w-0 flex-1 basis-56 text-sm">Link
                <Input autoFocus inputMode="url" placeholder="https://" className="mt-1" value={linkText} onChange={(e) => { setLinkText(e.target.value); startJob.dispatch({ type: 'dismiss-notices' }); }} />
              </label>
              <Button type="submit" variant="primary" disabled={!linkText.trim()}>Add</Button>
              <Button type="button" variant="secondary" onClick={cancel}>Cancel</Button>
            </form>
          )}

          {adding === 'repository' && (
            <div data-start-input="repository" className="pt-3">
              <form onSubmit={onCheck} className="flex flex-wrap items-end gap-2">
                <label className="block min-w-0 flex-1 basis-56 text-sm">GitHub URL
                  <Input autoFocus inputMode="url" placeholder="https://github.com/owner/repository" className="mt-1" value={url} onChange={(e) => { setUrl(e.target.value); setError(''); setCard(null); setChoose(null); }} />
                </label>
                {!card && !choose && <Button type="submit" variant="primary" disabled={busy || !url.trim()}>{busy && <Loader2 size={14} className="animate-spin" />}Check repository</Button>}
                <Button type="button" variant="secondary" onClick={hide}>Cancel</Button>
              </form>
              <p className="mt-2 text-xs text-ink-2">{REPOSITORY_FACTS}</p>
              {choose && (
                <div className="pt-3">
                  <p className="pb-2 text-xs text-ink-2">This repository is already connected on another branch.</p>
                  <div className="flex flex-wrap gap-2">
                    {choose.map((option) => <Button key={option.label} size="sm" disabled={busy} onClick={attempt(() => decide(option))}>{option.label}</Button>)}
                  </div>
                </div>
              )}
              {card && (
                <div className="pt-3">
                  {branches && (
                    <div className="flex items-center gap-3 pb-3 text-sm"><span aria-hidden="true">Branch</span>
                      <span className="min-w-0 flex-1">
                        <Select aria-label="Branch" data-branch-select value={card.prepared.args.branch} options={card.prepared.args.hasMore ? [...branches, MORE] : branches} onChange={pickBranch} />
                      </span>
                    </div>
                  )}
                  {card.prepared.open && (
                    <p data-branch-connected className="pb-3 text-sm">{card.prepared.args.repo} at {card.prepared.args.branch} is already connected: {card.prepared.open.title}{card.prepared.open.branch ? ` (${card.prepared.open.branch})` : ''}. It opens, and the other sources are added to it.</p>
                  )}
                  {card.prepared.policy.blocked && <p role="note" className="pb-3 text-xs text-warn">{card.prepared.policy.reason}</p>}
                  <Button variant="primary" disabled={busy || card.prepared.policy.blocked} onClick={addRepository}>Add repository</Button>
                </div>
              )}
            </div>
          )}

          <button type="button" disabled={starting} data-start-drop aria-label="Drop files here or choose them" onClick={() => picker.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (!starting) addFiles(e.dataTransfer.files); }}
            className={cn('mt-3 flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-code text-sm text-ink-2 transition-colors duration-100 hover:bg-hover disabled:opacity-50', over && 'bg-hover')}>
            <Upload size={16} strokeWidth={1.5} aria-hidden="true" />
            Drop files here
          </button>

          {draft.notices.length > 0 && <ul role="status" data-start-notices className="pt-3 text-xs text-warn">{draft.notices.map((n) => <li key={n} className="break-words">{n}</li>)}</ul>}

          {hasRows && (
            <div className="pt-4">
              <p className="text-xs text-ink-2">{COPY.explainContext}</p>
              <p className="pb-2 text-xs text-ink-2">{COPY.explainCanvas}</p>
              <ul data-start-list className="space-y-2">
                {draft.rows.map((row) => <Row key={row.id} row={row} draft={draft} problem={list.find((p) => p.id === row.id)?.message || (excluded(row, draft) ? `${COPY.choose} ${COPY.excluded}` : '')} />)}
              </ul>
            </div>
          )}
        </div>

        <div className="pt-3">
          <p data-start-summary className="text-xs text-ink-2">{summaryText(draft)}</p>
          {global.map((p) => <p key={p.code} role="alert" className="pt-1 text-xs text-danger">{p.message}</p>)}
          {shown && <p role="alert" data-start-error className="pt-2 text-sm text-danger">{shown}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
            <Button variant="ghost" disabled={!canBlank(draft)} onClick={onBlank}>{COPY.blank}</Button>
            <Button variant="primary" disabled={!canStart(draft)} onClick={onStart}>{starting && <Loader2 size={14} className="animate-spin" />}{COPY.start}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ row, draft, problem }) {
  const Icon = rowIcon(row), can = capabilities(row, draft), on = effective(row, draft), free = editable(row, draft);
  const status = statusText(row), working = ['checking', 'uploading', 'importing'].includes(row.status);
  const set = (option) => (e) => startJob.dispatch({ type: 'set-option', id: row.id, option, value: e.target.checked });
  const note = contextNote(row);
  const option = (key, label) => (
    <label className={cn('inline-flex min-h-8 items-center gap-2 text-sm', !(can[key] && free) && 'opacity-50')}>
      <input type="checkbox" data-start-option={key} className="h-4 w-4 accent-ink" checked={on[key]} disabled={!can[key] || !free} onChange={set(key)} aria-describedby={problem ? `${row.id}-problem` : undefined} />
      {label}
    </label>
  );
  return (
    <li data-start-row={row.kind} data-status={row.status} className="rounded-lg border border-line p-3">
      <div className="flex items-start gap-2">
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{row.label}</p>
          <p className="break-words text-xs text-ink-2">{row.detail}</p>
          <p aria-live="polite" data-start-status className={cn('flex items-start gap-1 break-words text-xs', row.status === 'failed' ? 'text-danger' : 'text-ink-2')}>
            {working && <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />}
            {row.status === 'ready' && <Check size={12} className="mt-0.5 shrink-0" aria-hidden="true" />}
            {row.status === 'failed' && <CircleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <span className="min-w-0">{status}{row.status === 'failed' && row.kind === 'link' && row.meta.type === 'webpage' ? ' Add the file, or paste its text on the canvas.' : ''}</span>
          </p>
        </div>
        {row.status !== 'ready' && <Button size="sm" variant="ghost" className="shrink-0" aria-label={`Remove ${row.label}`} disabled={!free} onClick={() => startJob.dispatch({ type: 'remove', id: row.id })}>{COPY.remove}</Button>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0 pl-6">
        {option('context', row.kind === 'repository' ? COPY.connectContext : COPY.context)}
        {option('canvas', row.kind === 'repository' ? COPY.overview : COPY.canvas)}
      </div>
      {note && <p data-start-context-note className="pl-6 text-xs text-ink-2">{note}</p>}
      {problem && <p id={`${row.id}-problem`} data-start-problem className="pl-6 pt-1 text-xs text-danger">{problem}</p>}
    </li>
  );
}
