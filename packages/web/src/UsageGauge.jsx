import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Gauge } from 'lucide-react';
import { barParts, creditCount, featureRows, formatCredits, formatReset, unknownLine, usageStore, usageView } from './account-usage.js';
import { SettingsRow } from './ui.jsx';

// The monthly AI allowance on screen (owner D4 sections 1-3): the canvas top bar's gauge and its popover, and Settings > AI usage.
// All of them read one store (account-usage.js), so they never disagree.

const SIGNED_OUT = { status: 'signed_out' };
const ignore = () => () => {};
// The shared state. A signed-out viewer never subscribes or fetches: there is no personal allowance to show them.
export function useAccountUsage({ signedIn = true, store = usageStore } = {}) {
  const state = useSyncExternalStore(signedIn ? store.subscribe : ignore, store.getSnapshot, store.getSnapshot);
  useEffect(() => { if (signedIn && store.getSnapshot().status === 'idle') store.refresh(); }, [signedIn, store]);
  return signedIn ? state : SIGNED_OUT;
}

// Settings lives in the Shell's sidebar (Sidebar.jsx, 'small:settings'). Pages outside the Shell (a shared /b or /e link, a
// member's /c canvas) open it through Home's ?settings= in a new tab, so the canvas, its draft and its selection stay put.
export const openUsageSettings = () => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'usage' } }));
export const goToUsageSettings = () => window.open('/apps?settings=usage', '_blank', 'noopener');

// How far right (positive) or left the popover moves from right-aligned under the gauge to keep a 12px gutter on screen.
export function popoverShift(anchorRight, width, viewport, gutter = 12) {
  const left = Math.max(gutter, Math.min(anchorRight - width, viewport - gutter - width));
  return left - (anchorRight - width);
}

const TONE = { ok: 'text-pass', empty: 'text-fail', neutral: 'text-ink-2' };

export function UsageBar({ usage }) {
  const { usedPct, reservedPct } = barParts(usage);
  return (
    <div data-usage-bar role="meter" aria-label="AI allowance used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct}
      aria-valuetext={`${formatCredits(usage.used)} of ${formatCredits(usage.allowance)} used${usage.reserved > 0 ? `, ${formatCredits(usage.reserved)} reserved for processing` : ''}`}
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-hover">
      <span className="h-full bg-ink-2" style={{ width: `${usedPct}%` }} />
      {reservedPct > 0 && <span data-usage-bar-reserved className="h-full bg-ink-3" style={{ width: `${reservedPct}%` }} />}
    </div>
  );
}

const Note = ({ children }) => <p data-usage-note className="rounded-md bg-hover px-2 py-1.5 text-xs text-ink-2">{children}</p>;

// The popover's content (D4 section 3).
export function UsageDetails({ state, onViewUsage }) {
  const view = usageView(state), usage = view.usage;
  return (
    <>
      <p className="text-sm font-semibold text-ink">Monthly AI allowance</p>
      {usage ? (
        <>
          <p data-usage-remaining className={`mt-2 text-2xl font-semibold tabular-nums ${view.tone === 'empty' ? 'text-fail' : 'text-ink'}`}>
            {formatCredits(usage.remaining)} <span className="text-sm font-normal text-ink-2">remaining</span>
          </p>
          {view.tone === 'empty' && <p className="text-xs text-ink-2">No AI allowance remaining.</p>}
          <p data-usage-used className="text-xs text-ink-2 tabular-nums">{formatCredits(usage.used)} used of {creditCount(usage.allowance)}</p>
          {usage.reserved > 0 && <p data-usage-reserved className="text-xs text-ink-2 tabular-nums">Reserved for processing: {formatCredits(usage.reserved)}</p>}
          {unknownLine(usage.unknownAttempts) && <p data-usage-unknown className="text-xs text-ink-2">{unknownLine(usage.unknownAttempts)}</p>}
          <div className="mt-2"><UsageBar usage={usage} /></div>
          <p data-usage-reset className="mt-2 text-xs text-ink-2">Resets {formatReset(usage.resetsAt, { year: false })} (00:00 UTC)</p>
          {view.note && <div className="mt-2"><Note>{view.note}</Note></div>}
        </>
      ) : <p role="status" className="mt-1 text-sm text-ink-2">{view.label}</p>}
      {state.status !== 'signed_out' && (
        <button type="button" data-view-usage onClick={onViewUsage} className="mt-3 rounded-sm text-sm font-medium text-accent hover:underline">View usage</button>
      )}
    </>
  );
}

