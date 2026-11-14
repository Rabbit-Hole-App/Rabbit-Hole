// Documentation-only reference drawing kit. Copies the approved toss/curve shell
// and primitive look; it is neither a production renderer nor a new SDK helper.
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const approved = readFileSync(new URL('overview-curve-sliders.html', here), 'utf8');
const style = approved.match(/<style>([\s\S]*?)<\/style>/)[1];
const primitive = approved.match(/<script id="curve-view">\s*([\s\S]*?return \{dot,connector,teachingBox,teachingConnector,TEACHING,render\};\}\)\(\);)/)[1];
const header = approved.match(/  <header class="card-header">[\s\S]*?<\/header>/)[0];
const reset = approved.match(/    <button class="button secondary experiment-reset"[\s\S]*?<\/button>/)[0];
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export const DEPTHS = [['overview', 'brief'], ['standard', 'balanced'], ['deep', 'detailed']];

// Shared SVG primitives in these review drawings use the same teaching boxes,
// wires, dots and exact font as the approved references. All subject geometry
// remains hand-authored in the subject file, outside model-output data.
function referenceDrawingAPI() {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const text = (id, x, y, value, options = {}) => `<text id="${escape(id)}" x="${x}" y="${y}" fill="${options.color || P.TEACHING.ink}" font-size="${options.size || 14}" font-weight="${options.weight || 400}" text-anchor="${options.anchor || 'start'}">${escape(value)}</text>`;
  const box = (id, x, y, w, h, active = false, role = 'plain') => {
    const node = P.teachingBox(x, y, w, h, { active, role }); node.props.id = id; return P.render(node);
  };
  const line = (id, points, active = false, arrow = true, dashed = false) => {
    const node = P.teachingConnector(points, { active, arrow, dashed }); node.props.id = id; return P.render(node);
  };
  const circle = (id, x, y, r, color = P.TEACHING.surface, stroke = P.TEACHING.wire) => `<circle id="${escape(id)}" cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="1.6"/>`;
  const wrap = (value, chars) => {
    const lines = []; let line = '';
    for (const word of String(value).split(/\s+/)) { if (line && `${line} ${word}`.length > chars) { lines.push(line); line = ''; } line += (line ? ' ' : '') + word; }
    if (line) lines.push(line); return lines;
  };
  const paragraph = (id, x, y, value, chars = 23, options = {}) => wrap(value, chars).map((line, i) => text(`${id}.${i}`, x, y + i * 20, line, options)).join('');
  const region = (id, frame, content, previous = []) => `<g id="region.${escape(id)}" data-region="${escape(id)}" data-active="${frame.active.includes(id)}" data-previous="${previous.includes(id)}" opacity="${frame.active.includes(id) ? 1 : previous.includes(id) ? 0.72 : 0.4}">${content}</g>`;
  return { text, box, line, circle, wrap, paragraph, region, escape, C: P.TEACHING };
}

