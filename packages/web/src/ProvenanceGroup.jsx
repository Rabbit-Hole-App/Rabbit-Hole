import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, GitBranch, GitFork, Lock, RefreshCw } from 'lucide-react';
import { Menu, toast, useMenuButton } from './ui.jsx';
import { menuKeys } from './TitleHoles.jsx';
import { wsHeaders } from './api.js';

// lucide dropped brand icons - the GitHub mark, inline (as SharePage.jsx draws it)
const Github = ({ size = 14 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true" className="shrink-0">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

// The page's provenance for this viewer (contract C2): one GET per page kind, exactly the C1 object. Anything but a 200 -
// 404 for a page the viewer cannot see, 401 where it needs sign-in, a network failure - is no group, never a banner or a
// sign-in redirect (the page's own read handles those).
export function useProvenance(path) {
  const [provenance, setProvenance] = useState(null);
  useEffect(() => {
    setProvenance(null);
    if (!path) return undefined;
    let live = true;
    fetch(path, { headers: { 'Content-Type': 'application/json', ...wsHeaders() } })
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (live) setProvenance(body); }, () => {});
    return () => { live = false; };
  }, [path]);
  return provenance;
}

// The header button's label is the immediate source as this viewer may see it (contract C1, decision 1A).
export function forkLabel(fork) {
  const first = fork?.ancestors?.[0];
  return first?.state === 'accessible' ? `Forked from ${first.title}` : first?.state === 'private' ? 'Forked from a private canvas' : 'Forked from an unavailable canvas';
}

const WIDTH = 288; // the popover's w-72
const PART = 'flex h-full min-w-0 items-center gap-1.5 px-2 text-xs text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-inset';

// The group and what sits beside it (`children`: the owner page's repository indexing status). `end` (the shared and member
// pages, decision E2): the last item of a wrapping header row, its auto margin keeping it at the row's right edge; the canvas
// header passes end={false}, the row being the last item of its centred group (owner brief 2026-10-16 item 2). `repository`
// (use-repository.js's object, the owner page only) fills the repository dropdown's branch, commit, status and Refresh
// branch. Nothing at all when there is nothing to show, so a canvas with no provenance keeps its header as it was.
export function ProvenanceRow({ provenance, repository = null, end = true, children = null }) {
  if (!hasProvenance(provenance) && !children && !repository?.app) return null;
  return (
    <div data-provenance-row className={`${end ? 'ml-auto ' : ''}flex max-w-full min-w-0 items-center gap-0.5`}>
      <ProvenanceGroup provenance={provenance} repository={repository} />
      {children}
    </div>
  );
}

export const hasProvenance = provenance => !!(provenance?.repository || provenance?.fork?.ancestors?.length);

// The canvas's repository and fork origin, top right of every canvas header (owner brief and decisions 1A-4A,
// C:/s/spec/hdr-provenance.md): one connected group, repository first, each its own target. `provenance` is the server's
// object for this viewer (contract C1); the browser never decides access - what the server left out is not shown.
// Neither relationship: nothing at all, no empty placeholder.
export default function ProvenanceGroup({ provenance, repository: details = null }) {
  // The owner page knows its repository before (or without) the provenance answer: the dropdown still shows it.
  const repository = provenance?.repository || (details?.app?.repo ? { label: details.app.repo, url: `https://github.com/${details.app.repo}` } : null);
  const fork = provenance?.fork?.ancestors?.length ? provenance.fork : null;
  if (!repository && !fork) return null;
  return (
    <div data-provenance role="group" aria-label="Canvas provenance" className="flex h-8 min-w-0 shrink items-stretch rounded-lg border border-line bg-white">
      {repository && <RepositoryMenu repository={repository} details={details} joined={!!fork} />}
      {fork && <ForkHistory fork={fork} joined={!!repository} />}
    </div>
  );
}

