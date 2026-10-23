import { useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import { DOCK_PAD } from './ChatComposer.jsx';
import { MINIMAP_SIZE } from './CanvasMinimap.jsx';
import { uiPrefs } from './ui-prefs.js';
import { PRODUCT } from './flags.js';
import logoBlack from './assets/rabbit-hole-black.png';
import logoWhite from './assets/rabbit-hole-white.png';

// The canvas loading skeleton (owner brief 2026-10-23): while a canvas loads, each surface shows ITS OWN shell - the owner's
// canvas (LearnPage), a share link or Explore canvas (SharedBoardPage), a member's canvas (MemberBoardPage) and an embed - with
// neutral blocks where content is not loaded yet, never the retired "Learn" page or an invented canvas. The real pages build
// their header, canvas frame and right panel from the constants below, so the skeleton cannot drift into another layout, and the
// hand-over to the loaded page moves no header, panel or canvas edge.

// ---- shell constants, shared with the real pages ----
// The owner's canvas (LearnPage): the header floats over the canvas (headerOver), Chat's panel on the right.
export const OWNER_MAIN = 'relative flex min-w-0 flex-1 overflow-hidden max-lg:flex-col max-lg:overflow-y-auto';
export const OWNER_HEADER = 'flex items-center justify-center-safe px-12 pt-3 pb-1 max-md:px-2 max-md:pt-2';
export const OWNER_HEADER_OVER = 'pointer-events-none absolute inset-x-0 top-0 z-40 [&>*]:pointer-events-auto';
export const OWNER_HEADER_GROUP = 'flex max-w-full min-w-0 flex-wrap items-center justify-center-safe gap-1 gap-y-0.5';
export const OWNER_CANVAS = 'relative min-h-0 flex-1 max-lg:h-[var(--phone-canvas-h,75dvh)] max-lg:flex-none';
// CanvasPage's column: LearnPage's <main> is not the sidebar's sibling, so the column restores the phone top strip's padding.
export const CANVAS_PAGE_COLUMN = 'flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)';
export const CHAT_PANEL = { defaultWidth: 420, storageKey: 'rh.chat.width', className: 'px-5 pt-3 pb-4' };
// A share link, an Explore canvas and a member's canvas (SharedCanvasShell.jsx's panel).
export const SHARED_PANEL = { phoneHeight: 'max-lg:h-[50dvh] max-lg:min-h-64', storageKey: 'rh.viewer.panel.width', defaultWidth: 400, className: 'px-5 pt-3 pb-4' };
export const VIEWER_CANVAS = 'relative min-h-0 min-w-0 flex-1 max-lg:h-[75dvh] max-lg:flex-none';
export const SHARED_MAIN = 'flex h-screen bg-white max-lg:flex-col max-lg:overflow-y-auto';
export const SHARED_SECTION = '@container flex min-h-0 min-w-0 flex-1 flex-col max-lg:flex-none';
export const SHARED_HEADER = 'grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 px-3 py-2 @5xl:grid-cols-[minmax(17rem,1fr)_minmax(0,auto)_minmax(17rem,1fr)] @5xl:gap-x-3 @5xl:px-4';
export const SHARED_HEADER_LEFT = 'col-start-1 row-start-1 flex min-w-0 items-center @5xl:col-auto @5xl:row-auto';
export const SHARED_HEADER_CENTER = 'col-span-3 row-start-2 flex min-w-0 flex-col items-center @5xl:col-span-1 @5xl:col-auto @5xl:row-auto';
export const SHARED_HEADER_RIGHT = 'col-start-3 row-start-1 flex min-w-0 items-start justify-end gap-2 @5xl:col-auto @5xl:row-auto [&_[data-panel-toggle]]:h-11 [&_[data-panel-toggle]]:w-11 @5xl:[&_[data-panel-toggle]]:h-8 @5xl:[&_[data-panel-toggle]]:w-8';
// The title row with the creator's @handle line below it, flush with the title's left edge (owner brief 2026-10-23); centred as one block.
export const SHARED_TITLE_BLOCK = 'flex min-w-0 max-w-full flex-col items-start';
export const SHARED_TITLE_ROW = 'flex min-w-0 max-w-full items-center gap-2';
export const GUEST_NOTE = "Changes aren't saved. Fork to keep them";
export const GUEST_NOTE_BOX = 'max-w-36 text-right text-xs leading-tight';
export const MEMBER_MAIN = 'flex h-screen flex-col bg-white max-lg:overflow-y-auto';
export const MEMBER_HEADER = 'flex shrink-0 flex-wrap items-center gap-2 gap-y-2 px-4 py-2';
export const MEMBER_BODY = 'relative flex min-h-0 flex-1 max-lg:flex-none max-lg:flex-col';
export const EMBED_MAIN = 'relative flex h-screen min-h-0 flex-col bg-white';
export const EMBED_HEADER = 'flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-1.5';
export const EMBED_BODY = 'relative flex min-h-0 flex-1';
export const EMBED_CANVAS = 'relative min-h-0 min-w-0 flex-1';

// Below lg the owner's canvas fills the screen left under the page chrome, never under 45% of it (LearnPage, WP7).
export function phoneCanvasHeight(frame) {
  if (!frame || window.innerWidth >= 1024) return null;
  const screen = window.visualViewport?.height || window.innerHeight;
  const top = frame.getBoundingClientRect().top + (frame.closest('main')?.scrollTop || 0);
  return Math.round(Math.max(screen * 0.45, screen - top));
}

// The shared canvas's logo, home (SharedBoardPage header, left area).
export function SharedBrand(props) {
  return (
    <a href="/" {...props} className="flex shrink-0 items-center rounded-lg no-underline outline-none focus-visible:ring-2 focus-visible:ring-accent/60 h-11 w-11 justify-center @5xl:h-8 @5xl:w-8 @5xl:justify-start" aria-label={`${PRODUCT} home`}>
      <img src={logoBlack} alt="" width="32" height="32" className="h-8 w-8 dark:hidden" />
      <img src={logoWhite} alt="" width="32" height="32" className="hidden h-8 w-8 dark:block" />
    </a>
  );
}

// A member's canvas header starts with the product's mark and name (MemberBoardPage).
export function MemberBrand() {
  return (
    <a href="/" className="flex shrink-0 items-center gap-2 border-r border-line pr-3 no-underline" aria-label={`${PRODUCT} home`}>
      <img src="/landing/favicon-32-v1.png" alt="" width="20" height="20" className="h-5 w-5 rounded-sm" /><span className="text-sm font-semibold text-ink">{PRODUCT}</span>
    </a>
  );
}

// An embed's way to the full site; it works before the canvas has loaded, so the loading embed shows it too.
export function EmbedOpenLink({ href }) {
  if (!href) return null;
  return <a data-embed-open href={href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 text-sm text-ink underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent/60">Open in Rabbit Hole<ExternalLink size={12} aria-hidden /></a>;
}

// ---- the skeleton ----
// A neutral block; its own rounded-* or bg-* replaces the default (two utilities of one property would race in the stylesheet).
const Bone = ({ className = '', ...props }) => <i aria-hidden="true" {...props} className={`block shrink-0 ${/(^|\s)rounded-/.test(className) ? '' : 'rounded-lg'} ${/(^|\s)bg-/.test(className) ? '' : 'bg-hover'} ${className}`} />;
const bones = (count, className) => Array.from({ length: count }, (_, index) => <Bone key={index} className={className} />);
// One line for assistive technology; the page itself shows no text while it loads.
const Status = () => <span role="status" className="sr-only">Loading canvas</span>;
// The drawing toolbar's groups (AdaptiveCanvas NAV_TOOLS, DRAW_TOOLS, SHAPE_TOOLS, then Keep tool active, Snap to grid and Style).
// shortcut: hardcoded counts, AdaptiveCanvas stays out of this module's chunk; the toolbar floats, so a drift moves no layout.
const TOOL_GROUPS = [3, 6, 10, 3];
const ZOOM_ROW_H = 30; // the zoom row: 28px IconBtns in a 1px border

// The canvas's floating chrome inside its frame: the tools column at the left (shown as View > Toolbar says) and the bottom strip's
// lower-left group, the minimap (as View > Minimap says) over the zoom row. Also the real pages' fallback while the canvas code loads.
export function CanvasChromeLoading({ tools = true, feedback = false, top = 0 }) {
  const prefs = uiPrefs();
  const lowerLeft = (prefs.minimap ? MINIMAP_SIZE.h + 8 : 0) + ZOOM_ROW_H + 20;
  return (
    <div aria-hidden="true" data-loading-chrome className="pointer-events-none absolute inset-0">
      {tools && prefs.toolbar && (
        <div className="absolute bottom-0 left-0 flex w-[84px] flex-col justify-center pl-2" style={{ top, paddingBottom: lowerLeft }}>
          <div data-loading-toolbar className="grid max-h-full grid-cols-2 gap-0.5 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-md">
            <i className="col-span-2 block h-5" />
            {TOOL_GROUPS.flatMap((count, group) => [
              ...(group ? [<i key={`rule-${group}`} className="col-span-2 mx-1.5 my-0.5 block h-px bg-line" />] : []),
              ...Array.from({ length: count }, (_, index) => <Bone key={`${group}-${index}`} className="h-8 w-8" />),
            ])}
          </div>
        </div>
      )}
      <div className={`absolute inset-x-0 bottom-0 flex items-end gap-2 ${DOCK_PAD}`}>
        {feedback && <Bone className="h-8 w-8 border border-line bg-white shadow-sm" />}
        <div className="flex flex-col gap-2">
          {prefs.minimap && <i data-loading-minimap style={{ width: MINIMAP_SIZE.w, height: MINIMAP_SIZE.h }} className="block rounded-xl border border-line bg-white shadow-md" />}
          <i style={{ width: MINIMAP_SIZE.w, height: ZOOM_ROW_H }} className="block rounded-lg border border-line bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}

// The right panel at its real width (the same component, storage key and default): the tab row, then a neutral body.
function PanelLoading({ panel, tabs, tools, chat = true }) {
  return (
    <ResizableSidePanel {...panel} data-loading-panel>
      <div className="-mx-5 mb-3 flex shrink-0 items-center justify-between gap-2 border-b border-line px-5 pb-2.5">
        <div className="flex min-w-0 items-center gap-0.5 p-0.5">{bones(tabs, 'h-8 w-[30px] rounded-md')}</div>
        <div className="ml-4 flex shrink-0 items-center gap-0.5">{bones(tools, 'h-8 w-[30px] rounded-md')}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {chat ? <i className="mt-auto block h-24 rounded-xl border border-line" /> : bones(3, 'h-14 w-full rounded-xl')}
      </div>
    </ResizableSidePanel>
  );
}

// The owner's canvas, inside the Shell (SharePage, CanvasPage): Back at the top-left corner, then one centred group - the title,
// the menubar (Insert, Edit, Arrange, View) and the one-press actions - over the canvas; Chat's panel at the right.
export function OwnerCanvasLoading() {
  const frame = useRef(null);
  const [phoneHeight, setPhoneHeight] = useState(null);
  useLayoutEffect(() => {
    const fit = () => setPhoneHeight(phoneCanvasHeight(frame.current));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <>
      <Status />
      <main inert data-canvas-loading="owner" aria-busy="true" className={OWNER_MAIN}>
        <section className="min-h-0 min-w-0 flex-1 max-lg:flex-none">
          <div className="expanded-page-frame @container/frame relative mx-auto flex h-full w-full min-h-0 flex-col">
            <div data-loading-header className={`${OWNER_HEADER_OVER} ${OWNER_HEADER}`}>
              <Bone className="absolute top-3 left-3 h-8 w-8 rounded-xl border border-line bg-white shadow-md max-md:hidden" />
              <div className={OWNER_HEADER_GROUP}>
                <Bone className="h-8 w-36" />
                <span className="flex items-center gap-0.5">{bones(4, 'h-8 w-[72px] max-md:w-12')}</span>
                <span className="flex items-center gap-0.5">{bones(4, 'h-8 w-8')}</span>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div ref={frame} data-loading-canvas className={OWNER_CANVAS} style={phoneHeight ? { '--phone-canvas-h': `${phoneHeight}px` } : undefined}>
                <CanvasChromeLoading feedback top={48} />
              </div>
            </div>
          </div>
        </section>
        <PanelLoading panel={CHAT_PANEL} tabs={5} tools={3} />
      </main>
    </>
  );
}

// The owner's canvas as CanvasPage places it (SharePage, before the canvas record or CanvasPage's code is here).
export function CanvasPageLoading() {
  return <div className={CANVAS_PAGE_COLUMN}><OwnerCanvasLoading /></div>;
}

// A share link (/b) or an Explore canvas (/e): logo; the title, menus and the creator's @handle line centred as one block; Fork with its note and the panel
// toggle at the right; the canvas; the right panel. Laid out for a visitor (their temporary copy has the toolbar and the note).
export function SharedCanvasLoading() {
  return (
    <>
      <Status />
      <main inert data-canvas-loading="shared" aria-busy="true" className={SHARED_MAIN}>
        <section className={SHARED_SECTION}>
          <header data-loading-header className={SHARED_HEADER}>
            <div className={SHARED_HEADER_LEFT}><SharedBrand tabIndex={-1} /></div>
            <div className={SHARED_HEADER_CENTER}>
              <div className={SHARED_TITLE_BLOCK}>
                <div className={SHARED_TITLE_ROW}>
                  <Bone className="h-5 w-40 max-w-full rounded-md" />
                  <span className="hidden items-center gap-0.5 @5xl:flex">{bones(4, 'h-8 w-[72px]')}</span>
                  <Bone className="h-11 w-11 @5xl:hidden" />
                </div>
                {/* The creator's @handle line: one line of text-xs, kept by a no-break space. */}
                <span aria-hidden="true" className="block w-28 max-w-full rounded-xs bg-hover text-xs">&nbsp;</span>
              </div>
            </div>
            <div className={SHARED_HEADER_RIGHT}>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Bone className="h-11 w-[72px] @5xl:h-8" />
                {/* The note's own text, unseen, so the column is the note's height at every width and text size. */}
                <span aria-hidden="true" className={`${GUEST_NOTE_BOX} rounded-xs bg-hover text-transparent select-none`}>{GUEST_NOTE}</span>
              </div>
              <Bone className="h-11 w-11 @5xl:h-8 @5xl:w-8" />
            </div>
          </header>
          <div data-loading-canvas className={VIEWER_CANVAS}><CanvasChromeLoading /></div>
        </section>
        <PanelLoading panel={SHARED_PANEL} tabs={3} tools={1} />
      </main>
    </>
  );
}

// A member's canvas (/c): mark and name, the title, View, the access pill, then Comments, the panel toggle and the allowance; the
// canvas is read-only (no toolbar) and the panel opens on Comments.
export function MemberCanvasLoading() {
  return (
    <>
      <Status />
      <main inert data-canvas-loading="member" aria-busy="true" className={MEMBER_MAIN}>
        <header data-loading-header className={MEMBER_HEADER}>
          <MemberBrand />
          <Bone className="h-5 w-40 rounded-md" />
          <Bone className="h-8 w-[68px]" />
          <Bone className="h-5 w-32 rounded-full" />
          <span className="flex-1" />
          {bones(3, 'h-8 w-8')}
        </header>
        <div className={MEMBER_BODY}>
          <div data-loading-canvas className={VIEWER_CANVAS}><CanvasChromeLoading tools={false} /></div>
          <PanelLoading panel={SHARED_PANEL} tabs={3} tools={1} chat={false} />
        </div>
      </main>
    </>
  );
}

// An embed (/embed/b, /embed/e): its compact header only - the title, Chat when the host asked for it, Fork and Open in Rabbit
// Hole - never the full site's menubar or owner controls. `href`: the full page, which already works.
export function EmbedCanvasLoading({ embed, href }) {
  return (
    <main data-embed-root data-embed-kind={embed.kind} data-canvas-loading="embed" aria-busy="true" className={EMBED_MAIN}>
      <Status />
      <header data-loading-header className={EMBED_HEADER}>
        <span className="flex min-w-24 flex-1"><Bone className="h-5 w-40 max-w-full rounded-md" /></span>
        {embed.chat && <Bone className="h-8 w-[70px] border border-line bg-white" />}
        <Bone className="h-8 w-[66px] border border-line bg-white" />
        <EmbedOpenLink href={href} />
      </header>
      <div className={EMBED_BODY}>
        <div data-loading-canvas className={EMBED_CANVAS}><CanvasChromeLoading /></div>
      </div>
    </main>
  );
}
