import { useEffect, useState } from 'react';
import { api } from './api.js';
import { loadAsset } from './learn-board-assets.js';

// A card's code (contract C:/s/spec/repo-graph-r2-plan.md, useCardSource): { status: 'loading' | 'ready' | 'unavailable' |
// 'failed', text }. A repository card reads its file at its own commit through the owner-checked route (repositories.js
// action 'file'); a 403 or 404 is unavailable and keeps nothing. An upload card reads its stored asset.
// ponytail: lane CODE's stub; lane ACCESS owns this hook (card-scoped reads, graph subsets) and replaces it.
export function useCardSource(block) {
  const source = block?.source;
  const key = source ? JSON.stringify([source.kind, source.app, source.commit, source.path, source.assetKey]) : '';
  const [state, setState] = useState({ status: 'loading', text: '' });
  useEffect(() => {
    if (!source) { setState({ status: 'unavailable', text: '' }); return undefined; }
    let active = true;
    setState({ status: 'loading', text: '' });
    const read = source.kind === 'upload'
      ? loadAsset(source.assetKey).then(value => { if (value == null) throw Object.assign(Error('missing'), { status: 404 }); return typeof value === 'string' ? value : value.text(); })
      : api(`/api/repositories/${source.app}/file`, { method: 'POST', body: JSON.stringify({ path: source.path, commit: source.commit }) }).then(data => data.content);
    read.then(text => { if (active) setState({ status: 'ready', text: String(text ?? '') }); },
      error => { if (active) setState({ status: [401, 403, 404].includes(error?.status) ? 'unavailable' : 'failed', text: '' }); });
    return () => { active = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
