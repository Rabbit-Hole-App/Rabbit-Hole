// Seconds since an ISO time, ticking once a second while active (the Chat's generation rows and a proposal card's status line).
// null without a usable start. A display clock only: it reads no job and is never announced.
import { useEffect, useState } from 'react';

export function useSeconds(startedAt, active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return undefined; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  const start = Date.parse(startedAt || '');
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : null;
}
