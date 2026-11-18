import { z } from 'zod';

// Brief 33/34: the landing page's pendulum card ("What changes a pendulum's swing?"). Physics in the program: T = 2 pi sqrt(L / g), angle = theta0 cos(2 pi t / T); mass does not enter. A (the reference) is fixed,
// B follows the mass and length sliders. Primitives draw the two pendulums and the callout; the angle-against-time plot is an /explain coordinate-plot through sdk.diagram (its smooth line, fixed ranges).
// Brief 34: each curve is sampled from its own period (a point at every quarter period, so every peak is exactly theta0, plus the end; the eighth-period midpoints too when the 25-sample limit allows). The spec has
// the same structure at every setting and time (no annotations, long series names so the renderer always draws its legend and never on-curve names), so the plot never moves; the current time is a thin line and
// one dot per curve drawn as frame objects at the plot's own coordinates (plot.frame, baked by scripts/interact/bake-pendulum-geometry.mjs). ponytail: one card, no damping, small-angle start only.
const text = max => z.string().min(1).max(max);
export const pendulumSchema = z.object({
  title: text(60), g: z.number().positive(), theta0: z.number().positive().max(60), duration: z.number().positive().max(60),
  reference: z.object({ mass: z.number().positive(), length: z.number().positive() }).strict(),
  plot: z.object({ title: text(60), time: text(20), angle: text(20), yMax: z.number().positive(), nameA: text(42), nameB: text(42), frame: z.object({ left: z.number(), right: z.number(), top: z.number(), bottom: z.number() }).strict() }).strict(),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

export function source(ctx) {
  const pendulum = ctx.geometry?.pendulum;
  if (!pendulum) { const e = new Error('pendulum requires its validated data'); e.code = 'part_binding'; e.path = 'geometry.pendulum'; throw e; }
  return `const T=${JSON.stringify(pendulum)};
const RAD=Math.PI/180,SCALE=78,PIVOT_Y=40,PERIOD=length=>2*Math.PI*Math.sqrt(length/T.g);
const wrap=words=>{const lines=[];let line='';for(const word of words.split(' ')){if(line&&(line+' '+word).length>34){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
const radius=mass=>10*Math.cbrt(mass)+4,kg=value=>String(Math.round(value*10)/10),metre=value=>String(Math.round(value*10)/10);
// A point at every quarter period from 0 to the end, then the end; the midpoint of every pair too while the total stays within the kind's 25 samples.
const sampleTimes=period=>{const quarter=period/4,base=[];for(let k=0;k*quarter<T.duration-1e-9;k++)base.push(k*quarter);base.push(T.duration);return base.length*2-1<=25?base.flatMap((value,i)=>i?[(base[i-1]+value)/2,value]:[value]):base;};
// The renderer draws each curve as a Steffen monotone cubic through its samples (tutor-diagrams/plot-lines.js monotoneLinePath; the limiter is the same in data and pixel space), so the dot takes its height from that same curve.
const spline=(xs,ys,t)=>{const n=xs.length,dx=[],s=[],m=[];for(let i=1;i<n;i++){dx.push(xs[i]-xs[i-1]);s.push((ys[i]-ys[i-1])/dx[i-1]);}
for(let i=1;i<n-1;i++){const l=s[i-1],r=s[i],sign=Math.sign(l);m.push(sign!==Math.sign(r)?0:sign*Math.min(2*Math.abs(l),2*Math.abs(r),Math.abs((l*dx[i]+r*dx[i-1])/(dx[i-1]+dx[i]))));}
m.unshift((3*s[0]-m[0])/2);m.push((3*s[n-2]-m[m.length-1])/2);
let i=0;while(i<n-2&&t>xs[i+1])i++;const h=dx[i],u=(t-xs[i])/h,u2=u*u,u3=u2*u;
return (2*u3-3*u2+1)*ys[i]+(u3-2*u2+u)*h*m[i]+(3*u2-2*u3)*ys[i+1]+(u3-u2)*h*m[i+1];};
export function evaluate({inputs,time}){
  const t=Math.min(Math.max(time||0,0),T.duration),mass=inputs.mass,length=inputs.length,ref=T.reference,periodA=PERIOD(ref.length),periodB=PERIOD(length);
  const angleA=T.theta0*Math.cos(2*Math.PI*t/periodA),angleB=T.theta0*Math.cos(2*Math.PI*t/periodB);
  const objects=[sdk.line('support',24,PIVOT_Y,270,PIVOT_Y,{role:'neutral'})];
  const swing=(name,pivotX,len,mass,angle,role)=>{
    const bx=pivotX+len*SCALE*Math.sin(angle*RAD),by=PIVOT_Y+len*SCALE*Math.cos(angle*RAD);
    objects.push(sdk.text('label.'+name,pivotX,22,name+': '+kg(mass)+' kg, '+metre(len)+' m',{align:'middle',role:role}),sdk.polyline('string.'+name,[[pivotX,PIVOT_Y],[bx,by]],{role:role}),sdk.circle('ball.'+name,bx,by,2*radius(mass),{role:role}));
  };
  swing('A',82,ref.length,ref.mass,angleA,'input');
  swing('B',208,length,mass,angleB,'warning');
  const sameLength=Math.abs(length-ref.length)<1e-9,sameMass=Math.abs(mass-ref.mass)<1e-9;
  const says=sameLength&&sameMass?'B matches A: same mass, same length, same timing.':sameLength?'Same timing: only the mass differs.':length>ref.length?'Slower: a longer string takes longer.':'Faster: a shorter string swings quicker.';
  const lines=wrap(says);
  objects.push(sdk.box('callout.active.l0',12,224,300,14+lines.length*22,{role:'input',opacity:1}));
  lines.forEach((value,j)=>objects.push(sdk.text('callout.active.s'+j,24,250+j*22,value,{role:'neutral',opacity:1})));
  const curve=(label,period)=>{const times=sampleTimes(period);return {label:label,kind:'line',samples:{x:times.map(value=>Math.round(value*1e4)/1e4),y:times.map(value=>Math.round(T.theta0*Math.cos(2*Math.PI*value/period)*1e3)/1e3)}};};
  const curveA=curve(T.plot.nameA,periodA),curveB=curve(T.plot.nameB,periodB),drawn=c=>spline(c.samples.x,c.samples.y,t);
  const spec={version:1,diagram:{kind:'coordinate-plot',title:T.plot.title,x:{label:T.plot.time,min:0,max:T.duration,unit:'s'},y:{label:T.plot.angle,min:-T.plot.yMax,max:T.plot.yMax,unit:'°'},
    series:[curveA,curveB]}};
  objects.push(sdk.diagram(spec,{x:326,y:4,w:310}));
  const F=T.plot.frame,nowX=F.left+t/T.duration*(F.right-F.left),at=angle=>F.top+(T.plot.yMax-angle)/(2*T.plot.yMax)*(F.bottom-F.top);
  objects.push(sdk.line('now',nowX,F.top,nowX,F.bottom,{role:'neutral'}),sdk.circle('dot.A',nowX,at(drawn(curveA)),12,{role:'input'}),sdk.circle('dot.B',nowX,at(drawn(curveB)),12,{role:'warning'}));
  return {frame:sdk.frame(objects,{width:640,height:290,readouts:[{id:'periodA',value:periodA},{id:'periodB',value:periodB}]}),quantities:{mass:mass,length:length,periodA:periodA,periodB:periodB}};
}`;
}
