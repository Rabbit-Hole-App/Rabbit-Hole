import { useEffect, useState } from 'react';
import { api } from './api.js';

// ponytail: stand-ins until lanes ACCESS (useCardSource) and CODE (insertCodeCard) land on release/repo-graph
// (C:/s/spec/repo-graph-r2-plan.md, Interfaces). At merge, GraphCard.jsx and GraphPanel.jsx import theirs and this file goes.

// The card's graph at its pinned commit. The stub reads the owner-only snapshot route (the repository's current commit), and
// a different commit is 'unavailable' with `stale`: never a newer revision passed off as the card's (brief section 8).
const snapshots = new Map();
export function useCardSource(block) {
  const app = block.repository?.app, commit = block.repository?.commit;
  const [state, setState] = useState({ status: 'loading' }), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!app || !commit) { setState({ status: 'unavailable' }); return undefined; }
    let active = true; // a late reply never fills a deleted card or another canvas (brief section 11)
    setState({ status: 'loading' });
    if (!snapshots.has(app) || retry) snapshots.set(app, api(`/api/repositories/${app}/snapshot`));
    snapshots.get(app).then(snapshot => {
      if (!active) return;
      setState(snapshot.commit === commit ? { status: 'ready', graph: snapshot.graph, skipped: snapshot.skipped || [] } : { status: 'unavailable', stale: snapshot.commit });
    }, error => {
      snapshots.delete(app);
      if (active) setState({ status: error.status === 403 || error.status === 404 ? 'unavailable' : 'failed' });
    });
    return () => { active = false; };
  }, [app, commit, retry]);
  return { ...state, retry: () => setRetry(n => n + 1) };
}

// Lane CODE's insertCodeCard(api, block, point?): until it lands, a code card cannot be created and the actions say so.
export const insertCodeCard = null;
