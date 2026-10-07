import { useState } from 'react';
import { ArrowDownUp, ArrowUpRight, Check, FolderGit2, Globe, HardDrive, Link2, Lock, MonitorSmartphone, MoreHorizontal, PenLine } from 'lucide-react';
import { ago } from '../api.js';
import { ACCESS } from '../canvas-visibility.js';
import { Button, IconBtn, KindIcon, Menu, MenuItem } from '../ui.jsx';
import { Creator, ForkedFrom, Forks, OwnerCheck } from './Provenance.jsx';
import { forkLabel } from './provenance.js';

// The one learning card (card redesign, owner 2026-10-06 §11-14, docs/features/card-redesign.md). Library, Home and
// Explore render it - and the creator profile will - through props, never a per-surface variant:
//   [type]  Title (blue, opens)                        Visibility  ⋮
//           @handle [Owned by you]
//           Forked from "…" · @alice
//   github.com/owner/repo ↗          (a project only)
//   Description, clamped to three lines
//   this browser's content state     (a canvas whose board is not on the server; a project in Home's Continue)
//   [fork] N forks                                 Updated 2h ago
//   actions                          (Start Rabbit Hole and Fork on others' cards, Continue → on Home)
// Blue is navigation and the primary action only (§13): the title, the repository link, the owner badge, Start Rabbit
// Hole. Everything else - description, times, forks, visibility, ⋮, secondary buttons - stays neutral.

// Two columns on a typical desktop (the 1150px pages leave ~958px: two ~471px cards), one on a phone; three only on a
// page genuinely wider than today's.
export const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-4';

