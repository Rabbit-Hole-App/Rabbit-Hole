// Handwritten logistic reference programs for the approved cards. No template,
// generator, formula parser or emitter is used to write/evaluate this source.
// The three depths share drawing code; their controls and words are explicit.
import { curveBriefs } from './interact-curve-briefs.js';
import { INPUTS } from './interact-family-curve-sliders.js';

const J = JSON.stringify;
function referenceSource(depth) {
  const b = curveBriefs[depth], tangent = depth !== 'brief', half = depth === 'brief' ? 0 : Math.max(Math.abs(b.x0.min), Math.abs(b.x0.max));
  const enclosure = [1 / (1 + Math.exp(b.k.max * (6 + half))), 1 / (1 + Math.exp(-b.k.max * (6 + half)))];
  const axis = [Math.floor(enclosure[0] * 4) / 4, Math.ceil(enclosure[1] * 4) / 4];
  const G = { width: 640, height: 328, left: 56, right: 414, top: 68, bottom: 274, plot: { x: 16, y: tangent ? 24 : 44, w: 414, h: 274 - (tangent ? 24 : 44) + 49 }, x: [-6, 6], y: axis, kDefault: b.k.default };
  return String.raw`
const W = ${J(b.words)}, G = ${J(G)}, TANGENT = ${tangent};
function logistic(x,k,x0) { return 1/(1+Math.exp(-k*(x-x0))); }
function derivative(x,k,x0) { const y = logistic(x,k,x0); return k*y*(1-y); }
function plotPoints(k,x0,xMarker) {
  let xs = Array.from(new Set([-6,6,x0,xMarker].filter(x => x >= -6 && x <= 6))).sort((a,b) => a-b);
  while (xs.length < 24) {
    let worst = -1, insert = 0, candidate = 0;
    for (let i=0; i<xs.length-1; i++) {
      const left=xs[i], right=xs[i+1], a=logistic(left,k,x0), b=logistic(right,k,x0);
      for (const fraction of [0.25,0.5,0.75]) {
        const at=left+(right-left)*fraction, error=Math.abs(logistic(at,k,x0)-(a+(b-a)*fraction));
        if (error>worst) { worst=error; insert=i+1; candidate=at; }
      }
    }
    xs.splice(insert,0,candidate);
  }
  return xs.map(x => ({x,y:logistic(x,k,x0)}));
}
export function evaluate({inputs}) {
  const k=inputs.k, x0=${depth === 'brief' ? '0' : 'inputs.x0'}, xMarker=${depth === 'detailed' ? 'inputs.xMarker' : '1'};
  const y=logistic(xMarker,k,x0), slope=derivative(xMarker,k,x0);
  const quantities={k,x0,xMarker,y,slope,yAtMarker:y};
  const sx=x => G.left+(x+6)/12*(G.right-G.left), sy=y => G.bottom-(y-G.y[0])/(G.y[1]-G.y[0])*(G.bottom-G.top);
  const ax=sdk.axis('axis.x',{x:G.left,y:G.bottom,length:G.right-G.left,orientation:'x',min:-6,max:6,label:W.axis_x});
  const ay=sdk.axis('axis.y',{x:G.left,y:G.bottom,length:G.bottom-G.top,orientation:'y',min:G.y[0],max:G.y[1],label:W.axis_y});
  const series=[{label:TANGENT?W.legend_curve:W.heading,kind:'line',points:plotPoints(k,x0,xMarker)}];
  if (TANGENT) {
    let a=Math.max(-6,xMarker-1), b=Math.min(6,xMarker+1);
    if (Math.abs(slope)>1e-15) {
      const first=xMarker+(G.y[0]-y)/slope,last=xMarker+(G.y[1]-y)/slope;
      a=Math.max(a,Math.min(first,last)); b=Math.min(b,Math.max(first,last));
    }
    series.push({label:W.legend_tangent,kind:'line',points:[a,b].map(x => ({x,y:Math.max(G.y[0],Math.min(G.y[1],y+slope*(x-xMarker)))}))});
  }
  const state=k<G.kDefault?W.state_gentler:k>G.kDefault?W.state_steeper:W.state_default;
  const objects=[
    sdk.text('scene.heading',16,14,W.heading),sdk.text('scene.state',438,14,state),
    sdk.plot('plot.curve',{...G.plot,axes:{x:{min:ax.min,max:ax.max,label:ax.label},y:{min:ay.min,max:ay.max,label:ay.label}},series}),
  ];
  if (sy(y)-G.top >= 12 && G.bottom-sy(y) >= 12) objects.push(
    sdk.line('guide.marker.x',sx(xMarker),sy(y),sx(xMarker),G.bottom,{opacity:0.3}),
    sdk.line('guide.marker.y',G.left,sy(y),sx(xMarker),sy(y),{opacity:0.3}),
  );
  objects.push(sdk.circle('ball.marker',sx(xMarker),sy(y),12));
  const lines=[W.marker_heading,W.marker_at+xMarker.toFixed(1).replace('-','−'),...(TANGENT?[]:[W.marker_note])];
  objects.push(...sdk.callout(438,sdk.clamp(sy(y)-28,70,G.bottom-lines.length*28),lines,{id:'callout.marker'}));
  return {frame:sdk.frame(objects,{width:640,height:328,readouts:[{id:'yAtMarker',value:y},...(TANGENT?[{id:'slope',value:slope}]:[])]}),quantities};
}
`;
}
export const curvePrograms = Object.freeze(Object.fromEntries(['brief', 'balanced', 'detailed'].map(depth => {
  const b = curveBriefs[depth], ids = ['k', ...(depth === 'brief' ? [] : ['x0']), ...(depth === 'detailed' ? ['xMarker'] : [])];
  const plain = b.cardDescription.replace(/\$/g, '').replace(/\s+/g, ' ').trim();
  return [depth, {
    manifest: {
      title: b.title, summary: plain, description: plain, assumptions: ['Dimensionless logistic with positive steepness; a finite displayed input domain.'],
      inputs: ids.map(id => ({ id, label: INPUTS[id].label, unit: INPUTS[id].unit, type: 'number', ...b[id] })),
      readouts: [{ id: 'yAtMarker', label: b.words.readout_y, unit: '', decimals: 3 }, ...(depth === 'brief' ? [] : [{ id: 'slope', label: b.words.readout_slope, unit: '', decimals: 3 }])],
      capabilities: ['number_inputs', 'props', 'figures'],
    },
    source: referenceSource(depth),
  }];
})));
export function curveDraft(depth) {
  const key = depth.replace(/^curve-logistic-/, '');
  if (!curvePrograms[key]) throw new Error('unknown curve reference ' + depth);
  return { main: { kind: 'program', program: curvePrograms[key] }, supporting: [] };
}
