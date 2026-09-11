import { isPrivateByoc } from './private-auth.js';

export default function ByocDevBadge() {
  if (!isPrivateByoc || import.meta.env.VITE_SMALL_ENV !== 'dev') return null;
  return <span aria-label="Development environment" title="Development · separate test apps and data"
    className="shrink-0 rounded-sm bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-warn">DEV</span>;
}