// Type icons (§14): one tile per kind, the same on every surface - a project its repository, a canvas its pen; never a
// word and never a colour by topic. The tints stay off the primary blue, which belongs to navigation.
const TYPES = {
  repository: { label: 'Project', Icon: FolderGit2, tone: 'bg-[#f1ebfa] text-[#6b3fb0] dark:bg-[#2e2440] dark:text-[#c2a6f0]' },
  canvas: { label: 'Canvas', Icon: PenLine, tone: 'bg-[#e6f4ea] text-[#22744a] dark:bg-[#1d3226] dark:text-[#86d2a3]' },
};
export function TypeIcon({ kind, schedule }) {
  const t = TYPES[kind];
  return (
    <span data-type-icon={kind} role="img" aria-label={t?.label || 'App'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t?.tone || 'bg-hover text-ink-2'}`}>
      {t ? <t.Icon size={18} strokeWidth={1.75} /> : <KindIcon kind={kind} schedule={schedule} size={18} />}
    </span>
  );
}

// Visibility as neutral metadata (visibility-menu.md's three states); it is changed from the ⋮, never here.
const ACCESS_ICON = { private: Lock, unlisted: Link2, public: Globe };
function Visibility({ access }) {
  const Icon = ACCESS_ICON[access];
  if (!Icon) return null;
  return (
    <span data-card-visibility={access} className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-line px-2 text-xs text-ink-2">
      <Icon size={12} strokeWidth={1.75} />{ACCESS.find((a) => a.id === access).label}
    </span>
  );
}

// This browser's content state, one wording for every surface (owner §5): only for a canvas whose board is not on the
// server - never synced, or refused as over 1.9 MB (continue.js browserOnly; canvas-persistence.md, step 8) - and a
// project's Learn in Home's Continue, whose row does not say yet.
export const IN_THIS_BROWSER = <span className="inline-flex items-center gap-1"><HardDrive size={12} strokeWidth={1.75} className="shrink-0" />Content in this browser</span>;
export const ON_ANOTHER_DEVICE = (
  <>
    <span className="inline-flex items-center gap-1"><MonitorSmartphone size={12} strokeWidth={1.75} className="shrink-0" />On another device</span>
    <span>Its content is stored only in the browser that created it.</span>
  </>
);

// Where a portaled ⋮ menu opens: below its button, or above it when the window has no room below (the larger cards
// put the ⋮ lower on the page). `width` is the menu's, so its right edge lines up with the button's.
export function menuAt(button, width, room = 360) {
  const r = button.getBoundingClientRect();
  return { left: r.right - width, ...(window.innerHeight - r.bottom < room ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) };
}

const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
// A plain click opens in place; a modified one (new tab, new window) stays the browser's.
const plain = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
const TITLE = 'line-clamp-2 break-words text-left text-base font-semibold leading-snug';

// `attrs`: the surface's data attributes (data-library-card, data-recent-card, data-continue-card, data-explore-card).
// `onOpen`: what the card and its title open (null: not openable, as a canvas whose content is in another browser);
// `href`: the title's link, so it opens in a new tab too. `mine`: the viewer owns it. `onMore`: the ⋮. `note`: this
// browser's content state. `actions`: the surface's buttons, in their own row. `cta`: a small text link at the footer's end
// (Home's Continue →). `onForkedFromOpen`: a review fixture's original.
export default function LearningCard({ kind, schedule, m, attrs, href, onOpen, mine = false, access = null, onMore, note, actions, cta, onForkedFromOpen }) {
  const learning = kind === 'repository' || kind === 'canvas';
  const repo = kind === 'repository' && m.sourceUrl;
  return (
    <li {...attrs} onClick={onOpen || undefined} className={`group flex min-h-[220px] min-w-0 flex-col rounded-lg border border-line bg-white p-5 ${onOpen ? 'lift-card cursor-pointer' : ''}`}>
      <div className="flex min-w-0 items-start gap-3">
        <TypeIcon kind={kind} schedule={schedule} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {href && onOpen ? <a data-card-title href={href} onClick={(e) => { e.stopPropagation(); if (plain(e)) { e.preventDefault(); onOpen(); } }} className={`${TITLE} self-start text-accent hover:underline`}>{m.title}</a>
            : onOpen ? <button type="button" data-card-title onClick={stop(onOpen)} className={`${TITLE} cursor-pointer self-start text-accent hover:underline`}>{m.title}</button>
            : <span data-card-title className={`${TITLE} text-ink`}>{m.title}</span>}
          {/* the badge sits beside the @handle, outside data-creator: the attribution line reads exactly @handle */}
          {m.creator && <span className="flex min-w-0 items-center gap-1"><Creator m={m} />{mine && <OwnerCheck owned />}</span>}
          <ForkedFrom m={m} onOpen={onForkedFromOpen} />
        </div>
        {(access || onMore) && (
          <div className="-mt-0.5 -mr-1.5 flex shrink-0 items-center gap-1">
            {access && <Visibility access={access} />}
            {onMore && <IconBtn title="More" aria-label="More" onClick={stop(onMore)}><MoreHorizontal size={16} strokeWidth={1.5} /></IconBtn>}
          </div>
        )}
      </div>
      {(repo || m.description) && (
        <div className="flex min-w-0 flex-col gap-1.5 pt-3">
          {repo && (
            <a data-source-link href={m.sourceUrl} target="_blank" rel="noreferrer" title="Open the repository on GitHub" onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 items-center gap-1 self-start text-[13px] text-accent hover:underline">
              <span className="truncate">{m.source}</span><ArrowUpRight size={13} strokeWidth={1.75} className="shrink-0" />
            </a>
          )}
          {m.description && <p data-card-description className="line-clamp-3 break-words text-[13px] leading-5 text-ink-2">{m.description}</p>}
        </div>
      )}
      {note && <div data-card-note className="flex min-w-0 flex-col gap-0.5 pt-3 text-xs text-ink-3">{note}</div>}
      {learning && (
        <div className="mt-auto flex min-w-0 items-center gap-3 pt-4 text-xs text-ink-3">
          {/* 0 forks reads "0 forks" here (§12); a project row carries no fork count, so it shows none */}
          {m.forkCount !== null && <Forks m={{ forks: forkLabel(m.forkCount) || '0 forks' }} />}
          <span className="flex-1" />
          {m.updated && <span data-updated className="shrink-0">Updated {ago(m.updated)}</span>}
          {cta}
        </div>
      )}
      {actions && <div className={`flex flex-wrap items-center gap-2 pt-3 ${learning ? '' : 'mt-auto'}`}>{actions}</div>}
    </li>
  );
}

// The sort control (§17-18): one neutral button and a menu with the current choice checked, the Filters pattern.
export function SortMenu({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) || options[0];
  return (
    <div className="relative">
      <Button variant="secondary" size="sm" data-sort-control={current.id} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><ArrowDownUp size={13} /> Sort: {current.label}</Button>
      <Menu open={open} onClose={() => setOpen(false)} className="top-9 right-0 w-52">
        <div className="px-2 pb-1 pt-2 text-xs text-ink-3">Sort by</div>
        {options.map((o) => (
          <MenuItem key={o.id} role="menuitemradio" aria-checked={o.id === current.id} data-sort-option={o.id} onClick={() => { setOpen(false); onChange(o.id); }}>
            <span className="flex w-full items-center justify-between">{o.label}{o.id === current.id && <Check size={14} strokeWidth={2} />}</span>
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
