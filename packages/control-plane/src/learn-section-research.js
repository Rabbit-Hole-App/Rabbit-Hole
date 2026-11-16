// Research tools inside a Learn section turn, and the turn itself (docs/features/learn-sections CONTRACT "Research tools inside a turn"; specs A §8, C §11b).
// Every tool calls an EXISTING function: repository-context.js repositoryTool for the repository tools, arxiv.js, learn-wiki.js, learn-youtube.js, learn-search.js
// (discoverSources for search_web, searchCanvasSource for the brief's search_material). What a tool returned is recorded on ctx.turn, so a validator checks quotes
// and windows against what was really read. Exa spend goes through the existing admission (learn-search.js exaSearch -> admitTool, exaCost).
//
//   researchToolDefs(names) -> native tool definitions, in the order given (unknown names dropped)
//   researchTool(name, input, ctx) -> { content, turn }   ctx: { env, snapshot, turn, limits?, deps? }; a failed read throws (the turn answers it as an error result)
//   newTurn() -> { papers: { id: { title, pages } }, wiki: { title: { sections: { name: text } } }, videos: [], web: [], searches: [] }
//   sourcePapers(snapshot, { search }) -> the source's own papers: until the catalogue carries papers[] (TOOLS), an arXiv search on the README's title words (Reviewer 01:00)
//   sectionTurn(env, { composed, user, submit, research, ctx, validate, capUsd, callModel, maxResearchSteps }) -> { ok: value, usage } | { failed: 'invalid'|'over_cap'|'unavailable', errors, usage }
//     One model turn on tool_choice auto (Reviewer 2026-11-16 01:00, as learn-code-explain.js): the research tools and the one submit tool in the same request; research
//     calls run and are answered; exactly one submit call ends it, checked by validate(input) -> { value } | { errors }; one re-ask with the errors (or for a reply
//     with no tool call); spend = the calls made so far plus the next request's worst case (learn-spend.js requestSpendBound) never over capUsd.
import { REPOSITORY_TOOLS, repositoryTool } from './repository-context.js';
import { READ_ARXIV_TOOL, SEARCH_ARXIV_TOOL, paperDocument, readArxivPaper, searchArxiv } from './arxiv.js';
import { READ_WIKIPEDIA_TOOL, SEARCH_WIKIPEDIA_TOOL, readWikipedia, searchWikipedia } from './learn-wiki.js';
import { FIND_VIDEO_MOMENTS_TOOL, findVideoMoments } from './learn-youtube.js';
import { discoverSources, searchCanvasSource } from './learn-search.js';
import { LEARN_TASKS, costUsd, modelRequest } from './learn-models.js';
import { estimatedSpendBound } from './learn-spend.js';
import { logTutorCall, tutorRecord } from './tutor-prompt.js';

const MATERIAL_SOURCE = { paper: 'arxiv', video: 'youtube', article: 'wikipedia' };
export const SEARCH_MATERIAL_TOOL = { name: 'search_material', description: 'Search for existing material a beat may point the learner to: kind paper (arXiv), video (YouTube) or article (Wikipedia). Returns up to five results with one line on why each fits. Search only when the excerpts and your own knowledge do not settle it.', input_schema: {
  type: 'object', additionalProperties: false, required: ['kind', 'query'], properties: { kind: { type: 'string', enum: Object.keys(MATERIAL_SOURCE) }, query: { type: 'string', minLength: 1, maxLength: 300 } },
} };
export const SEARCH_WEB_TOOL = { name: 'search_web', description: 'Search the public web for pages (no site restriction). Returns candidate pages with their titles and dates; a candidate is not evidence until its text is read.', input_schema: {
  type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 300 } },
} };
const DEFS = Object.fromEntries([...REPOSITORY_TOOLS, READ_ARXIV_TOOL, SEARCH_ARXIV_TOOL, READ_WIKIPEDIA_TOOL, SEARCH_WIKIPEDIA_TOOL, FIND_VIDEO_MOMENTS_TOOL, SEARCH_MATERIAL_TOOL, SEARCH_WEB_TOOL].map(t => [t.name, t]));
const REPOSITORY = new Set(REPOSITORY_TOOLS.map(t => t.name));

