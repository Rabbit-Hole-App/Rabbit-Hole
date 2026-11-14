// Deliverable 1 only: self-contained documentation references, not a runtime
// renderer, family registration, composition contract or new SDK helper.
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const approved = readFileSync(new URL('overview-curve-sliders.html', here), 'utf8');
const style = approved.match(/<style>([\s\S]*?)<\/style>/)[1];
const primitive = approved.match(/<script id="curve-view">\s*([\s\S]*?return \{dot,connector,teachingBox,teachingConnector,TEACHING,render\};\}\)\(\);)/)[1];
const header = approved.match(/  <header class="card-header">[\s\S]*?<\/header>/)[0];
const reset = approved.match(/    <button class="button secondary experiment-reset"[\s\S]*?<\/button>/)[0];
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export const DEPTHS = [['overview', 'brief'], ['standard', 'balanced'], ['deep', 'detailed']];

// The approved P.teachingBox / teachingConnector primitives own the look. The
// helper below only lays out these documentation drawings at native 640 px.
function referenceDrawingAPI() {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const text = (id, x, y, value, options = {}) => `<text id="${escape(id)}" x="${x}" y="${y}" fill="${options.color || P.TEACHING.ink}" font-size="${options.size || 14}" font-weight="${options.weight || 400}" text-anchor="${options.anchor || 'start'}">${escape(value)}</text>`;
  const box = (id, x, y, width, height, active = false, role = 'plain') => {
    const node = P.teachingBox(x, y, width, height, { active, role }); node.props.id = id; return P.render(node);
  };
  const line = (id, points, active = false, dashed = false) => {
    const node = P.teachingConnector(points, { active, arrow: false, dashed }); node.props.id = id; return P.render(node);
  };
  const wrap = (value, chars) => {
    const lines = []; let current = '';
    for (const word of String(value).split(/\s+/)) {
      if (current && `${current} ${word}`.length > chars) { lines.push(current); current = ''; }
      current += (current ? ' ' : '') + word;
    }
    if (current) lines.push(current); return lines;
  };
  const paragraph = (id, x, y, value, chars, options = {}) => wrap(value, chars).map((value, i) => text(`${id}.${i}`, x, y + i * 19, value, options)).join('');
  const cell = (id, x, y, width, height, label, options = {}) => {
    const { selected = false, role = 'plain', value = '', row = 0, column = 0, size = 18 } = options;
    return `<g id="${escape(id)}" data-value="${escape(value)}" data-row="${row}" data-column="${column}" data-selected="${selected}">`
      + box(`${id}.box`, x, y, width, height, selected, selected ? 'process' : role)
      + text(`${id}.value`, x + width / 2, y + height / 2 + size * 0.35, label, { size, anchor: 'middle', weight: selected ? 600 : 400, color: selected ? '#375d92' : P.TEACHING.ink }) + '</g>';
  };
  const callout = (anchor, config, title, sentence, path) => {
    const { x = 444, y = 65, width = 176, chars = 21 } = config;
    const lines = wrap(sentence, chars), height = 43 + lines.length * 19;
    return {
      // Each subject routes through a row gap and an outside margin spine.
      // Keeping the leader behind the picture is additional paint ordering,
      // not a substitute for the segment/cell-interior clearance invariant.
      connector: line('callout.anchor', path || [anchor, [430, anchor[1]], [430, y + 20], [x, y + 20]], true),
      panel: '<g id="callout.selected">' + box('callout.selected.box', x, y, width, height, false, 'process')
        + text('callout.selected.title', x + 10, y + 24, title, { size: 14, weight: 600, color: '#375d92' })
        + lines.map((value, i) => text(`callout.selected.line.${i}`, x + 10, y + 48 + i * 19, value, { size: 13 })).join('') + '</g>',
    };
  };
  const readouts = (values, y = 300) => line('readouts.rule', [[20, y], [620, y]]) + values.map((item, i) => {
    const x = 24 + i * 600 / values.length;
    return text(`readout.${item.id}.label`, x, y + 21, item.label, { size: 13, color: P.TEACHING.muted })
      + text(`readout.${item.id}.value`, x, y + 48, item.value, { size: 23, weight: 600, color: item.compare ? P.TEACHING.warm : '#375d92' });
  }).join('');
  return { text, box, line, wrap, paragraph, cell, callout, readouts, escape, C: P.TEACHING };
}

