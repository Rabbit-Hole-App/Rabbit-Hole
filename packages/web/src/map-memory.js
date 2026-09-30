// Map work memory (WP6 checkpoint 2): decisions, questions and sessions linked to code nodes.
// No capture backend exists yet (Knowledge Capture v1 is deferred), so every record here comes from
// labelled preview fixtures (home/map-memory-data.js). These helpers never call the network: a
// fixture answer is made in the browser and labelled, and fixture records never reach the model.

export const WHY = 'Why does this exist?';
export const DECISIONS_STARTER = 'Which decisions shaped this codebase?';
export const COMMON_STARTER = 'What do people usually ask here?';
// Onboarding prompts for an unfamiliar Map: Mothership prompts, not another agent.
export const STARTERS = ['Give me an architecture tour', 'What should I understand first?', 'Which modules matter most?', DECISIONS_STARTER, COMMON_STARTER];
export const MEMORY_KINDS = ['decision', 'question', 'session'];
const LAYERS = [['decisions', 'decision', 'decided'], ['questions', 'question', 'asked_about'], ['sessions', 'session', 'touched']];

// Permissions invariant: a record private to someone else never reaches this viewer, and a visible
// record loses its link to a session the viewer can't see.
export function visibleMemory(memory, email) {
  const sees = (r) => r.visibility !== 'private' || (!!email && r.owner === email);
  const sessions = memory.sessions.filter(sees), open = new Set(sessions.map((s) => s.id));
  const scrub = (r) => (r.session && !open.has(r.session) ? { ...r, session: null } : r);
  return { decisions: memory.decisions.filter(sees).map(scrub), questions: memory.questions.filter(sees).map(scrub), sessions };
}

const links = (r, id) => r.code.some((c) => c.id === id);
export const memoryFor = (memory, id) => ({ decisions: memory.decisions.filter((r) => links(r, id)), questions: memory.questions.filter((r) => links(r, id)), sessions: memory.sessions.filter((r) => links(r, id)) });
export const titleOfRecord = (r) => r.title || r.question;

// The enabled layers as graph nodes, each linked only to code already in the graph.
export function layerGraph(graph, memory, layers) {
  const code = new Set(graph.nodes.map((n) => n.id)), nodes = [...graph.nodes], edges = [...graph.edges];
  for (const [layer, kind, relation] of LAYERS) {
    if (!layers.has(layer)) continue;
    for (const r of memory[layer]) {
      const to = r.code.filter((c) => code.has(c.id));
      if (!to.length) continue;
      nodes.push({ id: r.id, label: titleOfRecord(r), kind, record: r });
      for (const c of to) edges.push({ source: r.id, target: c.id, relation, confidence: c.confidence, score: c.score ?? null, context: c.confidence === 'INFERRED' ? `inferred, ${c.score}` : 'recorded' });
    }
  }
  return { nodes, edges };
}

// Evidence rows in the hierarchy's order: recorded decision; recorded question/session; code/source
// evidence; inferred relationship; model explanation (never present in a fixture answer).
const RANK = ['decision', 'question', 'session', 'code', 'inferred', 'model'];
const ordered = (rows) => rows.map((e, i) => [e, i]).sort(([a, i], [b, j]) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind) || i - j).map(([e]) => e);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A labelled fixture answer for an exact fixture prompt, or null: then the model answers.
export function fixtureAnswer(text, { node, memory, graph }) {
  if (!memory) return null;
  const t = text.trim(), session = (id) => memory.sessions.find((s) => s.id === id);
  const at = (id) => graph.nodes.find((n) => n.id === id);
  const code = (id) => { const n = at(id); return n && { kind: 'code', label: n.label, detail: `${n.path}:${n.line}` }; };
  const recorded = (r) => r.code.filter((c) => c.confidence === 'RECORDED').map((c) => code(c.id)).filter(Boolean);
  const unique = (rows) => rows.filter((e, i) => rows.findIndex((x) => x.kind === e.kind && x.label === e.label && x.detail === e.detail) === i);
  const sessionRow = (id) => { const s = session(id); return s && { kind: 'session', label: s.title, detail: `${s.participant}${s.agent ? ` with ${s.agent}` : ''} · ${s.at}` }; };
  const decisionRow = (d) => ({ kind: 'decision', label: d.title, detail: `${d.rationale}${d.session && session(d.session) ? ` (${session(d.session).title}, ${d.at})` : ` (${d.at})`}` });
  const questionRow = (q) => ({ kind: 'question', label: q.question, detail: q.resolved ? q.answer : 'Asked, not resolved yet' });

  if (t === DECISIONS_STARTER) {
    if (!memory.decisions.length) return null;
    return { text: `${plural(memory.decisions.length, 'recorded decision')} shaped this codebase.`, evidence: ordered(unique([...memory.decisions.map(decisionRow), ...memory.decisions.flatMap(recorded)])) };
  }
  if (t === COMMON_STARTER) {
    if (!memory.questions.length) return null;
    return { text: `${plural(memory.questions.length, 'question')} ${memory.questions.length === 1 ? 'was' : 'were'} asked here before.`, evidence: memory.questions.map(questionRow) };
  }
  const q = memory.questions.find((x) => x.question === t);
  if (q) {
    const s = session(q.session);
    return {
      text: q.resolved ? q.answer : `This was asked${s ? ` in ${s.title}` : ''} but not resolved yet.`,
      evidence: ordered(unique([{ ...questionRow(q), detail: q.resolved ? 'Resolved' : 'Not resolved yet' }, ...(q.session ? [sessionRow(q.session)] : []), ...recorded(q)].filter(Boolean))),
    };
  }
  if (t !== WHY || !node) return null;
  const mine = memoryFor(memory, node.id), strength = (d) => d.code.find((c) => c.id === node.id).confidence;
  const decided = mine.decisions.filter((d) => strength(d) === 'RECORDED');
  if (!decided.length) return null; // no recorded decision: the model explains the code and says so
  const inferred = mine.decisions.filter((d) => strength(d) === 'INFERRED').map((d) => ({ kind: 'inferred', label: d.title, detail: `may also shape ${node.label} (inferred, ${d.code.find((c) => c.id === node.id).score})` }));
  const sources = decided.flatMap((d) => d.evidence.map((e) => ({ kind: 'code', label: e.note, detail: `${e.path}:${e.line}` })));
  return {
    text: `${plural(decided.length, 'recorded decision')} ${decided.length === 1 ? 'explains' : 'explain'} why ${node.label} looks like this.`,
    evidence: ordered(unique([...decided.map(decisionRow), ...mine.questions.map(questionRow), ...mine.sessions.map((s) => sessionRow(s.id)), code(node.id), ...sources, ...inferred].filter(Boolean))),
  };
}
