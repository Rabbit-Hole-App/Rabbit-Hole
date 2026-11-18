import { z } from 'zod';

// Brief 33: the landing page's pendulum card ("What changes a pendulum's swing?"). Physics in the program: T = 2 pi sqrt(L / g), angle = theta0 cos(2 pi t / T); mass does not enter. A (the reference) is fixed,
// B follows the mass and length sliders. Primitives draw the two pendulums and the callout; the angle-against-time plot is an /explain coordinate-plot through sdk.diagram (its smooth line, fixed ranges,
// one point annotation per curve for the current time). ponytail: one card, 25 samples per curve (the kind's own limit), no damping, small-angle start only.
const text = max => z.string().min(1).max(max);
export const pendulumSchema = z.object({
  title: text(60), g: z.number().positive(), theta0: z.number().positive().max(60), duration: z.number().positive().max(60),
  reference: z.object({ mass: z.number().positive(), length: z.number().positive() }).strict(),
  plot: z.object({ title: text(60), time: text(20), angle: text(20), yMax: z.number().positive() }).strict(),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

export function source(ctx) {
  const pendulum = ctx.geometry?.pendulum;
  if (!pendulum) { const e = new Error('pendulum requires its validated data'); e.code = 'part_binding'; e.path = 'geometry.pendulum'; throw e; }
  return `const T=${JSON.stringify(pendulum)};
const RAD=Math.PI/180,SCALE=85,PIVOT_Y=44,PERIOD=length=>2*Math.PI*Math.sqrt(length/T.g);
const wrap=words=>{const lines=[];let line='';for(const word of words.split(' ')){if(line&&(line+' '+word).length>34){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
const radius=mass=>10*Math.cbrt(mass)+4,round=value=>Math.round(value*100)/100,kg=value=>String(Math.round(value*10)/10),metre=value=>String(Math.round(value*10)/10);
export function evaluate({inputs,time}){
  const t=Math.min(Math.max(time||0,0),T.duration),mass=inputs.mass,length=inputs.length,ref=T.reference,periodA=PERIOD(ref.length),periodB=PERIOD(length);
  const angleA=T.theta0*Math.cos(2*Math.PI*t/periodA),angleB=T.theta0*Math.cos(2*Math.PI*t/periodB);
  const objects=[sdk.line('support',24,PIVOT_Y,270,PIVOT_Y,{role:'neutral'})];
  const swing=(name,pivotX,len,mass,angle,role)=>{
    const bx=pivotX+len*SCALE*Math.sin(angle*RAD),by=PIVOT_Y+len*SCALE*Math.cos(angle*RAD);
    objects.push(sdk.text('label.'+name,pivotX,24,name+': '+kg(mass)+' kg, '+metre(len)+' m',{align:'middle',role:role}),sdk.line('string.'+name,pivotX,PIVOT_Y,bx,by,{role:role}),sdk.circle('ball.'+name,bx,by,2*radius(mass),{role:role}));
  };
  swing('A',82,ref.length,ref.mass,angleA,'input');
  swing('B',208,length,mass,angleB,'warning');
  const sameLength=Math.abs(length-ref.length)<1e-9,sameMass=Math.abs(mass-ref.mass)<1e-9;
  const says=sameLength&&sameMass?'B matches A: same mass, same length, same timing.':sameLength?'Same timing: only the mass differs.':length>ref.length?'Slower: a longer string takes longer.':'Faster: a shorter string swings quicker.';
  const lines=wrap(says);
  objects.push(sdk.box('callout.active.l0',12,244,300,14+lines.length*22,{role:'input',opacity:1}));
  lines.forEach((value,j)=>objects.push(sdk.text('callout.active.s'+j,24,270+j*22,value,{role:'neutral',opacity:1})));
  const curve=(label,period)=>({label:label,kind:'line',samples:{x:{start:0,step:T.duration/24},y:Array.from({length:25},(_,i)=>round(T.theta0*Math.cos(2*Math.PI*(i*T.duration/24)/period)))}});
  const spec={version:1,diagram:{kind:'coordinate-plot',title:T.plot.title,x:{label:T.plot.time,min:0,max:T.duration,unit:'s'},y:{label:T.plot.angle,min:-T.plot.yMax,max:T.plot.yMax,unit:'°'},
    series:[curve('A',periodA),curve('B',periodB)],
    annotations:[{kind:'point',label:'A now',x:round(t),y:round(angleA)},{kind:'point',label:'B now',x:round(t),y:round(angleB)}]}};
  objects.push(sdk.diagram(spec,{x:326,y:4,w:310}));
  return {frame:sdk.frame(objects,{width:640,height:310,readouts:[{id:'periodA',value:periodA},{id:'periodB',value:periodB}]}),quantities:{mass:mass,length:length,periodA:periodA,periodB:periodB}};
}`;
}
