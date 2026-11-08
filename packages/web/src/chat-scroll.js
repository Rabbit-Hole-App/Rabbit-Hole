// Follow the latest message only while the reader is at the bottom (owner brief 2026-10-13 §9): someone who scrolled up to
// read is never pulled down. jump() is the "Jump to latest" button's: it goes to the bottom and follows again.
import { useEffect, useRef, useState } from 'react';

// About one line of slack (owner 2026-11-08): sub-pixel heights and a growing last line leave a reader at the bottom just short of it.
export const atEnd = box => box.scrollHeight - box.scrollTop - box.clientHeight <= 24;
// The app's reduced-motion rule (AreaCapturing.jsx): the system setting or the page's own flag.
const reducedMotion = () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion'));

export function useFollowLatest(scrollRef, deps) {
  const [atBottom, setAtBottom] = useState(true);
  const follow = useRef(true), bound = useRef(null), top = useRef(0), hidden = useRef(false);
  // A hidden box (another panel tab: display none) has no height and loses its offset; that reset is not the reader's scroll.
  // Only a scroll UP stops following (owner 2026-11-08): this hook's own scroll to the bottom fires its event a frame later, after the
  // last answer may have grown past the slack, and that event read as "scrolled away" showed Jump to latest to a reader at the bottom.
  const [onScroll] = useState(() => () => {
    const box = bound.current;
    if (!box?.clientHeight) return;
    const up = box.scrollTop < top.current;
    top.current = box.scrollTop;
    follow.current = atEnd(box) || (follow.current && !up);
    setAtBottom(follow.current);
  });
  // This hook's own scroll to the bottom; the place it leaves is where a reader's next scroll up is measured from.
  const toEnd = box => { box.scrollTop = box.scrollHeight; top.current = box.scrollTop; };
  // Content that grows with no new message (answer_meta's actions and Explore next settling, math fonts loading) is followed
  // too: a following reader is kept at the true bottom, and this hook's own scroll then reads as at the end. Shown again after
  // another tab, a reader who had scrolled up gets their place back (only then: growth never moves a scrolled-up reader).
  const [sized] = useState(() => typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (!bound.current) return;
    if (!bound.current.clientHeight) { hidden.current = true; return; }
    const shown = hidden.current;
    hidden.current = false;
    if (follow.current) toEnd(bound.current);
    else if (shown) bound.current.scrollTop = top.current;
  }));
  // The box can mount after the panel does (views switch), so bind whichever element the ref holds after each render.
  useEffect(() => {
    if (scrollRef.current !== bound.current) {
      bound.current?.removeEventListener('scroll', onScroll);
      sized?.disconnect();
      bound.current = scrollRef.current;
      bound.current?.addEventListener('scroll', onScroll, { passive: true });
    }
    // Observing an element already observed is a no-op, so new message blocks join as they render.
    if (bound.current && sized) [bound.current, ...bound.current.children].forEach(el => sized.observe(el));
  });
  useEffect(() => () => { bound.current?.removeEventListener('scroll', onScroll); sized?.disconnect(); }, [onScroll, sized]);
  useEffect(() => {
    if (follow.current && scrollRef.current) toEnd(scrollRef.current);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  // Smoothly, unless motion is reduced; its scroll events go down, so following holds while it glides.
  const jump = () => {
    follow.current = true;
    setAtBottom(true);
    const box = scrollRef.current;
    if (!box) return;
    top.current = box.scrollTop;
    box.scrollTo({ top: box.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  return { atBottom, jump };
}