// The repository as ONE named dropdown button (owner brief 2026-10-16 item 1): the GitHub mark, owner/name (truncating in the
// button; the full name is the accessible label, the tooltip and the dropdown's link) and a chevron, one hover state and one
// target that only opens and closes. The dropdown: the repository as a GitHub link (a new tab), the branch, the commit as a
// short SHA, the repository status, and Refresh branch for a viewer the repository API lets refresh (canEdit). Real data
// only: what the page does not know (a shared viewer's page has no branch) is left out, never invented.
function RepositoryMenu({ repository, details, joined }) {
  const m = useMenuButton();
  const refresh = () => Promise.resolve(details.refresh()).catch(error => toast(error.message, { tone: 'error' }));
  return (
    <span className="relative flex min-w-0">
      <button type="button" data-repo-menu {...m.buttonProps} title={repository.label} aria-label={`Repository ${repository.label}`}
        className={`${PART} rounded-l-[7px] ${joined ? '' : 'rounded-r-[7px]'} ${m.open ? 'bg-hover text-ink' : ''}`}>
        <Github size={14} />
        <span data-repo-name className="max-w-48 truncate max-md:max-w-28">{repository.label}</span>
        <ChevronDown size={12} strokeWidth={1.8} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${m.open ? 'rotate-180' : ''}`} />
      </button>
      <Menu portal anchor={m.button.current} open={m.open} onClose={m.onClose} style={m.style} className="w-[284px] max-w-[calc(100vw-1rem)] rounded-xl border border-line p-2">
        <RepositoryDetails repository={repository} details={details} onLink={() => m.close(false)} onRefresh={() => { m.close(); refresh(); }} />
      </Menu>
    </span>
  );
}

// The repository dropdown's content, on its own so it renders without a click (provenance-group.test.mjs).
export function RepositoryDetails({ repository, details = null, onLink = null, onRefresh = null }) {
  const app = details?.app, commit = details?.commit || app?.commit_sha || null, busy = ['loading', 'queued', 'indexing'].includes(details?.status);
  const status = details?.status === 'unavailable' ? 'Content unavailable' : app?.status ? `${app.status[0].toUpperCase()}${app.status.slice(1)}` : null;
  return (
    <div data-menu-button-open data-repo-details role="menu" aria-label={`Repository ${repository.label}`} onKeyDown={menuKeys} className="flex flex-col text-sm text-ink">
      <a data-repo-badge role="menuitem" href={repository.url} target="_blank" rel="noopener noreferrer" title={`Open ${repository.label} on GitHub`} aria-label={`Open ${repository.label} on GitHub`}
        onClick={onLink}
        className="flex min-w-0 items-center justify-between gap-2.5 rounded-md p-2.5 font-medium text-ink outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-accent/50">
        <span className="min-w-0 break-all">{repository.label}</span><ExternalLink size={15} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-2" />
      </a>
      {details && <dl className="mx-2.5 mt-1 mb-2.5">
        {app?.branch && <div data-repo-branch className="flex items-center justify-between gap-4 py-1.5"><dt className="text-ink-2">Branch</dt><dd className="flex min-w-0 items-center gap-1.5"><GitBranch size={14} aria-hidden className="shrink-0" /><span className="min-w-0 truncate" title={app.branch}>{app.branch}</span></dd></div>}
        <div data-repo-commit className="flex items-center justify-between gap-4 py-1.5"><dt className="text-ink-2">Commit</dt><dd className="font-mono text-[13px]" title={commit || undefined}>{commit ? commit.slice(0, 7) : 'Awaiting snapshot'}</dd></div>
        {status && <div data-repo-state className="flex items-center justify-between gap-4 py-1.5"><dt className="text-ink-2">Status</dt><dd className="flex items-center gap-1.5"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${app?.status === 'ready' && details.status !== 'unavailable' ? 'bg-[#31845a] dark:bg-[#57ba89]' : app?.status === 'failed' ? 'bg-red-600' : 'bg-ink-3'}`} />{status}</dd></div>}
      </dl>}
      {details?.canEdit && app && <>
        <hr className="mt-0.5 mb-1 border-line" />
        <button type="button" role="menuitem" data-repo-refresh disabled={busy} onClick={onRefresh}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60">
          <RefreshCw size={15} strokeWidth={1.8} aria-hidden className="shrink-0" />{app.status === 'failed' ? 'Retry import' : 'Refresh branch'}</button>
      </>}
    </div>
  );
}

