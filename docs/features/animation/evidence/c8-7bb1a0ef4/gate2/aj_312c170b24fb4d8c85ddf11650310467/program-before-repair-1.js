const K=0.12,R=0.24,H=3,MAX=200;
const loss=(x,y)=>0.5*(x*x+5*y*y);
const steep=s=>Math.hypot(s.x,5*s.y);
const cl=v=>Math.max(-H,Math.min(H,v));
const word=s=>Math.abs(s.x)>H||Math.abs(s.y)>H?'diverged':steep(s)<0.01?'converged':s.n>=MAX?'step limit':s.on?'running':'paused';
const over=s=>{const w=word(s);return w!=='running'&&w!=='paused';};
const fresh=(x,y)=>({x,y,n:0,on:false,path:[[x,y]]});
function adv(s,lr){if(over(s))return s;const x=s.x-lr*s.x,y=s.y-lr*5*s.y,n=s.n+1;const path=n%2?s.path:s.path.concat([[x,y]]).slice(-101);return{...s,x,y,n,path};}
export function initialState(){return fresh(-2.5,1.5);}
export function reduce({state:s,event:e,inputs}){
const lr=inputs.learningRate;
if(e.type==='step'){if(!s.on||e.tick%2)return s;const t=adv(s,lr);return over(t)?{...t,on:false}:t;}
if(e.type==='action'){
if(e.action==='run')return over(s)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},lr);
return s;}
if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end'){
if(e.node==='ball')return fresh(cl(e.value),cl(s.y));
if(e.node==='handle')return fresh(cl(s.x),cl(e.value));}
return s;}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),3.24)+0.05,p[1]];
function aim(dx,dz,on){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return on&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state}){
const s=state||initialState(),L=loss(s.x,s.y),lr=inputs.learningRate,live=!over(s);
return{nodes:{
ball:{position:[s.x,K*L+R,s.y]},
arrow:aim(-lr*s.x,-lr*5*s.y,live&&inputs.showArrow),
trail:{points:s.path.map(lift)},
handle:{position:[3.6,0,cl(s.y)]}},
readouts:{loss:L,steps:s.n,steep:steep(s),status:word(s)}};}
