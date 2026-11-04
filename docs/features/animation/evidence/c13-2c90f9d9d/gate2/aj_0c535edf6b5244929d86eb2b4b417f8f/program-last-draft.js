const R=0.22,K=0.06,HX=3,HU=6,S=2,MAX=200,X0=2.5,Z0=1.5;
const edge=k=>HU/Math.sqrt(k);
const gn=(s,k)=>Math.hypot(s.x,k*s.z);
const out=(s,k)=>Math.abs(s.x)>HX||Math.abs(s.z)>edge(k);
function word(s,k){if(out(s,k))return'diverged';if(gn(s,k)<0.001)return'converged';if(s.step>=MAX)return'stopped';return s.on?'running':'paused';}
const over=(s,k)=>{const w=word(s,k);return w!=='running'&&w!=='paused';};
function adv(s,i){const k=i.steepness,r=i.learningRate;if(over(s,k))return{...s,on:false};const x=s.x-r*s.x,z=s.z-r*k*s.z;const n={...s,x,z,step:s.step+1,path:s.path.concat([[x,z]]).slice(-202)};return over(n,k)?{...n,on:false}:n;}
const fresh=(x,z,kept)=>({x,z,step:0,on:false,path:[[x,z]],kept});
export function initialState(){return fresh(X0,Z0,[]);}
export function reduce({state:s,event:e,inputs}){
const k=inputs.steepness;
if(e.type==='step')return !s.on||e.tick%3?s:adv(s,inputs);
if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end'){const m=0.95*edge(k);return fresh(X0,Math.max(-m,Math.min(m,e.value)),s.kept);}
if(e.type!=='action')return s;
if(e.action==='run')return over(s,k)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},inputs);
if(e.action==='newRun'){const p=s.path[0];return fresh(p[0],p[1],s.step>0?s.path:s.kept);}
return s;}
export function evaluate({inputs,state}){
const s=state||initialState(),k=inputs.steepness,r=inputs.learningRate,e=edge(k);
const h=(x,z)=>K*(x*x+k*z*z);
const lift=p=>{const x=Math.max(-HX,Math.min(HX,p[0])),z=Math.max(-e,Math.min(e,p[1]));return[x,h(x,z)+0.05,z];};
const dx=-r*s.x,dz=-r*k*s.z,v=Math.hypot(dx,dz),q=Math.SQRT1_2;
const arrow=inputs.showStepArrow&&!over(s,k)&&v>1e-9?{visible:true,quaternion:[dz/v*q,0,-dx/v*q,q],scale:[1,S*v,1]}:{visible:false};
return{nodes:{bowl:{scale:[1,1,1/Math.sqrt(k)]},ball:{position:[s.x,h(s.x,s.z)+R,s.z]},stepArrow:arrow,trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
readouts:{loss:0.5*(s.x*s.x+k*s.z*s.z),steps:s.step,grad:gn(s,k),status:word(s,k)}};}
