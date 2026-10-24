// The reactions a comment accepts (docs/features/canvas-comments.md section 15), shared by the server (control-plane
// canvas-comments.js) and the panel, so both sides read one set. Written as escapes so the file survives any editor or encoding.
export const REACTIONS = ['\u{1F44D}', '❤️', '\u{1F389}', '\u{1F440}', '✅'];
// Accessible names, in the same order.
export const REACTION_NAMES = ['Thumbs up', 'Heart', 'Celebrate', 'Eyes', 'Done'];