// "Forked from <source>" and its history: an anchored popover listing the recorded ancestry, immediate source first. An
// ancestor this viewer may open is a plain link in a new tab (Ctrl/Cmd-click and the link menu keep working); a private
// one carries no title or link, a missing one says so, and a history the server could not complete says that too.
function ForkHistory({ fork, joined }) {
  // { top, left } while open: pinned under the button and kept inside the window (a phone, or a group near either edge),
  // portaled above the canvas and its toolbars.
  const [open, setOpen] = useState(null);
  const button = useRef(null), pressed = useRef(false), justClosed = useRef(false);
  const list = useId();
  const label = forkLabel(fork);
  const close = () => {
    setOpen(null); button.current?.focus();
    justClosed.current = true; setTimeout(() => { justClosed.current = false; }, 0);
  };
  const toggle = () => {
    // The press that closed it (Menu closes on any press outside itself) must not reopen it.
    if (pressed.current) { pressed.current = false; return; }
    if (open) { close(); return; }
    const at = button.current.getBoundingClientRect();
    setOpen({ top: at.bottom + 4, left: Math.max(8, Math.min(at.right - WIDTH, window.innerWidth - WIDTH - 8)) });
  };
  return (
    <span className={`relative flex min-w-0 ${joined ? 'border-l border-line' : ''}`}>
      <button ref={button} type="button" data-provenance-fork title={label} aria-label={label} aria-expanded={!!open} aria-controls={open ? list : undefined}
        onPointerDown={() => { pressed.current = justClosed.current; }} onClick={toggle}
        className={`${PART} ${joined ? '' : 'rounded-l-[7px]'} rounded-r-[7px] ${open ? 'bg-hover text-ink' : ''}`}>
        <GitFork size={14} strokeWidth={1.8} aria-hidden className="shrink-0" />
        <span className="max-w-52 truncate max-md:max-w-24"><span className="max-md:hidden">Forked from </span>{label.slice('Forked from '.length)}</span>
        <ChevronDown size={12} strokeWidth={1.8} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Menu portal anchor={button.current} open={!!open} onClose={close} style={open || undefined} className="w-72 max-w-[calc(100vw-1rem)] p-2">
        <ForkHistoryList id={list} fork={fork} />
      </Menu>
    </span>
  );
}

// The popover's content, on its own so it renders without a click (provenance-group.test.mjs).
export function ForkHistoryList({ fork, id }) {
  const last = fork.ancestors.length - 1;
  return (
    <div id={id} data-fork-history role="region" aria-label="Fork history">
      <p className="px-1.5 pb-1.5 text-xs font-medium text-ink-2">Fork history</p>
      <ol className="flex flex-col">
        {fork.ancestors.map((ancestor, index) => (
          <li key={index} data-ancestor={ancestor.state} className="flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-sm">
            <span aria-hidden className="w-4 shrink-0 text-center text-xs text-ink-3">{index + 1}</span>
            {ancestor.state === 'accessible'
              ? <a data-ancestor-link href={ancestor.url} target="_blank" rel="noopener noreferrer" title={ancestor.title} className="min-w-0 truncate rounded-sm text-ink underline-offset-2 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-accent/50">{ancestor.title}</a>
              : ancestor.state === 'private'
                ? <span className="flex min-w-0 items-center gap-1 text-ink-2"><Lock size={12} aria-hidden className="shrink-0" />A private canvas</span>
                : <span className="min-w-0 text-ink-3">An unavailable canvas</span>}
            {index === last && fork.original && <span data-ancestor-original className="ml-auto shrink-0 rounded-full bg-hover px-1.5 py-0.5 text-[11px] text-ink-2">Original</span>}
          </li>
        ))}
      </ol>
      {!fork.complete && <p data-fork-history-incomplete className="px-1.5 pt-1.5 text-xs text-ink-3">Earlier history is unavailable</p>}
    </div>
  );
}
