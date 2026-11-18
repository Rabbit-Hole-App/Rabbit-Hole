// Load sample section (dev build, reviewTools; Reviewer 2026-11-18 13:32): the saved board of an 8878 build of nanoGPT 1.1 (docs/features/learn-sections/run/fixture-nanogpt-1.1.json)
// PUT onto this canvas's board, this browser's copy of it dropped, then the page reloads on it. The pipeline is untouched: the fixture is only how a layout, walk or contents change
// is looked at, in seconds and with no model call. -> null, or the words of what went wrong.
import { api } from './api.js';

export async function loadSampleSection({ canvas, board = 'main' }) {
  const { default: fixture } = await import('../../../docs/features/learn-sections/run/fixture-nanogpt-1.1.json');
  const path = `/api/learn/boards/${encodeURIComponent(canvas)}/${encodeURIComponent(board)}`;
  try {
    const current = await api(path).catch(() => null);
    await api(path, { method: 'PUT', body: JSON.stringify({ state: fixture.state, version: current?.version ?? 0 }) });
  } catch (error) { return `Could not load the sample section: ${error?.message || error}`; }
  try { for (const key of Object.keys(localStorage)) if (key.includes(canvas)) localStorage.removeItem(key); } catch { /* storage blocked: the server copy loads anyway */ }
  window.location.reload();
  return null;
}
