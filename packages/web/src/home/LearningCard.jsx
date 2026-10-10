import { useEffect, useState } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, FolderGit2, Globe, HardDrive, Layers, Link2, Lock, MonitorSmartphone, MoreHorizontal, Shapes } from 'lucide-react';
import { ago } from '../api.js';
import { pickCard, pickedKey, useSurface } from '../agent/surface.js';
import { ACCESS } from '../canvas-visibility.js';
import { Button, IconBtn, KindIcon, Menu, MenuItem } from '../ui.jsx';
import { Creator, ForkedFrom, Forks, OwnerCheck } from './Provenance.jsx';

// The one learning card (card redesign, owner 2026-10-06 §11-14, docs/features/card-redesign.md). Library, Home and
// Explore render it - and the creator profile will - through props, never a per-surface variant:
//   [type]  Title (blue, opens)                        Visibility  ⋮
//           @handle [Owned by you]
//           From owner/repo                          (a published canvas in a project: Explore filtered to it)
//           Forked from "…" · @alice
//   github.com/owner/repo ↗          (a project only)
//   Description, clamped to three lines
//   this browser's content state     (only a canvas or project whose board is not on the server)
//   actions                          (Start Rabbit Hole and [Fork | N] on others' cards)
//   [fork] N forks · Updated 2h ago                  Open →   (one footer line; Continue → on Home instead of Open)
// with the canvas's picture beside it on the right (card-thumbnails.md), above it on a phone.
// A click on the card selects it, never opens it (owner, 2026-10-08): the title link, the Open button and Enter on the
// selected card open it, Open showing on hover or selection (always on touch). N forks is read-only and only when someone
// forked it; Fork itself lives in actions.
// Blue is navigation and the primary action only (§13): the title, the repository link, the owner badge, Start Rabbit
// Hole. Everything else - description, times, forks, visibility, ⋮, secondary buttons - stays neutral.

// Two columns on a typical desktop (the 1150px pages leave ~958px: two ~471px cards), one on a phone; three only on a
// page genuinely wider than today's. Shared with you's small cards keep it.
export const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-4';
// The learning cards, one per row (owner, 2026-10-08: "you can show one card per row", distill.pub's list): two per row
// left their picture about 180 x 90, too small to make out; one per row shows it about 350 x 175.
export const CARD_ROWS = 'grid grid-cols-1 gap-4';
// Every card the same size (owner, 2026-10-08: "each card should be same size but also allow enough space to show an
// image that can be seen"). From md the text column and the picture are one fixed height, so the picture's inset above
// equals its inset below and the footer (N canvases, Updated, Open) ends on the picture's bottom edge (owner, 2026-10-09);
// the card is that height plus its padding (224px). On a phone the picture is on top and the text below it has the fixed
// height. Text clamps (title two lines, description three, two beside actions or a note); a description that still does
// not fit is the one part that gives way, so the footer never moves.
export const CARD_BODY_H = 'md:h-[190px]';
const CARD_TEXT_PHONE = 'max-md:h-[196px] max-md:flex-none';

