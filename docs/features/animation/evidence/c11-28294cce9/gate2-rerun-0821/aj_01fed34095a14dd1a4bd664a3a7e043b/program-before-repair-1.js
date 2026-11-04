const K=0.04,R=0.2,H=4,MAXS=200,FLAT=0.001,SC=1.5,S0=[1.6,3.2];
const loss=(x,z)=>0.5*(z*z+4*x*x);
const slope=s=>Math.hypot(4*s.x,s.z);
const out=s=>Math.abs(s.x)>H||Math.abs(s.z)>H;
const over=s=>out(s)||slope(s)<FLAT||s.n>=MAXS;
const word=s=>out(s)?'diverged':slope(s)<FLAT?'converged':s.n>=MAXS?'step limit':s.on?'running':'paused';
function adv(s,lr){if(over(s))return {...s,on:false};const x=s.x-lr*4*s.x,z=s.z-lr*s.z,t={...s,x,z,n:s.n+1,path:s.path.concat([[x,z]])};return over(t)?{...t,on:false}:t;}
const fresh=(sx,sz,ghost)=>({x:sx,z:sz,sx,sz,n:0,on:false,path:[[sx,sz]],ghost});
export function initialState(){return fresh(S0[0],S0[1],[]);}
export function reduce({state:s,event:e,inputs}){
const lr=inputs.learningRate;
if(e.type==='step')return !s.on||e.tick%3?s:adv(s,lr);
if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end'){const x=Math.max(-3.8,Math.min(3.8,e.value));return fresh(x,Math.max(-H,Math.min(H,s.z)),s.ghost);}
if(e.type!=='action')return s;
if(e.action==='play')return over(s)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},lr);
if(e.action==='clearPath')return {...s,path:[[s.x,s.z]]};
if(e.action==='again')return fresh(s.sx,s.sz,s.path.length>1?s.path:s.ghost);
return s;}
const c=v=>Math.max(-H,Math.min(H,v));
const lift=p=>{const x=c(p[0]),z=c(p[1]);return [x,K*loss(x,z)+0.05,z];};
export function evaluate({inputs,state}){
const s=state||initialState(),lr=inputs.learningRate,bx=c(s.x),bz=c(s.z);
const dx=-lr*4*s.x,dz=-lr*s.z,v=Math.hypot(dx,dz),h=Math.SQRT1_2;
const show=inputs.showArrow&&!over(s)&&v>1e-6;
return {nodes:{
ball:{position:[bx,K*loss(bx,bz)+R,bz]},
arrow:show?{visible:true,quaternion:[dz/v*h,0,-dx/v*h,h],scale:[1,v*SC,1]}:{visible:false},
trail:{points:s.path.map(lift)},
ghost:{points:s.ghost.map(lift)}},
readouts:{status:word(s),steps:s.n,loss:loss(s.x,s.z),slope:slope(s)}};}
