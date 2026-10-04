// A waiting label as the product writes it: the server's stage ("Preparing answer...") or "Thinking", ending in one
// ellipsis character - a stage that already ends in dots never becomes "Preparing answer......".
export const waitingText = stage => `${String(stage || 'Thinking').trim().replace(/(\.{3}|…)+$/, '')}…`;
