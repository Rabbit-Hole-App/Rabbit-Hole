const K=0.25,R=0.13,HX=2,HZ=3,MAX=200,SC=1.5;
const L=(x,z)=>0.5*(4*x*x+z*z);
const rnd=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s)};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(6.283185*rnd(n+0.37));
const out=(x,z)=>Math.abs(x)>HX||Math.abs(z)>HZ;
const cl=(v,h)=>Math.max(-h,Math.min(h,v));
function noisy(s,inp,seed){const sd=2/Math.sqrt(inp.batchSize),k=seed*7919+s.run*1009+s.step*2+1;return [4*s.x+sd*gauss(k),s.z+sd*gauss(k+0.5)]}
const over=s=>out(s.x,s.z)||s.step>=MAX;
const word=s=>out(s.x,s.z)?'diverged':s.step>=MAX?'finished':s.on?'running':'paused';
function adv(s,inp,seed){if(over(s))return s;const g=noisy(s,inp,seed),lr=inp.learningRate,x=s.x-lr*g[0],z=s.z-lr*g[1];let ex=s.ex,ez=s.ez,ep=s.ep;if(!out(ex,ez)){ex-=lr*4*ex;ez-=lr*ez;ep=ep.concat([[ex,ez]])}const n={...s,x,z,ex,ez,ep,step:s.step+1,path:s.path.concat([[x,z]])};n.on=s.on&&!over(n);return n}
const fresh=(x,z,run)=>({x,z,ex:x,ez:z,step:0,run,on:false,path:[[x,z]],ep:[[x,z]]});
export function initialState(){return fresh(1.6,2.4,0)}
export function reduce({state:s,event:e,inputs,seed}){
if(e.type==='step')return !s.on||e.tick%3?s:adv(s,inputs,seed);
if(e.type==='drag_move'||e.type==='drag_end')return fresh(cl(e.value,1.95),cl(s.z,2.95),s.run+1);
if(e.type!=='action')return s;
if(e.action==='run')return over(s)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},inputs,seed);
if(e.action==='clearPath')return fresh(cl(s.x,1.95),cl(s.z,2.95),s.run+1);
return s}
const lift=p=>{const x=cl(p[0],HX),z=cl(p[1],HZ);return [x,K*L(x,z)+0.05,z]};
function aim(dx,dz,on,w){const v=Math.hypot(dx,dz),h=Math.SQRT1_2;return on&&v>1e-6?{visible:true,quaternion:[dz/v*h,0,-dx/v*h,h],scale:[w,v*SC,w]}:{visible:false}}
export function evaluate({inputs,state,seed}){
const s=state||initialState(),lr=inputs.learningRate,live=!over(s),g=noisy(s,inputs,seed),tx=4*s.x,tz=s.z;
const gn=Math.hypot(g[0],g[1]),tn=Math.hypot(tx,tz),c=gn*tn>0?(g[0]*tx+g[1]*tz)/(gn*tn):1;
const gp=lift([s.ex,s.ez]),sh=!!inputs.showFullBatch;
return{nodes:{
ball:{position:[s.x,K*L(s.x,s.z)+R,s.z]},
stepArrow:aim(-lr*g[0],-lr*g[1],live,1),
trueArrow:aim(-lr*tx,-lr*tz,live,0.55),
trail:{points:s.path.map(lift)},
eTrail:{points:s.ep.map(lift),visible:sh},
ghost:{position:[gp[0],gp[1]+R,gp[2]],visible:sh}},
readouts:{loss:L(s.x,s.z),dist:Math.hypot(s.x,s.z),angle:Math.acos(Math.max(-1,Math.min(1,c)))*180/Math.PI,steps:s.step,status:word(s)}}}
