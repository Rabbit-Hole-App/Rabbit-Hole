// Documentation-only shell and drawing helpers. This is not a runtime family,
// model-output schema, application renderer or SDK extension.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const here = new URL('.', import.meta.url);
const approved = readFileSync(new URL('overview-curve-sliders.html', here), 'utf8');
const style = approved.match(/<style>([\s\S]*?)<\/style>/)[1];
const primitive = approved.match(/<script id="curve-view">\s*([\s\S]*?return \{dot,connector,teachingBox,teachingConnector,TEACHING,render\};\}\)\(\);)/)[1];
const header = approved.match(/  <header class="card-header">[\s\S]*?<\/header>/)[0];
const reset = approved.match(/    <button class="button secondary experiment-reset"[\s\S]*?<\/button>/)[0];
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export const DEPTHS = [['overview', 'brief'], ['standard', 'balanced'], ['deep', 'detailed']];
export const isMain = url => process.argv[1] && pathToFileURL(process.argv[1]).href === url;

function referenceDrawingAPI() {
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const fmt = (value, places = 2) => (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places).replace('-', '−');
  const text = (id, x, y, value, options = {}) => `<text id="${esc(id)}" x="${x}" y="${y}" fill="${options.color || P.TEACHING.ink}" font-size="${options.size || 14}" font-weight="${options.weight || 400}" text-anchor="${options.anchor || 'start'}">${esc(value)}</text>`;
  const box = (id, x, y, width, height, active = false, role = 'plain') => {
    const node = P.teachingBox(x, y, width, height, { active, role }); node.props.id = id; return P.render(node);
  };
  const line = (id, points, active = false, arrow = false, dashed = false) => {
    const node = P.teachingConnector(points, { active, arrow, dashed }); node.props.id = id; return P.render(node);
  };
  const dot = (id, x, y, selected = false) => {
    const node = P.dot(x, y, selected ? 6 : 5, 'process');
    node.props = { ...node.props, id, ...(selected ? { fill: P.TEACHING.warmSoft, stroke: P.TEACHING.warm, strokeWidth: 2 } : {}) };
    return P.render(node);
  };
  const panel = (id, x, height, title) => `<g id="panel.${esc(id)}" data-part="comparison-panel">${box(`panel.${id}.box`, x, 12, 280, height)}${text(`panel.${id}.title`, x + 14, 38, title, { size: 15, weight: 600 })}`;
  const readout = (id, x, y, label, value, size = 22) => text(`readout.${id}.label`, x, y, label, { size: 13, color: P.TEACHING.muted }) + text(`readout.${id}.value`, x, y + 27, value, { size, color: '#375d92', weight: 600 });
  return { esc, fmt, text, box, line, dot, panel, readout, C: P.TEACHING };
}

function referenceUI() {
  const $ = id => document.getElementById(id);
  let values = BeforeAfter.defaults();
  function draw() {
    values = BeforeAfter.normalize(values);
    const frame = BeforeAfter.evaluate(values);
    $('objects').innerHTML = drawPicture(frame, BeforeAfter, Scene);
    $('scene-state').textContent = frame.state;
    $('scene-description').textContent = frame.description;
    for (const control of BeforeAfter.controls) {
      if (control.kind === 'range') {
        const input = $(control.id);
        input.min = control.min; input.max = frame.controlMax?.[control.id] ?? control.max;
        input.step = control.step; input.value = values[control.id];
        const value = BeforeAfter.controlValue(control.id, values, frame);
        $(`${control.id}-value`).textContent = value;
        input.setAttribute('aria-valuetext', value);
      } else {
        control.options.forEach((unused, index) => $(`${control.id}-${index}`).setAttribute('aria-pressed', values[control.id] === index));
      }
    }
  }
  for (const control of BeforeAfter.controls) {
    if (control.kind === 'range') {
      $(control.id).addEventListener('input', event => { values[control.id] = Number(event.target.value); draw(); });
      $(control.id).addEventListener('change', () => { $('status').textContent = $('scene-description').textContent; });
    } else {
      control.options.forEach((unused, index) => $(`${control.id}-${index}`).addEventListener('click', () => {
        values[control.id] = index; draw(); $('status').textContent = $('scene-description').textContent;
      }));
    }
  }
  $('reset').addEventListener('click', () => {
    values = BeforeAfter.defaults(); draw(); $('status').textContent = 'Experiment reset. ' + $('scene-description').textContent;
  });
  draw();
}

