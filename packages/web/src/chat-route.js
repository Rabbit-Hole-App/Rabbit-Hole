// Which path answers a Learn turn (owner brief section 5; chat-workspace-CONTRACT.md B6). tutor is the canvas's active
// Tutor (null when none), codeTurn a question about attached repository lines or a file, chat the Learn Chat workspace
// (null on every other surface), mode the Chat's mode. true: the existing Tutor workflow (tutor.ask, /api/learn/tutor/plan);
// false: /api/learn/ask, which carries the mode.
// - Ask always posts to /api/learn/ask: an active journey must not override an explicit Ask.
// - Tutor is the teaching Tutor (owner decision 1a, 2026-10-20): the active Tutor's workflow, as Auto has. Syllabus building
//   moved to the Table of contents conversation (toc), whose held Tutor still posts to /api/learn/ask with mode 'tutor'.
// - Auto keeps the active Tutor's workflow on a journey or Tutor canvas, and posts to /api/learn/ask everywhere else.
// - pageTurn, a question about PDF pages the Tutor's plan does not read (pdf-to-canvas.md), posts to /api/learn/ask, as codeTurn
//   does: only that route sends them all. A turn about exactly one page keeps the Tutor, which reads it (pdf-source.js tutorPage).
// - fileTurn, a question with an imported file attached (file-chat-ref.js), posts to /api/learn/ask too: the Tutor's plan does
//   not read file refs, and dropping one silently would answer as if the file were read.
export const tutorTurn = ({ tutor, codeTurn = false, pageTurn = false, fileTurn = false, chat = null, mode = 'auto', toc = false }) => !!tutor && !codeTurn && !pageTurn && !fileTurn && (!chat || mode === 'auto' || (mode === 'tutor' && !toc));
// The mode a Chat turn names on /api/learn/ask (and in its saved turn): there 'tutor' keeps meaning the syllabus, which only the
// Table of contents conversation asks for (owner 1a; task00-map §4 "Thread mode"). Chat's teaching Tutor, when a turn goes to
// /api/learn/ask (a code, page or file question, or a canvas with no active Tutor), answers as Auto does: an explicit course
// request there still builds a syllabus.
export const askMode = (mode, toc = false) => (mode === 'tutor' && !toc ? 'auto' : mode);
