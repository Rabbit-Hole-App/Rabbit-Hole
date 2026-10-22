import { useEffect, useRef, useState } from 'react';
import { EvidencePill } from './Md.jsx';

// Explicit, read-only repository inspection. It never submits the inline prompt,
// writes a card or changes Chat/TOC context. The host owns source-view navigation.
export default function InlineRepositoryEvidence({ scope, headers = {}, onOpenSource, contextKey = '', suggestedQuery = null }) {
  const key = JSON.stringify([contextKey, scope?.app, scope?.repo, scope?.commit]);
  const currentKey = useRef(key); currentKey.current = key;
  const request = useRef({ id: 0, controller: null });
  const [queryState, setQueryState] = useState({ key, value: '' });
  const query = queryState.key === key ? queryState.value : '';
  const setQuery = value => setQueryState({ key, value });
  const [stored, setStored] = useState({ key, loading: false, result: null, error: null });
  const state = stored.key === key ? stored : { loading: false, result: null, error: null };
  const setState = next => setStored({ ...next, key });
  const cancel = () => { request.current.id++; request.current.controller?.abort(); request.current.controller = null; };
  useEffect(() => {
    cancel(); setQuery(''); setState({ loading: false, result: null, error: null });
    return cancel;
  }, [key]);
  useEffect(()=>{if(!suggestedQuery)return;cancel();setQuery(typeof suggestedQuery.query==='string'?suggestedQuery.query.slice(0,200):'');setState({loading:false,result:null,error:null});},[suggestedQuery?.requestId]);
  const available = typeof scope?.app === 'string' && typeof scope?.repo === 'string' && /^[a-f0-9]{40}$/.test(scope?.commit || '');
  async function search() {
    if (!available || !query.trim() || state.loading) return;
    cancel();
    const id = request.current.id, controller = new AbortController();
    request.current.controller = controller;
    const live = () => !controller.signal.aborted && request.current.id === id && currentKey.current === key;
    setState({ loading: true, result: null, error: null });
    try {
      const response = await fetch('/api/learn/inline/evidence', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ app: scope.app, commit: scope.commit, query }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Repository search is unavailable.');
      if (result.kind !== 'repository-evidence' || result.scope?.app !== scope.app || result.scope?.commit !== scope.commit || result.scope?.repo !== scope.repo
        || !Array.isArray(result.matches) || !Array.isArray(result.metadataMatches)) throw Error('The repository search response could not be checked.');
      if (live()) setState({ loading: false, result, error: null });
    } catch (error) { if (live()) setState({ loading: false, result: null, error: error.message || 'Repository search failed.' }); }
  }
  const open = match => onOpenSource?.({ sourceId: match.sourceId, path: match.path, start: match.line, end: match.line, commit: scope.commit, repo: scope.repo });
  return <section aria-label="Repository evidence" className="space-y-3 border-t border-line pt-3 text-sm text-ink">
    <div><strong className="font-medium">Search this repository</strong><p className="mt-1 break-words text-xs text-ink-3">{available ? `${scope.repo} · ${scope.commit.slice(0, 8)} · indexed files only` : 'An owned repository and exact indexed commit are required.'}</p></div>
    <label className="block text-xs text-ink-2">Literal words, code or phrase
      <input value={query} maxLength={200} disabled={!available} placeholder="For example: optimizer.step()" className="mt-1 w-full rounded border border-line bg-transparent px-2 py-1.5 text-sm text-ink"
        onChange={event => { cancel(); setQuery(event.target.value); setState({ loading: false, result: null, error: null }); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void search(); } }} />
    </label>
    <div className="flex items-center gap-2"><button type="button" disabled={!available || !query.trim() || state.loading} onClick={() => void search()} className="rounded border border-line px-2 py-1 text-xs disabled:opacity-50">{state.loading ? 'Searching' : state.error ? 'Retry search' : 'Search'}</button>
      {state.loading && <button type="button" onClick={() => { cancel(); setState({ loading: false, result: null, error: null }); }} className="text-xs text-ink-2">Cancel</button>}
      <span className="text-xs text-ink-3">No AI calls</span></div>
    {state.error && <p role="alert" className="text-xs text-ink-2">{state.error}</p>}
    {state.result && <div aria-live="polite" className="space-y-3">
      <p className="text-xs text-ink-2">{state.result.matches.length} source lines for “{state.result.query}”{state.result.coverage?.possiblyLimited ? ' · result limit may be reached' : ''}</p>
      {!state.result.matches.length && <p className="text-xs text-ink-3">No matching source lines in this indexed version.</p>}
      {state.result.matches.map((match, index) => <div key={`${match.path}:${match.line}:${index}`} className="space-y-1">
        <EvidencePill {...(onOpenSource ? { type: 'button', onClick: () => open(match) } : {})}>{match.path}:{match.line}</EvidencePill>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-ink-2">{match.text}</pre>
      </div>)}
      {!!state.result.metadataMatches.length && <div className="space-y-1"><p className="text-xs font-medium">Symbol metadata matches · source not inspected</p>{state.result.metadataMatches.map((match, index) => <p key={`${match.id}:${index}`} className="break-words text-xs text-ink-3">{match.label}{match.path ? ` · ${match.path}` : ''}</p>)}</div>}
      <p className="text-xs text-ink-3">Matching text is evidence of what this snapshot contains, not proof of a claim. Line previews show at most the first 300 characters; open the source for later matches. Imported omissions remain unavailable.</p>
    </div>}
  </section>;
}
