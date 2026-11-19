// The transcript window's auto-scroll rule (TranscriptWindow.jsx), pure so it can be tested without a layout engine. `m` = { scrollTop, scrollHeight, clientHeight } of the text block.
// While the audio plays the window keeps the newest text at the bottom ("following"). A scroll the learner makes by hand away from the bottom stops that; scrolling back to the bottom (or a new run) resumes it.
// The window's own scrolling is never read as the learner's: its scroll events are marked `programmatic`.
const SLACK = 24; // px from the bottom that still counts as at the bottom

export const atBottom = m => m.scrollHeight - m.scrollTop - m.clientHeight <= SLACK;

// After a scroll event: whether to keep following. Our own scroll changes nothing; the learner's decides by where it ended.
export const followAfterScroll = (following, m, programmatic) => (programmatic ? following : atBottom(m));

// After the text grew: where scrollTop should be. Following: the very bottom. Not following (the learner is reading further up): where it is.
export const scrollTopAfterGrow = (following, m) => (following ? Math.max(0, m.scrollHeight - m.clientHeight) : m.scrollTop);