export function writeSubject(slug, modelFactory, buildScene, drawPicture) {
  for (const [name, depth] of DEPTHS) {
    const model = modelFactory(depth), scene = { ...buildScene(depth), depth, slug };
    const controls = model.controls.map(control => control.kind === 'range'
      ? `<div class="parameter"><div><label for="${control.id}">${escape(control.label)}</label><output id="${control.id}-value" for="${control.id}"></output></div><input id="${control.id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.default}" aria-label="${escape(control.label)}"></div>`
      : `<div class="parameter option-parameter${control.wide ? ' wide' : ''}" role="group" aria-label="${escape(control.label)}"><div><span class="control-label">${escape(control.label)}</span></div><div class="choices">${control.options.map((option, i) => `<button class="button secondary choice" id="${control.id}-${i}" type="button" aria-pressed="${i === control.default}">${escape(option)}</button>`).join('')}</div></div>`).join('');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rabbit Hole · ${name} before and after ${slug}</title><style>${style}
/* Native-width comparison panels reuse the curve/toss shell and stepper choices. */
.before-after-scene{display:block;width:640px;min-width:640px;max-width:none;height:auto;font-family:inherit}.before-after-scene text{font-family:inherit;font-variant-numeric:tabular-nums}.before-after-controls .parameters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;padding:0;border:0}.before-after-controls .parameter{display:block;grid-column:auto}.before-after-controls .parameter:only-child,.before-after-controls .parameter.wide{grid-column:1/-1}.before-after-controls .parameter>div{flex-wrap:nowrap}.before-after-controls .choices{display:flex;justify-content:flex-start;gap:5px;flex-wrap:wrap}.choice[aria-pressed=true]{color:var(--blue-ink);background:var(--blue-soft);border-color:var(--blue-border)}.choice[aria-pressed=false]{color:var(--muted);background:var(--card)}.option-parameter.wide{display:flex;align-items:center;justify-content:space-between;gap:12px}.option-parameter.wide>div{margin:0}.experiment-heading>span{max-width:100%}@media(max-width:480px){.before-after-controls .parameters{grid-template-columns:1fr;gap:12px}.before-after-controls .parameter,.before-after-controls .parameter.wide{grid-column:1}.before-after-controls .option-parameter.wide{display:block}.option-parameter.wide>div:first-child{margin-bottom:5px}}
.before-after-controls .three-parameters .parameter.wide{display:block;grid-column:auto}.before-after-controls .three-parameters .option-parameter.wide>div:first-child{margin-bottom:4px}.before-after-controls .three-parameters .parameter:last-child{grid-column:1/-1}
</style></head><body><main><article class="card" aria-labelledby="card-title">
${header.replace('Why does a sigmoid squash any number into 0 to 1?', escape(scene.prompt))}
<h1 id="card-title">${escape(scene.title)}</h1><p class="card-copy concept" id="concept">${escape(scene.concept)}</p>
<div class="experiment-instruction" id="instructions"><strong class="instructions-title">Instructions</strong><p>${escape(scene.instructions)}</p></div>
<section class="experiment" id="experiment" aria-label="${escape(scene.heading)}">${reset}
<div class="experiment-heading"><h2>${escape(scene.heading)}</h2><span id="scene-state"></span></div>
<div class="scenes-viewport"><svg class="before-after-scene" id="drawing" width="640" height="${scene.height}" viewBox="0 0 640 ${scene.height}" role="img" aria-labelledby="scene-title scene-description"><title id="scene-title">${escape(scene.heading)}</title><desc id="scene-description"></desc><g id="objects"></g></svg></div>
<div class="experiment-controls before-after-controls"><div class="parameters${model.controls.length === 3 ? ' three-parameters' : ''}" role="group" aria-label="Experiment parameters">${controls}</div></div>
</section><span class="sr-only" role="status" id="status"></span></article></main>
<script id="scene-model">const Scene = ${JSON.stringify(scene)};\nconst BeforeAfter = (${modelFactory.toString()})(Scene.depth);</script>
<script id="scene-view">${primitive}\nconst R = (${referenceDrawingAPI.toString()})();\nconst drawPicture = ${drawPicture.toString()};\n(${referenceUI.toString()})();</script></body></html>\n`;
    writeFileSync(new URL(`${name}-before-after-${slug}.html`, here), html);
  }
}