// The canvas top bar's gauge (D4 section 2): green with allowance left, red only when the server says none is left, neutral
// otherwise. The tooltip and the accessible name carry the same words, so color is never the only signal.
export default function UsageGauge({ signedIn = true, onViewUsage = openUsageSettings, store = usageStore }) {
  const state = useAccountUsage({ signedIn, store });
  const view = usageView(state);
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const box = useRef(null), trigger = useRef(null), panel = useRef(null);
  const id = useId();
  // Escape gives focus back to the gauge; a press elsewhere leaves it where the press put it.
  const close = useCallback(restore => { setOpen(false); if (restore) trigger.current?.focus(); }, []);
  // Anchored under the gauge, right edges aligned; on a narrow or wrapped top bar it slides just enough to stay on screen.
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    setShift(popoverShift(trigger.current.getBoundingClientRect().right, panel.current.offsetWidth, window.innerWidth));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (signedIn) store.refresh(); // opening is a refresh point (D4 section 5)
    panel.current?.focus();
    const outside = event => { if (!box.current?.contains(event.target)) close(false); };
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); close(true); } };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape, true); };
  }, [open]);
  return (
    <span ref={box} className="relative">
      <button ref={trigger} type="button" data-usage-gauge data-state={view.tone} title={view.title} aria-label={view.title}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${open ? 'bg-hover' : 'hover:bg-hover'}`}>
        <Gauge size={15} strokeWidth={1.8} aria-hidden className={TONE[view.tone]} />
      </button>
      {open && (
        <div ref={panel} id={id} role="dialog" aria-label="Monthly AI allowance" tabIndex={-1} data-usage-popover style={shift ? { right: -shift } : undefined}
          className="absolute top-full right-0 z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-white p-3 shadow-pop outline-none">
          <UsageDetails state={state} onViewUsage={() => { close(false); onViewUsage(); }} />
        </div>
      )}
    </span>
  );
}

const Amount = ({ children, className = '' }) => <span className={`text-sm tabular-nums ${className}`}>{children}</span>;

// Settings > AI usage (D4 section 1): the signed-in person's account allowance across all canvases.
export function UsageSettings({ Heading, store = usageStore }) {
  const state = useAccountUsage({ store });
  // Opening the section is a refresh point (D4 section 5); a first load the hook just started already is one.
  useEffect(() => { if (store.getSnapshot().status !== 'loading') store.refresh(); }, [store]);
  const view = usageView(state), usage = view.usage;
  return (
    <div data-usage-settings>
      <div className="text-2xl font-semibold">AI usage</div>
      <div className="pt-2 text-base text-ink-2">Your monthly AI allowance, shared across all your canvases and devices.</div>
      {view.note && <div className="pt-4"><Note>{view.note}</Note></div>}
      <Heading>This month</Heading>
      {usage ? (
        <>
          <div className="pt-4"><UsageBar usage={usage} /></div>
          <SettingsRow title="Monthly allowance"><Amount>{formatCredits(usage.allowance)}</Amount></SettingsRow>
          <SettingsRow title="Used"><Amount>{formatCredits(usage.used)}</Amount></SettingsRow>
          {usage.reserved > 0 && (
            <SettingsRow title="Reserved for processing" desc="Held for AI work still running, until its cost is known.">
              <Amount>{formatCredits(usage.reserved)}</Amount>
            </SettingsRow>
          )}
          {unknownLine(usage.unknownAttempts) && <p data-usage-unknown className="pb-1 text-xs text-ink-2">{unknownLine(usage.unknownAttempts)}</p>}
          <SettingsRow title="Remaining" desc={view.tone === 'empty' ? 'No AI allowance remaining.' : null}>
            <Amount className={view.tone === 'empty' ? 'text-fail' : ''}>{formatCredits(usage.remaining)}</Amount>
          </SettingsRow>
          <SettingsRow title="Next reset" desc="At the start of each calendar month, 00:00 UTC. Unused allowance does not carry over.">
            <Amount>{formatReset(usage.resetsAt)}</Amount>
          </SettingsRow>
          {/* Recorded per feature by the same accounting (GET /api/learn/usage byFeature); absent from an older server. */}
          {usage.byFeature?.length > 0 && <>
            <Heading>This month by feature</Heading>
            <div data-usage-by-feature>
              {featureRows(usage.byFeature).map(row => (
                <SettingsRow key={row.label} title={row.label} desc={[row.reserved > 0 && `${formatCredits(row.reserved)} reserved`, unknownLine(row.unknownAttempts)].filter(Boolean).join(' · ') || null}>
                  <Amount>{formatCredits(row.used)}</Amount>
                </SettingsRow>
              ))}
            </div>
          </>}
        </>
      ) : <p role="status" className="py-3 text-sm text-ink-2">{view.label}</p>}
    </div>
  );
}