function referenceUI() {
  const $ = id => document.getElementById(id);
  let inputs = Grid.defaults();
  function draw() {
    const frame = Grid.frame(inputs), picture = drawPicture(frame, Grid, Scene, R);
    const note = R.callout(picture.anchor, picture.callout || {}, frame.callout.title, frame.callout.sentence, picture.calloutPath);
    $('objects').innerHTML = note.connector + picture.svg + note.panel + R.readouts(frame.readouts, Scene.readoutY);
    $('index').value = inputs.index;
    $('index').max = Grid.length - 1;
    $('index').setAttribute('aria-valuetext', `${frame.selectionLabel}, ${inputs.index + 1} of ${Grid.length}`);
    $('index-value').textContent = `${inputs.index + 1} of ${Grid.length}`;
    $('previous').disabled = inputs.index === 0;
    $('next').disabled = inputs.index === Grid.length - 1;
    $('scene-state').textContent = frame.state;
    $('scene-description').textContent = frame.description;
    if (Scene.parameter) for (const option of Scene.parameter.options) $(`option-${option.id}`).setAttribute('aria-pressed', inputs.option === option.id);
  }
  $('index').addEventListener('input', event => { inputs = Grid.coerce({ ...inputs, index: event.target.value }); draw(); });
  $('previous').addEventListener('click', () => { if (inputs.index > 0) { inputs = Grid.coerce({ ...inputs, index: inputs.index - 1 }); draw(); } });
  $('next').addEventListener('click', () => { if (inputs.index < Grid.length - 1) { inputs = Grid.coerce({ ...inputs, index: inputs.index + 1 }); draw(); } });
  if (Scene.parameter) for (const option of Scene.parameter.options) $(`option-${option.id}`).addEventListener('click', () => { inputs = Grid.coerce({ ...inputs, option: option.id }); draw(); });
  $('reset').addEventListener('click', () => { inputs = Grid.defaults(); draw(); $('status').textContent = 'Experiment reset.'; });
  draw();
}

export function serializeSubject(name, scene, createModel, drawPicture) {
  const parameter = scene.parameter ? `<div class="option-row" role="group" aria-label="${esc(scene.parameter.label)}"><span class="control-label">${esc(scene.parameter.label)}</span><div class="choices">${scene.parameter.options.map(option => `<button class="button secondary choice" id="option-${esc(option.id)}" type="button" aria-pressed="${option.id === scene.parameter.default}">${esc(option.label)}</button>`).join('')}</div></div>` : '';
  const config = JSON.stringify(scene).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rabbit Hole · ${esc(name)} grid ${esc(scene.subject)}</title><style>${style}
/* Approved reference tokens; IndexSlider / ChoiceButtons behavior from SceneControls.jsx. */
.grid-scene{display:block;width:640px;min-width:640px;max-width:none;height:auto;font-family:inherit}.grid-scene text{font-family:inherit;font-variant-numeric:tabular-nums}.grid-controls{padding:13px 16px 14px}.index-row{display:flex;gap:9px;align-items:center}.index-row input{flex:1;min-width:50px}.index-row .button{min-height:32px;padding:5px 10px}.index-row output{font-size:13px;white-space:nowrap;min-width:44px;color:var(--muted);font-variant-numeric:tabular-nums}.option-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px}.choices{display:flex;gap:5px}.choice[aria-pressed=true]{color:var(--blue-ink);background:var(--blue-soft);border-color:var(--blue-border)}.choice[aria-pressed=false]{color:var(--muted);background:var(--card)}
</style></head><body><main><article class="card" aria-labelledby="card-title">
${header.replace('Why does a sigmoid squash any number into 0 to 1?', esc(scene.prompt))}
<h1 id="card-title">${esc(scene.title)}</h1><p class="card-copy concept" id="concept">${esc(scene.concept)}</p>
<div class="experiment-instruction" id="instructions"><strong class="instructions-title">Instructions</strong><p>${esc(scene.instructions)}</p></div>
<section class="experiment" id="experiment" aria-label="${esc(scene.heading)}">${reset}
<div class="experiment-heading"><h2>${esc(scene.heading)}</h2><span id="scene-state"></span></div>
<div class="scenes-viewport"><svg class="grid-scene" id="drawing" width="640" height="${scene.height}" viewBox="0 0 640 ${scene.height}" role="img" aria-labelledby="scene-title scene-description"><title id="scene-title">${esc(scene.heading)}</title><desc id="scene-description"></desc><g id="objects"></g></svg></div>
<div class="experiment-controls grid-controls"><div class="index-row" role="group" aria-label="${esc(scene.indexLabel)}"><span class="control-label">${esc(scene.indexLabel)}</span><button id="previous" class="button secondary" type="button">Previous</button><input id="index" type="range" min="0" step="1" aria-label="${esc(scene.indexLabel)}"><button id="next" class="button secondary" type="button">Next</button><output id="index-value" for="index"></output></div>${parameter}</div>
</section><span class="sr-only" role="status" id="status"></span></article></main>
<script id="grid-model">const Scene = ${config};\nconst Grid = (${createModel.toString()})(Scene);</script>
<script id="grid-view">${primitive}\nconst R = (${referenceDrawingAPI.toString()})();\nconst drawPicture = ${drawPicture.toString()};\n(${referenceUI.toString()})();</script></body></html>\n`;
}

export function writeSubject(buildScene, createModel, drawPicture) {
  for (const [name, depth] of DEPTHS) {
    const scene = buildScene(depth);
    writeFileSync(new URL(`${name}-grid-${scene.subject}.html`, here), serializeSubject(name, scene, createModel, drawPicture));
  }
}