export const researchToolDefs = names => (names || []).filter(name => Object.hasOwn(DEFS, name)).map(name => DEFS[name]);
export const newTurn = () => ({ papers: {}, wiki: {}, videos: [], web: [], searches: [] });

const text = value => [{ type: 'text', text: JSON.stringify(value) }];
export async function researchTool(name, input = {}, ctx) {
  const turn = ctx.turn || (ctx.turn = newTurn()), deps = ctx.deps || {};
  const limit = ctx.limits?.[name];
  if (limit != null && turn.searches.filter(s => s.tool === name).length >= limit) throw new Error(`At most ${limit} ${name} calls in this turn; use what you found.`);
  if (REPOSITORY.has(name)) {
    if (!ctx.snapshot) throw new Error('No repository source on this canvas.');
    return { content: text(repositoryTool(ctx.snapshot, name, input)), turn };
  }
  if (name === 'read_arxiv_paper') {
    const paper = await (deps.readPaper || readArxivPaper)(input.id);
    turn.papers[paper.id] = { title: paper.title, pages: paper.pages ?? null }; // pages: the per-page text TOOLS adds to read_arxiv_paper (DECISIONS S); null until then
    return { content: [...text(paper), paperDocument(paper)], turn };
  }
  if (name === 'search_arxiv') {
    const found = await (deps.searchArxiv || searchArxiv)(input.query);
    turn.searches.push({ tool: name, query: input.query, ids: found.map(p => p.id) });
    return { content: text(found), turn };
  }
  if (name === 'read_wikipedia') {
    const read = await (deps.readWikipedia || readWikipedia)(input.title, input.section);
    (turn.wiki[read.title] ||= { sections: {} }).sections[read.sectionTitle] = read.text;
    return { content: text(read), turn };
  }
  if (name === 'search_wikipedia') {
    const found = await (deps.searchWikipedia || searchWikipedia)(input.query);
    turn.searches.push({ tool: name, query: input.query, ids: found.map(p => p.title) });
    return { content: text(found), turn };
  }
  if (name === 'find_video_moments') {
    const found = await (deps.findVideoMoments || findVideoMoments)(String(input.query || ''), ctx.env, { org: ctx.org ?? null });
    turn.videos.push(...found.videos.map(video => ({ ...video, passages: found.passages.filter(p => p.videoId === video.videoId) })));
    turn.searches.push({ tool: name, query: input.query, ids: found.videos.map(v => v.videoId) });
    return { content: text(found), turn };
  }
  if (name === 'search_web') {
    const found = await (deps.discoverSources || discoverSources)(String(input.query || ''), ctx.env);
    turn.web.push(...found);
    turn.searches.push({ tool: name, query: input.query, ids: found.map(p => p.url) });
    return { content: text(found), turn };
  }
  if (name === 'search_material') {
    const source = MATERIAL_SOURCE[input.kind];
    if (!source) throw new Error('kind must be paper, video or article');
    const found = await (deps.searchCanvasSource || searchCanvasSource)(source, String(input.query || ''), ctx.env);
    turn.searches.push({ tool: name, kind: input.kind, query: input.query, ids: (found.results || []).map(r => r.id ?? r.url ?? r.title ?? null) });
    return { content: text(found), turn };
  }
  throw new Error(`Unknown research tool ${name}`);
}

