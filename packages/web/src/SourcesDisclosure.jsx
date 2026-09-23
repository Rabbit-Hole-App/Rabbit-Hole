import { useEffect, useRef } from 'react';
import { ArrowUpRight, ChevronRight, FileCode2 } from 'lucide-react';
import { groupSources, sourceLabel, sourceTarget } from './card-sources.js';

// The evidence behind a card, one collapsed row under it: "Sources & evidence
// (N)". Open, it lists the declared sources by type. A code citation opens the
// source inspector at its exact revision and lines (onFile); a paper or
// Wikipedia link is routed to its reader by the lesson page; generated numbers
// are explained in place. Rendered from block.sources alone - no card, lesson
// or repository is named here.
export default function SourcesDisclosure({ sources, onFile = null, onHeight = null }) {
  const root = useRef(null);
  const groups = groupSources(sources);
  const count = groups.reduce((n, group) => n + group.items.length, 0);
  // The card's frame is sized for its content; it grows by exactly this row
  // (and by the open list), so nothing else on the card moves.
  useEffect(() => {
    if (!onHeight || !root.current) return undefined;
    const observer = new ResizeObserver(() => onHeight(root.current ? root.current.offsetHeight : 0));
    observer.observe(root.current);
    return () => { observer.disconnect(); onHeight(0); };
  }, [onHeight]);
  if (!count) return null;
  return (
    <div ref={root} className="shrink-0 px-4 pb-3">
    <details data-sources className="group/sources rounded-lg border border-line bg-white">
      <summary data-sources-summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-xs text-ink-2 select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={13} className="transition-transform group-open/sources:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        Sources &amp; evidence ({count})
      </summary>
      <div className="space-y-3 border-t border-line px-3 pt-2 pb-3">
        {groups.map(group => (
          <section key={group.id} data-source-group={group.id}>
            <h4 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">{group.label}</h4>
            <ul className="space-y-1.5">
              {group.items.map((source, index) => <SourceItem key={index} source={source} onFile={onFile} />)}
            </ul>
          </section>
        ))}
      </div>
    </details>
    </div>
  );
}

function SourceItem({ source, onFile }) {
  const target = sourceTarget(source);
  const label = sourceLabel(source);
  const link = 'inline-flex items-center gap-1 text-left text-sm text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent';
  let head;
  if (target.open === 'file' && onFile) {
    head = <button type="button" data-source-file={`${target.path}:${target.line}-${target.lineEnd}`} title="Open in the source panel"
      onClick={() => onFile(target.path, target.line, target.lineEnd, { commit: target.commit, repo: target.repo })}
      className={`${link} font-mono`}><FileCode2 size={13} aria-hidden="true" />{label}</button>;
  } else if (target.open === 'detail') {
    head = <span className="text-sm"><span className="mr-1.5 rounded bg-hover px-1.5 py-0.5 text-xs text-ink-2">{source.status}</span>{label}</span>;
  } else {
    // Real links: the lesson page intercepts arXiv and Wikipedia ones into its
    // readers; anything else - and a code citation where there is no inspector
    // - opens the page itself (the file at its revision) in a new tab.
    const reader = target.open === 'wiki' || /^https:\/\/arxiv\.org\//.test(target.href);
    head = <a href={target.href} target="_blank" rel="noreferrer" data-source-link={source.kind} {...(target.open === 'wiki' ? { 'data-source-wiki': target.title } : {})}
      className={`${link} ${source.kind === 'code' ? 'font-mono' : ''}`}>{label}{!reader && <ArrowUpRight size={12} aria-hidden="true" />}</a>;
  }
  return (
    <li data-source-kind={source.kind} className="leading-snug">
      {head}
      {source.kind === 'code' && <span className="ml-2 text-xs text-ink-3">{source.repo} @ {source.revision.slice(0, 7)}</span>}
      {source.note && <p className="mt-0.5 text-xs text-ink-2">{source.note}</p>}
      {source.sha256 && <p className="mt-0.5 font-mono text-[11px] text-ink-3">sha256 {source.sha256}</p>}
      {source.reproduce && <p className="mt-0.5 text-xs text-ink-3">Reproduce: <code className="font-mono">{source.reproduce}</code></p>}
    </li>
  );
}
