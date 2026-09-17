import { useState } from 'react';
import { GitBranch, Loader2, X } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, Input, Select } from './ui.jsx';

export default function RepositoryImport({ onClose, onImported }) {
  const [url, setUrl] = useState(''), [info, setInfo] = useState(null), [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const branches = async (page = 1) => {
    setBusy(true); setError('');
    try {
      const next = await api(`/api/repositories/branches?url=${encodeURIComponent(url)}&page=${page}`);
      setInfo(previous => ({ ...next, branches: page === 1 ? next.branches : [...previous.branches, ...next.branches] }));
      if (page === 1) setBranch(next.defaultBranch);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const submit = async e => {
    e.preventDefault(); if (!info) return branches();
    setBusy(true); setError('');
    try {
      const result = await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url, branch }) });
      await onImported?.(); onClose(); navigate(`/apps/${result.name}?tab=code`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onClick={onClose}>
    <form role="dialog" aria-modal="true" aria-labelledby="repo-import-title" onClick={e => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between"><h2 id="repo-import-title" className="text-lg font-semibold">Import repository</h2><button type="button" aria-label="Close import" onClick={onClose}><X size={18} /></button></div>
      <p className="mb-4 text-sm text-ink-2">Learn from a public GitHub repository. Small indexes its code; it does not run it.</p>
      <label className="block text-sm">Repository URL<Input autoFocus required type="url" value={url} placeholder="https://github.com/owner/repository" onChange={e => { setUrl(e.target.value); setInfo(null); }} className="mt-1 w-full" disabled={busy} /></label>
      {info && <div className="mt-4 text-sm"><span className="flex items-center gap-1"><GitBranch size={14} />Branch</span><Select aria-label="Repository branch" value={branch} onChange={setBranch} options={info.branches} disabled={busy} /></div>}
      {info?.hasMore && <button type="button" onClick={() => branches(info.page + 1)} disabled={busy} className="mt-2 text-sm underline">Load more branches</button>}
      <p className="mt-3 text-xs text-ink-2">Visible to members of this workspace. The selected branch is pinned to an exact commit.</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || !url}>{busy && <Loader2 size={14} className="animate-spin" />}{busy ? 'Working…' : info ? 'Import' : 'Find branches'}</Button></div>
    </form>
  </div>;
}