// shortcut: the source's papers by an arXiv search on the README's first heading, until the catalogue carries papers[] found by rule (DECISIONS U, TOOLS lane).
export async function sourcePapers(snapshot, { papers = null, search = searchArxiv } = {}) {
  if (Array.isArray(papers) && papers.length) return papers;
  const files = snapshot?.files || {}, readme = Object.keys(files).filter(p => /^readme(\.\w+)?$/i.test(p)).sort()[0];
  const title = readme && (files[readme].split('\n').find(line => /^#\s+\S/.test(line)) || '').replace(/^#\s+/, '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!title) return [];
  try { return (await search(title)).map(p => ({ id: p.id, title: p.title, where: readme })); } catch { return []; }
}

const cutOff = result => String(result?.stop_reason || '').startsWith('max_'); // the output limit was reached
const usageOf = (model, total, u) => ({ calls: total.calls + 1, usd: total.usd + (costUsd({ model, ...(u || {}) }) ?? 0) });
export async function sectionTurn(env, { composed, user, submit, research = [], ctx, validate, capUsd, callModel, maxResearchSteps = 6, route = null }) {
  const task = LEARN_TASKS.learn_section, model = task.model, record = tutorRecord(composed, { route, model });
  const system = env.SUBSCRIPTION_ONLY === 'true' ? composed.text : [{ type: 'text', text: composed.text, cache_control: { type: 'ephemeral' } }];
  const messages = [{ role: 'user', content: user }];
  let usage = { calls: 0, usd: 0 }, asked = false, steps = 0, errors = [];
  for (;;) {
    const tools = [...researchToolDefs(research), submit]; // kept after the step limit: earlier tool_use blocks name them; a call past the limit is answered 'not run'
    const body = modelRequest(system, messages, task.maxTokens, { output_config: { effort: task.effort }, tools, tool_choice: { type: 'auto' } });
    const bound = estimatedSpendBound(body, model); // input at 3 request bytes a unit, still above the real rate (BLOCKERS.md)
    if (bound == null || usage.usd + bound > capUsd) return { failed: 'over_cap', errors: errors.length ? errors : ['the cost limit for this item did not allow another call'], usage };
    logTutorCall({ ...record, call: usage.calls + 1 });
    let result;
    try {
      const response = await callModel(env, body, model, null);
      if (!response.ok) return { failed: 'unavailable', errors: [`provider status ${response.status}`], usage };
      result = await response.json();
    } catch { return { failed: 'unavailable', errors: ['the provider call failed'], usage }; }
    usage = usageOf(model, usage, result?.usage);
    const blocks = Array.isArray(result?.content) ? result.content : [], calls = blocks.filter(b => b?.type === 'tool_use');
    const submits = calls.filter(c => c.name === submit.name);
    if (!submits.length && calls.length && !cutOff(result) && steps < maxResearchSteps) {
      // Research: run every call, answer each, and go on.
      steps += 1;
      const results = [];
      for (const call of calls) {
        try { results.push({ type: 'tool_result', tool_use_id: call.id, content: (await researchTool(call.name, call.input, ctx)).content }); }
        catch (error) { results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: String(error?.message || 'The read failed.').slice(0, 300) }); }
      }
      messages.push({ role: 'assistant', content: blocks }, { role: 'user', content: results });
      continue;
    }
    if (cutOff(result)) errors = [`the output was cut off before ${submit.name} finished; write less`];
    else if (submits.length !== 1) errors = [steps >= maxResearchSteps && calls.length ? `the reading is done: call ${submit.name} now with what you have` : `call ${submit.name} exactly once (got ${submits.length})`];
    else {
      const checked = await validate(submits[0].input ?? {});
      if (!checked.errors?.length) return { ok: checked.value, usage };
      errors = checked.errors;
    }
    if (asked) return { failed: 'invalid', errors, usage };
    asked = true;
    const note = `Not accepted:\n${errors.slice(0, 12).join('\n')}\nCall ${submit.name} again with a corrected result.`;
    messages.push(calls.length
      ? { role: 'assistant', content: blocks }
      : { role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '(no reply)' }] });
    messages.push({ role: 'user', content: calls.length ? calls.map(c => ({ type: 'tool_result', tool_use_id: c.id, is_error: true, content: c.name === submit.name ? note : 'Not run: submit your result.' })) : note });
  }
}
