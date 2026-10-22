// A waiting label as the product writes it: the server's stage ("Preparing answer...") or "Thinking", with any trailing
// dots or ellipsis removed (owner 2026-10-21: no ellipsis anywhere in the UI).
export const waitingText = stage => String(stage || 'Thinking').trim().replace(/(\.{3}|…)+$/, '');
