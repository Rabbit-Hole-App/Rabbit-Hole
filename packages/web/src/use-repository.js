import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

// The repository a canvas is attached to (repo-canvas-graph.md, owner 2026-10-15): its Main canvas (a repo-* project) or a
// project canvas (canvases.project). The canvas is the only repository workspace, so this hook holds what the old
// repository page held - the row, its snapshot, and the Files and Graph viewers' state - and lives as long as the canvas
// does: switching the companion column between Context, Files and Graph never loses a file position, camera or selection.
// status: 'absent' (no repository), 'loading', 'queued' | 'indexing' (no snapshot yet, or a refresh in flight), 'ready',
// 'failed' (the import failed; refresh retries), 'unavailable' (this viewer may not read it: no metadata is kept).
export const repositoryStatus = (row, error) => {
  if (error) return error.status === 403 || error.status === 404 ? 'unavailable' : 'failed';
  if (!row) return 'loading';
  if (row.status === 'failed' && !row.commit_sha) return 'failed';
  return ['queued', 'indexing'].includes(row.status) ? row.status : row.commit_sha ? 'ready' : row.status === 'failed' ? 'failed' : 'queued';
};

// The repository's page on GitHub (imports are public GitHub only, control-plane repositories.js).
export const githubUrl = repo => (repo ? `https://github.com/${repo}` : null);

export function useRepository(name, initial = null) {
  const [row, setRow] = useState(initial?.name === name ? initial : null);
  const [error, setError] = useState(null), [snapshot, setSnapshot] = useState(null), [snapshotError, setSnapshotError] = useState(null);
  const [reload, setReload] = useState(0);
  // Files: the open file and a jump (a cited range); Graph: selected node ids, camera, the inspected node and its view.
  const [openFile, setOpenFile] = useState(null), [jump, setJump] = useState(null);
  const [selected, setSelected] = useState([]), [camera, setCamera] = useState(null), [inspected, setInspected] = useState(null), [view, setView] = useState('overview');
  // The Files reader's one selection (a file, symbol or line range), as the old page's `context` (agent/scope.js wireContext).
  const [context, setContext] = useState(null);
  // A graph an answer drew (ask.jsx onGraph, "Show on graph"), shown in the Graph view with its own Back.
  const [answerView, setAnswerView] = useState(null);
  const root = name ? `/api/repositories/${name}` : null;
  // The row, polled while the indexer works. A late reply for another repository never lands (active).
  useEffect(() => {
    if (!root) return undefined;
    let active = true, timer;
    const load = async () => {
      try {
        const next = await api(root);
        if (!active) return;
        setRow(next); setError(null);
        if (['queued', 'indexing'].includes(next.status)) timer = setTimeout(load, 2500);
      } catch (e) { if (active) setError(e); }
    };
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [root, reload]);
  // The snapshot, once per commit. A new commit drops selections that point at the old one (they would name other code).
  const commit = row?.commit_sha || null, lastCommit = useRef(commit);
  useEffect(() => {
    if (lastCommit.current && commit && lastCommit.current !== commit) { setSelected([]); setInspected(null); setContext(null); setOpenFile(null); setJump(null); }
    lastCommit.current = commit;
    if (!root || !commit) return undefined;
    let active = true;
    api(`${root}/snapshot`).then(data => { if (active) { setSnapshot(data); setSnapshotError(null); } }, e => { if (active) setSnapshotError(e); });
    return () => { active = false; };
  }, [root, commit, reload]);
  const refresh = useCallback(async () => {
    if (!root) return;
    setError(null);
    await api(`${root}/refresh`, { method: 'POST', body: '{}' });
    setReload(n => n + 1);
  }, [root]);
  const retry = useCallback(() => { setError(null); setSnapshotError(null); setReload(n => n + 1); }, []);
  return useMemo(() => {
    if (!name) return null;
    const status = repositoryStatus(row, error);
    // An unavailable repository keeps no name, branch or files (a 403 must not leak what the viewer may not read).
    const shown = status === 'unavailable' ? null : row;
    return {
      name, app: shown, status, commit: shown?.commit_sha || null, snapshot: status === 'unavailable' ? null : snapshot,
      error: status === 'unavailable' ? null : (error || snapshotError)?.message || shown?.error || null,
      refresh, retry, canEdit: !!shown?.canEdit, githubUrl: githubUrl(shown?.repo),
      files: { open: openFile, setOpen: setOpenFile, jump, setJump },
      graph: { selected, setSelected, camera, setCamera, inspected, setInspected, view, setView },
      context, setContext, answerView, setAnswerView,
    };
  }, [name, row, error, snapshot, snapshotError, refresh, retry, openFile, jump, selected, camera, inspected, view, context, answerView]);
}
