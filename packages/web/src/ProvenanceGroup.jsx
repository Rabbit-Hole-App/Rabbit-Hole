import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, GitFork, Lock } from 'lucide-react';
import { Menu } from './ui.jsx';
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

// The group and what sits beside it (`children`: the owner page's repository status and details), as the last item of a
// wrapping header row (decision E2): its auto margin keeps it at the row's right edge, on the first row when everything fits
// and alone at the right of the next row when the header wraps. Nothing at all when there is nothing to show, so a canvas
// with no provenance keeps its header as it was.
export function ProvenanceRow({ provenance, children = null }) {
  if (!hasProvenance(provenance) && !children) return null;
  return (
    <div data-provenance-row className="ml-auto flex max-w-full min-w-0 items-center gap-0.5">
      <ProvenanceGroup provenance={provenance} />
      {children}
    </div>
  );
}

export const hasProvenance = provenance => !!(provenance?.repository || provenance?.fork?.ancestors?.length);

// The canvas's repository and fork origin, top right of every canvas header (owner brief and decisions 1A-4A,
// C:/s/spec/hdr-provenance.md): one connected group, repository first, each its own target. `provenance` is the server's
// object for this viewer (contract C1); the browser never decides access - what the server left out is not shown.
// Neither relationship: nothing at all, no empty placeholder.
export default function ProvenanceGroup({ provenance }) {
  if (!hasProvenance(provenance)) return null;
  const repository = provenance.repository || null, fork = provenance.fork?.ancestors?.length ? provenance.fork : null;
  return (
    <div data-provenance role="group" aria-label="Canvas provenance" className="flex h-8 min-w-0 shrink items-stretch rounded-lg border border-line bg-white">
      {repository && (
        <a data-repo-badge href={repository.url} target="_blank" rel="noopener noreferrer" title={`Open ${repository.label} on GitHub`} aria-label={`Open ${repository.label} on GitHub`}
          className={`${PART} rounded-l-[7px] ${fork ? '' : 'rounded-r-[7px]'}`}>
          <Github size={14} />
          <span className="max-w-44 truncate max-md:max-w-24">{repository.label}</span>
          <ExternalLink size={12} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />
        </a>
      )}
      {fork && <ForkHistory fork={fork} joined={!!repository} />}
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
