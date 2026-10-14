// Which path answers a Learn turn (owner brief section 5; chat-workspace-CONTRACT.md B6). tutor is the canvas's active
// Tutor (null when none), codeTurn a question about attached repository lines or a file, chat the Learn Chat workspace
// (null on every other surface), mode the Chat's mode. true: the existing Tutor workflow (tutor.ask, /api/learn/tutor/plan);
// false: /api/learn/ask, which carries the mode.
// - Ask always posts to /api/learn/ask: an active journey must not override an explicit Ask.
// - Tutor posts to /api/learn/ask with mode 'tutor' (the syllabus, B6).
// - Auto keeps the active Tutor's workflow on a journey or Tutor canvas, and posts to /api/learn/ask everywhere else.
export const tutorTurn = ({ tutor, codeTurn = false, chat = null, mode = 'auto' }) => !!tutor && !codeTurn && (!chat || mode === 'auto');
