// The learner's Depth and Auto-suggest in the Learn Chat (Tutor ladder R2): useLearnSettings, the same shape as useLearnCoaching.
// One sync per learner canvas; another tab's change arrives by BroadcastChannel, and a tab coming back into view reads the
// saved values again (another device). Nothing here calls a model.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { createSettingsSync } from './learn-settings.js';

const CHANNEL = 'rh.learn-settings';

// useLearnSettings({ app, board }) -> { settings, status, saveStatus, depth, autoSuggest, set(patch), retry() }
export function useLearnSettings({ app, board = 'main' }) {
  // The channel opens in the effect, never in render: an open BroadcastChannel keeps a server render (and node) alive.
  const sync = useMemo(() => {
    const port = { current: null };
    return Object.assign(createSettingsSync({ scope: { app, board }, call: api, channel: { postMessage: message => port.current?.postMessage(message) } }), { port });
  }, [app, board]);
  useEffect(() => {
    let channel = null;
    try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }
    sync.port.current = channel;
    const hear = event => sync.receive(event.data);
    channel?.addEventListener('message', hear);
    sync.start();
    const back = () => { if (document.visibilityState === 'visible') sync.load(); };
    document.addEventListener('visibilitychange', back);
    return () => {
      sync.stop();
      channel?.removeEventListener('message', hear);
      channel?.close();
      if (sync.port.current === channel) sync.port.current = null;
      document.removeEventListener('visibilitychange', back);
    };
  }, [sync]);
  const view = useSyncExternalStore(sync.subscribe, sync.view, sync.view);
  return useMemo(() => ({ ...view, set: sync.set, retry: sync.retry }), [view, sync]);
}
