const K=0.25,R=0.14,H=2,FLAT=0.02,MAX=100,Z0=1.2,X0=1.6;
const loss=(x,z)=>0.5*x*x+1.5*z*z;
const slope=s=>Math.hypot(s.x,3*s.z);
const word=s=>Math.abs(s.x)>H||Math.abs(s.z)>H?'diverged':slope(s)<FLAT?'converged':s.step>=MAX?'100-step limit':s.on?'running':'paused';
const over=s=>{const w=word(s);return w!=='running'&&w!=='paused';};
const TAG={diverged:'Diverged',converged:'Settled','100-step limit':'Step limit'};
const fresh=x=>({x,z:Z0,step:0,on:false,path:[[x,Z0]]});
function advance(s,lr){if(over(s))return {...s,on:false};const x=s.x-lr*s.x,z=s.z-lr*3*s.z;return {...s,x,z,step:s.step+1,path:s.path.concat([[x,z]])};}
export function initialState(){return fresh(X0);}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step'){if(!s.on)return s;if(over(s))return {...s,on:false};return e.tick%6?s:advance(s,inputs.learningRate);}
 if(e.type==='action'){
  if(e.action==='run')return over(s)?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return advance({...s,on:false},inputs.learningRate);
  return s;}
 if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end'){const v=Math.max(-1.9,Math.min(1.9,Number(e.value)||0));return fresh(v);}
 return s;}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),2.2)+0.04,p[1]];
function aim(dx,dz,shown){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return shown&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state}){
 const s=state||initialState(),L=loss(s.x,s.z),lr=inputs.learningRate,w=word(s),done=over(s),live=!done&&inputs.showArrow,len=lr*slope(s);
 return {nodes:{ball:{position:[s.x,Math.min(K*L,2.2)+R,s.z]},stepArrow:aim(-lr*s.x,-lr*3*s.z,live),stepTag:{visible:live&&len>0.3},statusTag:{visible:done,text:TAG[w]||'Settled'},trail:{points:s.path.map(lift)}},
  readouts:{status:w,loss:L,steps:s.step,slope:slope(s)}};}
