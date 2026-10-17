// One registry per canvas/access scope. Never global: a shared viewer cannot reuse an owner's parsed text.
export function createSearchContentRegistry(scopeKey = '') {
  let snapshot = new Map();
  const listeners = new Set(), tokens = new Map();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    scopeKey,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    register(id, record) {
      const token = {}; tokens.set(id, token);
      snapshot = new Map(snapshot); snapshot.set(id, searchSourceRecord(record)); emit();
      return () => {
        if (tokens.get(id) !== token) return;
        tokens.delete(id); snapshot = new Map(snapshot); snapshot.delete(id); emit();
      };
    },
    clear() { if (!snapshot.size) return; tokens.clear(); snapshot = new Map(); emit(); },
  };
}

// Search may retain already-loaded text up to the existing extraction bound. It never says a truncated file is complete.
export function searchSourceRecord({ sourceKey, status, units = [], complete = true, limited, message, retry } = {}) {
  if (!['ready', 'partial'].includes(status)) return { sourceKey, status: status === 'failed' ? 'error' : status || 'loading', units: [], complete: false, ...(message ? { message } : {}), ...(retry ? { retry } : {}) };
  const kept = []; let used = 0, cut = false;
  for (const unit of units) {
    if (typeof unit?.text !== 'string') continue;
    if (used + unit.text.length > 4 * 1024 * 1024) { cut = true; break; }
    used += unit.text.length; kept.push({ text: unit.text, loc: unit.loc });
  }
  const partial = status === 'partial' || !complete || cut;
  return { sourceKey, status: partial ? 'partial' : 'ready', units: kept, complete: !partial, ...(partial ? { limited: [limited, cut ? 'Search text limit reached (4 MiB).' : ''].filter(Boolean).join(' ') || 'Only available extracted text is searched.' } : {}), ...(retry ? { retry } : {}) };
}
