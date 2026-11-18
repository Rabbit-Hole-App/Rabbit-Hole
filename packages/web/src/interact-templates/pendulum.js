import { z } from 'zod';
import { DRAWN_TEXT_SIZES, checkText, fitValues, layoutById, pickLayout } from '../interact-layout.js';
import { textWidth } from '../tutor-diagrams/primitives.js';

// Brief 33/34/35: the landing page's pendulum card ("What changes a pendulum's swing?"). Physics in the program: T = 2 pi sqrt(L / g), angle = theta0 cos(2 pi t / T); mass does not enter. A (the reference) is fixed,
// B follows the mass and length sliders. The angle-against-time plot is an /explain coordinate-plot through sdk.diagram (its smooth line, fixed ranges).
// Brief 34: each curve is sampled from its own period (a point at every quarter period, so every peak is exactly theta0, plus the end; the eighth-period midpoints too when the 25-sample limit allows). The spec has
// the same structure at every setting and time (no annotations, long series names so the renderer always draws its legend and never on-curve names), so the plot never moves; the current time is a thin line and
// one dot per curve drawn as frame objects at the plot's own coordinates (plot.frame, baked by scripts/interact/bake-pendulum-geometry.mjs).
// Brief 35: the card sits on the scene layout its plan declares (docs/features/interact/layout.md, interact-layout.js): the stage and the panel boxes, the values section, the formula and the note, all placed from
// the layout's boxes when the program is built, every text measured against its box then (a text that does not fit is refused). ponytail: one card, no damping, small-angle start only.
const text = max => z.string().min(1).max(max);
const answers = z.object({ pictureCount: z.enum(['one', 'two']), runs: z.enum(['left-to-right', 'top-to-bottom', 'compact']), panelRole: z.enum(['none', 'records-main', 'equal', 'aligned']) }).strict();
const value = z.object({ quantity: z.enum(['angleB', 'periodA', 'periodB']), label: text(12), unit: text(6), decimals: z.number().int().min(0).max(3), kind: z.enum(['live', 'set', 'fixed']), sample: text(10) }).strict();
export const pendulumSchema = z.object({
  title: text(60), g: z.number().positive(), theta0: z.number().positive().max(60), duration: z.number().positive().max(60),
  reference: z.object({ mass: z.number().positive(), length: z.number().positive() }).strict(),
  limits: z.object({ maxMass: z.number().positive(), maxLength: z.number().positive() }).strict(),
  plot: z.object({ title: text(60), time: text(20), angle: text(20), yMax: z.number().positive(), nameA: text(42), nameB: text(42),
    fit: z.object({ x: z.number(), y: z.number(), w: z.number() }).strict(), frame: z.object({ left: z.number(), right: z.number(), top: z.number(), bottom: z.number() }).strict() }).strict(),
  layout: answers, values: z.array(value).min(1).max(4), formula: text(40),
  notes: z.object({ same: text(60), mass: text(60), longer: text(60), shorter: text(60) }).strict(),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

// Everything the layout decides, computed once when the program is built: the boxes, where each value's text stands, and the checks (LayoutError: text_too_wide, layout_contradiction).
function place(data) {
  const id = pickLayout(data.layout, { hasPanel: true }), layout = layoutById(id), size = DRAWN_TEXT_SIZES;
  const fitted = fitValues(id, data.values.map(entry => ({ label: entry.label, text: entry.sample })), size);
  for (const sentence of Object.values(data.notes)) checkText(id, { formula: data.formula, note: sentence }, size);
  const [fx] = layout.slots.formula.box, [nx] = layout.slots.note.box, baseline = ([, y, , h]) => y + h / 2 + 5;
  return {
    layout: id, stage: layout.slots.stage.box, panel: layout.slots.panel.box,
    values: fitted.values.map((entry, i) => {
      const { box } = fitted.boxes[i], declared = data.values.find(item => item.label === entry.label);
      return { ...declared, box, labelX: box[0] + 8, numberX: Math.round((box[0] + box[2] - 8 - textWidth(declared.sample, size.number) / 2) * 100) / 100, y: baseline(box) };
    }),
    formula: { x: fx + 8, y: baseline(layout.slots.formula.box), text: data.formula }, note: { x: nx + 8, y: baseline(layout.slots.note.box) },
  };
}

export function source(ctx) {
  const pendulum = ctx.geometry?.pendulum;
  if (!pendulum) { const e = new Error('pendulum requires its validated data'); e.code = 'part_binding'; e.path = 'geometry.pendulum'; throw e; }
  let placed;
  try { placed = place(pendulum); } catch (error) { if (error.name === 'LayoutError') { const e = new Error(error.message); e.code = error.code; e.path = error.path.join('.'); throw e; } throw error; }
  return `const T=${JSON.stringify(pendulum)},L=${JSON.stringify(placed)};
const RAD=Math.PI/180,PERIOD=length=>2*Math.PI*Math.sqrt(length/T.g);
const radius=mass=>10*Math.cbrt(mass)+4,kg=value=>String(Math.round(value*10)/10),metre=value=>String(Math.round(value*10)/10);
// The stage box: the pivot bar 40 px under its top, and the longest string with the heaviest ball inside it with 6 px to spare.
const SX=L.stage[0],SY=L.stage[1],SW=L.stage[2],PIVOT_Y=SY+40,SCALE=Math.floor((SY+L.stage[3]-6-radius(T.limits.maxMass)-PIVOT_Y)/T.limits.maxLength);
// A point at every quarter period from 0 to the end, then the end; the midpoint of every pair too while the total stays within the kind's 25 samples.
const sampleTimes=period=>{const quarter=period/4,base=[];for(let k=0;k*quarter<T.duration-1e-9;k++)base.push(k*quarter);base.push(T.duration);return base.length*2-1<=25?base.flatMap((value,i)=>i?[(base[i-1]+value)/2,value]:[value]):base;};
// The renderer draws each curve as a Steffen monotone cubic through its samples (tutor-diagrams/plot-lines.js monotoneLinePath; the limiter is the same in data and pixel space), so the dot takes its height from that same curve.
const spline=(xs,ys,t)=>{const n=xs.length,dx=[],s=[],m=[];for(let i=1;i<n;i++){dx.push(xs[i]-xs[i-1]);s.push((ys[i]-ys[i-1])/dx[i-1]);}
for(let i=1;i<n-1;i++){const l=s[i-1],r=s[i],sign=Math.sign(l);m.push(sign!==Math.sign(r)?0:sign*Math.min(2*Math.abs(l),2*Math.abs(r),Math.abs((l*dx[i]+r*dx[i-1])/(dx[i-1]+dx[i]))));}
m.unshift((3*s[0]-m[0])/2);m.push((3*s[n-2]-m[m.length-1])/2);
let i=0;while(i<n-2&&t>xs[i+1])i++;const h=dx[i],u=(t-xs[i])/h,u2=u*u,u3=u2*u;
return (2*u3-3*u2+1)*ys[i]+(u3-2*u2+u)*h*m[i]+(3*u2-2*u3)*ys[i+1]+(u3-u2)*h*m[i+1];};
// A value's look by its kind: live (changes every frame) in B's own hue, set (changes when a control moves) in plain ink, fixed (never) in plain ink at 60%.
const LOOK={live:{role:'warning',opacity:1},set:{role:'neutral',opacity:1},fixed:{role:'neutral',opacity:0.6}};
export function evaluate({inputs,time}){
  const t=Math.min(Math.max(time||0,0),T.duration),mass=inputs.mass,length=inputs.length,ref=T.reference,periodA=PERIOD(ref.length),periodB=PERIOD(length);
  const angleA=T.theta0*Math.cos(2*Math.PI*t/periodA),angleB=T.theta0*Math.cos(2*Math.PI*t/periodB);
  const objects=[sdk.line('support',SX+20,PIVOT_Y,SX+SW-20,PIVOT_Y,{role:'neutral'})];
  const swing=(name,pivotX,len,mass,angle,role)=>{
    const bx=pivotX+len*SCALE*Math.sin(angle*RAD),by=PIVOT_Y+len*SCALE*Math.cos(angle*RAD);
    objects.push(sdk.text('label.'+name,pivotX,SY+22,name+': '+kg(mass)+' kg, '+metre(len)+' m',{align:'middle',role:role}),sdk.polyline('string.'+name,[[pivotX,PIVOT_Y],[bx,by]],{role:role}),sdk.circle('ball.'+name,bx,by,2*radius(mass),{role:role}));
  };
  swing('A',Math.round(SX+0.28*SW),ref.length,ref.mass,angleA,'input');
  swing('B',Math.round(SX+0.68*SW),length,mass,angleB,'warning');
  const curve=(label,period)=>{const times=sampleTimes(period);return {label:label,kind:'line',samples:{x:times.map(value=>Math.round(value*1e4)/1e4),y:times.map(value=>Math.round(T.theta0*Math.cos(2*Math.PI*value/period)*1e3)/1e3)}};};
  const curveA=curve(T.plot.nameA,periodA),curveB=curve(T.plot.nameB,periodB),drawn=c=>spline(c.samples.x,c.samples.y,t);
  const spec={version:1,diagram:{kind:'coordinate-plot',title:T.plot.title,x:{label:T.plot.time,min:0,max:T.duration,unit:'s'},y:{label:T.plot.angle,min:-T.plot.yMax,max:T.plot.yMax,unit:'°'},
    series:[curveA,curveB]}};
  objects.push(sdk.diagram(spec,{x:T.plot.fit.x,y:T.plot.fit.y,w:T.plot.fit.w}));
  const F=T.plot.frame,nowX=F.left+t/T.duration*(F.right-F.left),at=angle=>F.top+(T.plot.yMax-angle)/(2*T.plot.yMax)*(F.bottom-F.top);
  objects.push(sdk.line('now',nowX,F.top,nowX,F.bottom,{role:'neutral'}),sdk.circle('dot.A',nowX,at(drawn(curveA)),12,{role:'input'}),sdk.circle('dot.B',nowX,at(drawn(curveB)),12,{role:'warning'}));
  const quantity={angleB:angleB,periodA:periodA,periodB:periodB};
  L.values.forEach((entry,k)=>{const look=LOOK[entry.kind],shown=quantity[entry.quantity].toFixed(entry.decimals)+(entry.unit==='°'?'°':' '+entry.unit);
    objects.push(sdk.text('value.'+k+'.label',entry.labelX,entry.y,entry.label,look),sdk.text('value.'+k+'.number',entry.numberX,entry.y,shown,{align:'middle',role:look.role,opacity:look.opacity}));});
  objects.push(sdk.text('formula',L.formula.x,L.formula.y,L.formula.text,{role:'neutral'}));
  const sameLength=Math.abs(length-ref.length)<1e-9,sameMass=Math.abs(mass-ref.mass)<1e-9;
  objects.push(sdk.text('note',L.note.x,L.note.y,sameLength&&sameMass?T.notes.same:sameLength?T.notes.mass:length>ref.length?T.notes.longer:T.notes.shorter,{role:'neutral'}));
  return {frame:sdk.frame(objects,{width:640,height:320,readouts:[{id:'periodA',value:periodA},{id:'periodB',value:periodB}]}),quantities:{mass:mass,length:length,periodA:periodA,periodB:periodB}};
}`;
}
