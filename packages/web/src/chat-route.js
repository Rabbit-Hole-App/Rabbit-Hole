// Which mode a Learn turn names (owner brief section 5; chat-workspace-CONTRACT.md B6). Every Learn turn posts to /api/learn/ask,
// which carries the mode. The browser Tutor that used to answer Auto and Tutor turns (tutorTurn, /api/learn/tutor/plan) is gone
// (Tutor cleanup P2); the rebuilt Tutor mode arrives later.
// The mode a Chat turn names on /api/learn/ask (and in its saved turn): there 'tutor' keeps meaning the syllabus, which only the
// Table of contents conversation asks for (owner 1a; task00-map §4 "Thread mode"). Chat's Tutor mode answers as Auto does; the
// ToC conversation keeps 'tutor'.
export const askMode = (mode, toc = false) => (mode === 'tutor' && !toc ? 'auto' : mode);
