const K=.5,R=.11,MAXS=200,X0=.5;
const L=(s,x,z)=>.5*(s*x*x+z*z);
const rnd=n=>{const v=Math.sin(n*12.9898+78.233)*43758.5453;return v-Math.floor(v)};
const gs=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(2*Math.PI*rnd(n+.5));
const out=(s,i)=>Math.abs(s.x)>2/Math.sqrt(i.stretch)||Math.abs(s.z)>2;
const done=(s,i)=>out(s,i)||s.step>=MAXS;
function grad(s,i,seed){const k=s.step*2+1+(seed||0)*.37;return[i.stretch*s.x+i.noise*gs(k),s.z+i.noise*gs(k+.25)]}
function adv(s,i,seed){if(done(s,i))return{...s,on:false};const g=grad(s,i,seed),x=s.x-i.learningRate*g[0],z=s.z-i.learningRate*g[1];const n={...s,x,z,step:s.step+1,path:s.path.concat([[x,z]])};return done(n,i)?{...n,on:false}:n}
const fresh=(z0,kept)=>({x:X0,z:z0,z0,step:0,on:false,path:[[X0,z0]],kept});
export function initialState(){return fresh(1.6,[])}
export function reduce({state:s,event:e,inputs:i,seed}){
 if(e.type==='step')return !s.on||e.tick%3?s:adv(s,i,seed);
 if((e.type==='drag_move'||e.type==='drag_end')&&e.node==='ball')return fresh(Math.max(-1.9,Math.min(1.9,e.value)),s.kept);
 if(e.type!=='action')return s;
 if(e.action==='run')return done(s,i)?s:{...s,on:true};
 if(e.action==='pause')return{...s,on:false};
 if(e.action==='stepOnce')return adv({...s,on:false},i,seed);
 if(e.action==='again')return{...fresh(s.z0,s.step>0?s.path:s.kept),on:true};
 return s}
const lift=(p,st)=>[p[0],Math.min(K*L(st,p[0],p[1]),2)+.03,p[1]];
function aim(dx,dz,on){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return on&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false}}
export function evaluate({inputs:i,state,seed}){
 const s=state||initialState(),st=i.stretch,l=L(st,s.x,s.z),g=grad(s,i,seed),live=!done(s,i);
 const w=out(s,i)?'diverged':s.step>=MAXS?(l<.05?'converged':'stopped'):s.on?'running':'paused';
 return{nodes:{bowl:{scale:[1/Math.sqrt(st),1,1]},ball:{position:[s.x,K*l+R,s.z]},slopeArrow:aim(.3*g[0],.3*g[1],live),trail:{points:s.path.map(p=>lift(p,st))},ghost:{points:s.kept.map(p=>lift(p,st))}},readouts:{steps:s.step,loss:l,dist:Math.hypot(s.x,s.z),status:w}}}
