// Brief 46 (spec section 11): the Program for a blueprint and its build-schema is written (interact-blueprint-build.js programFromBuild), validated against the card contract, run headless in the pinned QuickJS engine at the sampled settings and times,
// and its frames are tested against the frame rules (explain-program/frame-overlap.js). A safety net: if the Build model placed well, nothing fires. No repair. This is check 10 of the checker made independent of how the Program is written
// (the loop is the one that check ran, brief 38). Every collision comes out as a sentence naming the two things, the setting and the time; what the Program leaves out of a frame (a label with no clear spot, a short arrow) is counted.
import { programFromBuild } from './interact-blueprint-build.js';
import { sample, sampleGraph } from './interact-blueprint-check.js';
import { getEngine } from './interact-blueprint-run.js';
import { runProgram } from './explain-program/runtime.js';
import { CONTRACT_LIMITS } from './explain-program/contract.js';
import { FRAME_MS } from './interact-blueprint-constants.js';

const num = value => (Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000));
const describe = (setting, time) => `${setting.name}, t = ${num(time)}`;

// -> { written, source?, bytes?, validate: { ok, problems }, frames: { ok, firstSentence, list: [{ setting, time, ok, objects, ms, dropped: { labels, arrows }, sentence? }] }, dropped: { labels: n, arrows: n }, error? }
export async function checkBuilt({ blueprint, buildSchema }) {
  const result = { written: false, validate: { ok: false, problems: [] }, frames: { ok: false, firstSentence: null, list: [] }, dropped: { labels: 0, arrows: 0 } };
  let program;
  try {
    // a graph with no range in the build-schema is drawn over the range measured from the function (the writer takes it as given)
    const needsRange = !!blueprint.pictures.panel && buildSchema.pictures.panel?.ranges?.y === undefined;
    const sampled = await sample(blueprint); if (sampled.problems.length) { result.error = `the function does not run: ${sampled.problems[0].message}`; return result; }
    const yRange = needsRange ? (await sampleGraph(blueprint, sampled)).yRange : null;
    result.yRange = yRange;
    program = programFromBuild({ blueprint, buildSchema, yRange });
    result.sampled = sampled;
  } catch (error) { result.error = `the Program could not be written: ${error.message}`; return result; }
  result.written = true; result.source = program.source; result.placed = program.placed;
  const bytes = new TextEncoder().encode(program.source).length; result.bytes = bytes;
  const problems = [], validate = message => problems.push(message);
  if (bytes > CONTRACT_LIMITS.sourceBytes) validate(`The Program is ${bytes} bytes; at most ${CONTRACT_LIMITS.sourceBytes}.`);
  const { parseFrame } = await import('./explain-program/contract.js'), { normalizeFrame } = await import('./explain-program/frame.js'), { frameOverlaps, layoutProblems } = await import('./explain-program/frame-overlap.js');
  const engine = await getEngine(), sampled = result.sampled, settings = [sampled.points[0], sampled.points.at(-1), sampled.points.at(-2)].filter(Boolean), times = [0, blueprint.time.duration / 2, blueprint.time.duration];
  const main = buildSchema.pictures.main, dropped = new Set(main.dropped.map(entry => entry.id)), byId = Object.fromEntries(blueprint.pictures.main.parts.map(part => [part.id, part]));
  const labelEntries = main.labels.filter(entry => ['label', 'arrow'].includes(byId[entry.id]?.type) && !dropped.has(entry.id)).map(entry => ({ id: entry.id, object: byId[entry.id].type === 'label' ? `part.${entry.id}` : `part.${entry.id}.label` })), labelIds = labelEntries.map(entry => entry.id), arrowIds = blueprint.pictures.main.parts.filter(part => part.type === 'arrow' && !dropped.has(part.id)).map(part => part.id);
  for (const setting of settings) for (const time of times) {
    const entry = { setting: setting.name, time, ok: false, objects: null, ms: null, dropped: { labels: [], arrows: [] } };
    result.frames.list.push(entry);
    // the engine's limit is wall-clock (50 ms a frame), so a busy machine can fail a frame the Program would pass: a frame that hits the limit is run again, up to three times, and the best run counts
    let run, started;
    for (let attempt = 0; attempt < 3; attempt++) { started = performance.now(); run = runProgram(engine, { source: program.source, request: { requestId: '1', inputs: setting.inputs, time, seed: 1, state: null }, sdkVersion: 'sdk-8' }); entry.ms = Math.round((performance.now() - started) * 10) / 10; entry.attempts = attempt + 1; if (run.ok || run.code !== 'runtime_limit') break; }
    if (!run.ok) { entry.sentence = run.code === 'runtime_limit' ? `One frame takes longer than ${FRAME_MS} ms at ${describe(setting, time)}.` : `The Program does not run at ${describe(setting, time)}: ${run.detail}.`; validate(entry.sentence); continue; }
    const frame = run.value.frame; entry.objects = frame.objects.length;
    if (frame.objects.length >= CONTRACT_LIMITS.objects) validate(`One frame has ${frame.objects.length} objects; at most ${CONTRACT_LIMITS.objects - 1}.`);
    const parsed = parseFrame(frame); if (!parsed.ok) { entry.sentence = `The frame is refused by the host at ${describe(setting, time)}: ${parsed.error ?? JSON.stringify(parsed).slice(0, 160)}.`; validate(entry.sentence); continue; }
    if (!normalizeFrame(frame).ok) { entry.sentence = `The frame cannot be normalized at ${describe(setting, time)}.`; validate(entry.sentence); continue; }
    const drawn = new Set(frame.objects.map(object => object.id));
    entry.dropped.labels = labelEntries.filter(item => !drawn.has(item.object)).map(item => item.id); entry.dropped.arrows = arrowIds.filter(id => !drawn.has(`part.${id}`));
    result.dropped.labels += entry.dropped.labels.length; result.dropped.arrows += entry.dropped.arrows.length;
    const found = [...frameOverlaps({ ...frame, bodySize: 14 }), ...layoutProblems({ ...frame, bodySize: 14 })];
    if (found.length) { entry.sentence = `Things overlap in the frame at ${describe(setting, time)}: ${JSON.stringify(found[0]).slice(0, 200)}.`; continue; }
    entry.ok = true;
  }
  result.validate = { ok: problems.length === 0, problems };
  const firstBad = result.frames.list.find(entry => !entry.ok && entry.sentence);
  result.frames.ok = result.validate.ok && !firstBad; result.frames.firstSentence = firstBad?.sentence ?? null;
  delete result.sampled;
  return result;
}
