// Follow the latest message only while the reader is at the bottom (owner brief 2026-10-13 §9): someone who scrolled up to
// read is never pulled down. jump() is the "Jump to latest" button's: it goes to the bottom and follows again.
import { useEffect, useRef, useState } from 'react';

// A few pixels of slack: sub-pixel heights and a growing last line leave a reader at the bottom just short of it.
export const atEnd = box => box.scrollHeight - box.scrollTop - box.clientHeight <= 48;

export function useFollowLatest(scrollRef, deps) {
  const [atBottom, setAtBottom] = useState(true);
  const follow = useRef(true), bound = useRef(null);
  const [onScroll] = useState(() => () => { follow.current = atEnd(bound.current); setAtBottom(follow.current); });
  // Content that grows with no new message (answer_meta's actions and Explore next settling, math fonts loading) is followed
  // too: a following reader is kept at the true bottom, and this hook's own scroll then reads as at the end.
  const [sized] = useState(() => typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (follow.current && bound.current) bound.current.scrollTop = bound.current.scrollHeight;
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
    if (follow.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = () => {
    follow.current = true;
    setAtBottom(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };
  return { atBottom, jump };
}