// Type icons (§14): one tile per kind, the same on every surface - a project its repository, a canvas its pen; never a
// word and never a colour by topic. The tints stay off the primary blue, which belongs to navigation.
const TYPES = {
  repository: { label: 'Project', Icon: FolderGit2, tone: 'bg-[#f1ebfa] text-[#6b3fb0] dark:bg-[#2e2440] dark:text-[#c2a6f0]' },
  canvas: { label: 'Canvas', Icon: Shapes, tone: 'bg-[#e6f4ea] text-[#22744a] dark:bg-[#1d3226] dark:text-[#86d2a3]' },
};
// The picture's quiet stand-in while there is none yet (or it is loading): the canvas's own dot grid on a faint tint of the
// type, with its icon - never an empty grey box.
const PLACEHOLDER = {
  repository: 'bg-[#faf7fd] text-[#6b3fb0]/45 dark:bg-[#211b2b] dark:text-[#c2a6f0]/45',
  canvas: 'bg-[#f5fbf7] text-[#22744a]/45 dark:bg-[#18221b] dark:text-[#86d2a3]/45',
};
export function TypeIcon({ kind, schedule }) {
  const t = TYPES[kind];
  return (
    <span data-type-icon={kind} role="img" aria-label={t?.label || 'App'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t?.tone || 'bg-hover text-ink-2'}`}>
      {t ? <t.Icon size={18} strokeWidth={1.75} /> : <KindIcon kind={kind} schedule={schedule} size={18} />}
    </span>
  );
}

// The card's picture (card-thumbnails.md): right of the text from md at the body's height, 2:1 (380 x 190) where the card
// is wide enough (the 1440 pages) and cropped narrower below that (at most 42% of the card); full width, 2:1, above the
// text on a phone. The server answers 204 when there is none yet, so the <img> errors quietly and the placeholder stays.
export function CardThumbnail({ kind, src }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { if (!src) setShown(false); }, [src]);
  const Icon = TYPES[kind]?.Icon || Shapes;
  return (
    <div data-card-thumbnail={shown ? 'image' : 'placeholder'} aria-hidden="true"
      className={`relative grid aspect-[2/1] w-full max-w-[500px] shrink-0 place-items-center self-start overflow-hidden rounded-md border border-line md:order-last ${CARD_BODY_H} md:w-[min(380px,42%)] md:aspect-auto ${PLACEHOLDER[kind] || PLACEHOLDER.canvas} bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-[size:14px_14px]`}>
      {!shown && <Icon size={22} strokeWidth={1.5} />}
      {src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onLoad={() => setShown(true)} onError={() => setShown(false)}
        className={`absolute inset-0 h-full w-full bg-white object-cover ${shown ? '' : 'invisible'}`} />}
    </div>
  );
}

// Visibility as neutral metadata (visibility-menu.md's three states, and a project's Mixed when its canvases differ); it is
// changed from the ⋮, never here.
const ACCESS_ICON = { private: Lock, unlisted: Link2, public: Globe, mixed: Layers };
function Visibility({ access }) {
  const Icon = ACCESS_ICON[access];
  if (!Icon) return null;
  return (
    <span data-card-visibility={access} className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-line px-2 text-xs text-ink-2">
      <Icon size={12} strokeWidth={1.75} />{ACCESS.find((a) => a.id === access)?.label || 'Mixed'}
    </span>
  );
}

// This browser's content state, one wording for every surface (owner §5): only for a canvas whose board is not on the
// server - never synced, or refused as over 1.9 MB (continue.js browserOnly; canvas-persistence.md, step 8). A project's
// Learn says so only on Home's Continue.
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
// `onOpen`: what the title and Open open (null: not openable, as a canvas whose content is in another browser);
// `href`: the title's link, so it opens in a new tab too. `mine`: the viewer owns it. `onMore`: the ⋮. `note`: this
// browser's content state. `actions`: the surface's buttons, in their own row. `cta`: a small text link at the footer's end
// (Home's Continue →). `onForkedFromOpen`: a review fixture's original. `creatorHref`: the creator's public profile
// (/@handle; docs/features/creator-profile.md), else the card's own @handle's (cardModel), on every surface. `thumbnail`:
// the picture's address (card-thumbnail.js); a canvas or project without one shows the placeholder. `pick`: what a click
// on the card makes the dock composer's pill and context (surface.js pickCard); it stays selected while it is the pill.
export default function LearningCard({ kind, schedule, m, attrs, href, onOpen, mine = false, access = null, onMore, note, actions, cta, onForkedFromOpen, creatorHref: given, thumbnail = null, pick = null }) {
  const surface = useSurface();
  const picked = !!pick && pickedKey(surface) === `${pick.kind}:${pick.slug}`;
  const learning = kind === 'repository' || kind === 'canvas';
  const creatorHref = given || m.creator?.url; // every surface's @handle opens the profile (owner, 2026-10-08)
  const repo = kind === 'repository' && m.sourceUrl;
  return (
    <li {...attrs} tabIndex={onOpen ? 0 : undefined} onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); } : undefined}
      onClick={pick ? () => pickCard(pick) : undefined} data-card-selected={picked ? '' : undefined}
      className={`group select-card flex min-w-0 gap-4 overflow-hidden rounded-lg border border-line bg-white p-4 max-md:flex-col ${onOpen ? 'lift-card' : ''}`}>
      {learning && <CardThumbnail kind={kind} src={thumbnail} />}
      <div data-card-text className={`flex min-h-0 min-w-0 flex-1 flex-col *:shrink-0 ${CARD_BODY_H} ${CARD_TEXT_PHONE}`}>
        <div className="flex min-w-0 items-start gap-3">
          <TypeIcon kind={kind} schedule={schedule} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {href && onOpen ? <a data-card-title href={href} onClick={(e) => { e.stopPropagation(); if (plain(e)) { e.preventDefault(); onOpen(); } }} className={`${TITLE} self-start text-accent hover:underline`}>{m.title}</a>
              : onOpen ? <button type="button" data-card-title onClick={stop(onOpen)} className={`${TITLE} cursor-pointer self-start text-accent hover:underline`}>{m.title}</button>
              : <span data-card-title className={`${TITLE} text-ink`}>{m.title}</span>}
            {/* the badge sits beside the @handle, outside data-creator: the attribution line reads exactly @handle */}
            {m.creator && <span className="flex min-w-0 items-center gap-1">{creatorHref
              ? <a data-creator-link href={creatorHref} title="Open the creator's profile" onClick={(e) => e.stopPropagation()} className="min-w-0 rounded-sm outline-none focus-visible:bg-accent/15 [&:hover_[data-creator]]:text-ink [&:hover_[data-creator]]:underline"><Creator m={m} /></a>
              : <Creator m={m} />}{mine && <OwnerCheck owned />}</span>}
            {/* A published canvas's parent project (project-canvases.md): Explore filtered to that project's published canvases. */}
            {m.project && <a data-card-project href={m.project.href} title="Explore published canvases from this project" onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 items-center gap-1 self-start text-[13px] text-ink-2 hover:text-ink hover:underline">
              <FolderGit2 size={12} strokeWidth={1.75} className="shrink-0" /><span className="truncate">From {m.project.label}</span></a>}
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
          <div data-card-body className="flex min-h-0 min-w-0 shrink! flex-col gap-1 overflow-hidden pt-2">
            {repo && (
              <a data-source-link href={m.sourceUrl} target="_blank" rel="noreferrer" title="Open the repository on GitHub" onClick={(e) => e.stopPropagation()}
                className="inline-flex min-w-0 items-center gap-1 self-start text-[13px] text-accent hover:underline">
                <span className="truncate">{m.source}</span><ArrowUpRight size={13} strokeWidth={1.75} className="shrink-0" />
              </a>
            )}
            {m.description && <p data-card-description className={`${actions || note ? 'line-clamp-2' : 'line-clamp-3'} break-words text-[13px] leading-5 text-ink-2`}>{m.description}</p>}
          </div>
        )}
        {note && <div data-card-note className="flex min-w-0 flex-col gap-0.5 pt-2 text-xs text-ink-3">{note}</div>}
        {actions && <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">{actions}</div>}
        {learning && (
          <div data-card-footer className={`flex min-w-0 items-center gap-3 text-xs text-ink-3 ${actions ? 'pt-2' : 'mt-auto pt-3'}`}>
            {/* m.forks is null at 0, so no "0 forks"; a project row carries no fork count, so it shows none */}
            <Forks m={m} />
            {/* a project's canvases, Main canvas included (docs/features/project-canvases.md) */}
            {m.canvases && <span data-canvas-count className="inline-flex shrink-0 items-center gap-1"><Shapes size={12} strokeWidth={1.5} />{m.canvases}</span>}
            {m.updated && <span data-updated className="shrink-0">Updated {ago(m.updated)}</span>}
            <span className="flex-1" />
            {cta || (onOpen && (
              <Button size="sm" variant="secondary" data-card-open onClick={stop(onOpen)}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100">Open <ArrowRight size={13} className="nudge-arrow" /></Button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// The sort control (§17-18): one neutral button and a menu with the current choice checked, the Filters pattern. `size`:
// the Library's sits beside Filters at its height (md); Explore's stays sm.
export function SortMenu({ options, value, onChange, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) || options[0];
  return (
    <div className="relative">
      <Button variant="secondary" size={size} data-sort-control={current.id} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><ArrowDownUp size={13} /> Sort: {current.label}</Button>
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