function referenceUI() {
  const $ = id => document.getElementById(id);
  let step = 0, option = Scene.parameter?.default ?? 0;
  const states = () => Scene.variants[option].states;
  function draw() {
    const frame = states()[step], previous = step && Scene.depth !== 'brief' ? states()[step - 1].active : [];
    const picture = drawPicture(frame, Scene.variants[option], Scene, previous);
    const segments = states().length, gap = 5, width = (600 - gap * (segments - 1)) / segments;
    let svg = states().map((s, i) => `<rect id="rail.${R.escape(s.id)}" data-state="${R.escape(s.id)}" x="${20 + i * (width + gap)}" y="8" width="${width}" height="5" rx="2" fill="${i === step ? R.C.blue : R.C.line}"><title>${R.escape(s.label)}</title></rect>`).join('');
    svg += picture.svg;
    const cy = 66, cx = 444;
    svg += R.line('callout.anchor', [picture.anchor, [430, picture.anchor[1]], [430, cy + 16], [cx, cy + 16]], true, false);
    const sentence = R.wrap(frame.sentence, 22), why = Scene.depth === 'detailed' ? R.wrap(frame.why, 22) : [];
    const calloutHeight = 44 + (sentence.length + why.length) * 20 + (why.length ? 12 : 0);
    svg += '<g id="callout.active" data-bind="state.sentence">' + R.box('callout.active.box', cx, cy, 178, calloutHeight, false, 'process');
    svg += R.text('callout.active.title', cx + 11, cy + 24, frame.label, { weight: 600, color: '#375d92', size: 14 });
    sentence.forEach((line, i) => { svg += R.text(`callout.active.s${i}`, cx + 11, cy + 50 + i * 20, line); });
    why.forEach((line, i) => { svg += R.text(`callout.active.why${i}`, cx + 11, cy + 62 + (sentence.length + i) * 20, line, { color: R.C.muted }); });
    svg += '</g>';
    if (Scene.depth !== 'brief') {
      svg += R.line('legend.current', [[446, 34], [462, 34]], true, false) + R.text('legend.current.label', 470, 39, 'Current', { size: 13 });
      svg += R.line('legend.previous', [[534, 34], [550, 34]], false, false, true) + R.text('legend.previous.label', 558, 39, 'Previous', { size: 13 });
    }
    if (frame.readouts?.length) {
      svg += R.line('readouts.rule', [[20, 296], [620, 296]], false, false);
      frame.readouts.forEach((r, i) => {
        const x = 24 + i * 600 / frame.readouts.length;
        svg += R.text(`readout.${r.id}.label`, x, 317, r.label, { size: 13, color: R.C.muted });
        svg += R.text(`readout.${r.id}.value`, x, 344, r.value, { size: 23, color: '#375d92', weight: 600 });
      });
    }
    if (Scene.depth === 'detailed') {
      const n = states().length, w = 600 / n;
      svg += R.text('trace.label', 20, 371, 'Completed', { size: 13, color: R.C.muted });
      states().forEach((s, i) => {
        svg += `<g id="trace.${R.escape(s.id)}" data-completed="${i < step}" opacity="${i < step ? 1 : 0.35}">`;
        svg += R.line(`trace.${s.id}.rule`, [[20 + i * w, 383], [16 + (i + 1) * w, 383]], i < step, false);
        R.wrap(s.short || s.label, 10).forEach((line, j) => { svg += R.text(`trace.${s.id}.${j}`, 20 + i * w, 403 + j * 17, line, { size: 13 }); });
        svg += '</g>';
      });
    }
    $('objects').innerHTML = svg;
    $('step').value = step; $('step').max = states().length - 1;
    $('step').setAttribute('aria-valuetext', `${frame.label}, ${step + 1} of ${states().length}`);
    $('step-value').textContent = `${step + 1} of ${states().length}`;
    $('previous').disabled = step === 0; $('next').disabled = step === states().length - 1;
    $('scene-state').textContent = frame.label;
    $('scene-description').textContent = `${frame.sentence} ${Scene.depth === 'detailed' ? frame.why : ''}`;
    if (Scene.parameter) for (let i = 0; i < Scene.parameter.options.length; i++) $(`option-${i}`).setAttribute('aria-pressed', i === option);
  }
  $('step').addEventListener('input', e => { step = Math.max(0, Math.min(states().length - 1, Number(e.target.value))); draw(); });
  $('previous').addEventListener('click', () => { if (step > 0) { step--; draw(); } });
  $('next').addEventListener('click', () => { if (step < states().length - 1) { step++; draw(); } });
  if (Scene.parameter) Scene.parameter.options.forEach((unused, i) => $(`option-${i}`).addEventListener('click', () => { option = i; step = Math.min(step, states().length - 1); draw(); }));
  $('reset').addEventListener('click', () => { step = 0; option = Scene.parameter?.default ?? 0; draw(); $('status').textContent = 'Experiment reset.'; });
  draw();
}

