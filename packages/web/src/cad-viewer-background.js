// The CAD model viewport's background (owner brief section 4, clarification 7): white, black or none, saved on the card
// as block.viewerBackground so a rerender, a reopen, a share-link viewer and a fork all show the same choice. It paints the
// model viewport only, never the app theme, so white and black are fixed colours here (the documented exception in
// ui-colour-literals.test.mjs); none is no scene background, so the card's own themed surface shows through.
export const VIEWER_BACKGROUNDS = { white: '#ffffff', black: '#000000', none: null };
export const BACKGROUND_LABELS = { white: 'White background', black: 'Black background', none: 'No background' };
// A card saved before the control, or holding anything else, shows white.
export const viewerBackground = block => (Object.hasOwn(VIEWER_BACKGROUNDS, block?.viewerBackground ?? '') ? block.viewerBackground : 'white');