export function writeSubject(slug, buildScene, drawPicture) {
  for (const [name, depth] of DEPTHS) {
    const scene = buildScene(depth), id = `${name}-stepper-${slug}`;
    const height = depth === 'detailed' ? 430 : scene.variants[0].states[0].readouts?.length ? 358 : 338;
    const composition = {
      schemaVersion: 1, status: 'reference-proposal', id, family: 'stepper-states', depth,
      canonical: scene.canonical, story: scene.concept, aha: scene.aha,
      layout: { preset: scene.canonical, width: 640 },
      parts: [
        { id: 'rail', kind: 'step-rail', bind: { items: 'variant.states', active: 'inputs.step' } },
        { id: 'picture', kind: 'fixed-picture', bind: { regions: 'variant.regions', links: 'variant.links', active: 'state.active' } },
        { id: 'callout', kind: 'active-callout', bind: { target: 'state.calloutRegion', text: 'state.sentence', ...(depth === 'detailed' ? { reason: 'state.why' } : {}) } },
        ...(depth !== 'brief' ? [{ id: 'ghost', kind: 'previous-state-ghost', bind: { regions: 'previous.active' } }] : []),
        ...(scene.variants[0].states[0].readouts?.length ? [{ id: 'values', kind: 'value-readout', bind: { values: 'state.readouts' } }] : []),
        ...(depth === 'detailed' ? [{ id: 'trace', kind: 'progress', presentation: 'completed-trace', bind: { items: 'variant.states', completedBefore: 'inputs.step' } }] : []),
      ],
      controls: [{ id: 'step', kind: 'index', presentation: 'slider', items: 'variant.states', default: 0 }, ...(scene.parameter ? [{ id: 'option', kind: 'select', ...scene.parameter }] : []), { id: 'reset', kind: 'reset' }],
      data: { variants: scene.variants },
    };
    const parameter = scene.parameter ? `<div class="option-row" role="group" aria-label="${esc(scene.parameter.label)}"><span class="control-label">${esc(scene.parameter.label)}</span><div class="choices">${scene.parameter.options.map((s, i) => `<button class="button secondary choice" id="option-${i}" type="button" aria-pressed="${i === scene.parameter.default}">${esc(s)}</button>`).join('')}</div></div>` : '';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rabbit Hole · ${name} ${slug}</title><style>${style}
/* IndexSlider and ChoiceButtons behavior from SceneControls.jsx; approved reference tokens. */
.stepper-scene{display:block;width:640px;min-width:640px;height:auto;font-family:inherit}.stepper-scene text{font-family:inherit;font-variant-numeric:tabular-nums}.stepper-controls{padding:13px 16px 14px}.index-row{display:flex;gap:9px;align-items:center}.index-row input{flex:1;min-width:50px}.index-row .button{min-height:32px;padding:5px 10px}.index-row output{font-size:13px;white-space:nowrap;min-width:44px;color:var(--muted);font-variant-numeric:tabular-nums}.option-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px}.choices{display:flex;gap:5px}.choice[aria-pressed=true]{color:var(--blue-ink);background:var(--blue-soft);border-color:var(--blue-border)}.choice[aria-pressed=false]{color:var(--muted);background:var(--card)}
</style></head><body><main><article class="card" aria-labelledby="card-title">
${header.replace('Why does a sigmoid squash any number into 0 to 1?', esc(scene.prompt))}
<h1 id="card-title">${esc(scene.title)}</h1><p class="card-copy concept" id="concept">${esc(scene.concept)}</p>
<div class="experiment-instruction" id="instructions"><strong class="instructions-title">Instructions</strong><p>${esc(scene.instructions)}</p></div>
<section class="experiment" id="experiment" aria-label="${esc(scene.heading)}">${reset}
<div class="experiment-heading"><h2>${esc(scene.heading)}</h2><span id="scene-state"></span></div>
<div class="scenes-viewport"><svg class="stepper-scene" id="drawing" width="640" height="${height}" viewBox="0 0 640 ${height}" role="img" aria-labelledby="scene-title scene-description"><title id="scene-title">${esc(scene.heading)}</title><desc id="scene-description"></desc><g id="objects"></g></svg></div>
<div class="experiment-controls stepper-controls"><div class="index-row" role="group" aria-label="Step"><button id="previous" class="button secondary" type="button">Previous</button><input id="step" type="range" min="0" step="1" aria-label="Step"><button id="next" class="button secondary" type="button">Next</button><output id="step-value" for="step"></output></div>${parameter}</div>
</section><span class="sr-only" role="status" id="status"></span></article></main>
<script id="scene-model">const Scene = ${JSON.stringify(scene)};</script>
<script id="scene-view">${primitive}\nconst R = (${referenceDrawingAPI.toString()})();\nconst drawPicture = ${drawPicture.toString()};\n(${referenceUI.toString()})();</script></body></html>\n`;
    writeFileSync(new URL(`${id}.html`, here), html);
    writeFileSync(new URL(`${id}.composition.json`, here), JSON.stringify(composition, null, 2) + '\n');
  }
}
