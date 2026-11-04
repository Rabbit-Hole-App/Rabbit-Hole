const K=0.2,H=3,R=0.14,MAXS=200,SC=1.5,START=[1,2.4];
const hx=s=>H/Math.sqrt(s);
const loss=(x,z,s)=>s*x*x+z*z;
const gsz=(x,z,s)=>Math.hypot(2*s*x,2*z);
const rand=n=>{const v=Math.sin(n*12.9898+78.233)*43758.5453;return v-Math.floor(v);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand(n))))*Math.cos(2*Math.PI*rand(n+0.37));
const out=(st,i)=>Math.abs(st.x)>hx(i.steepness)||Math.abs(st.z)>H;
const over=(st,i)=>out(st,i)||st.conv||st.step>=MAXS;
function word(st,i){if(out(st,i))return'diverged';if(st.conv)return'converged';if(st.step>=MAXS)return'200 steps done';return st.on?'running':'paused';}
function next(st,i,seed){const s=i.steepness,k=(seed||0)*7919+st.run*1009+st.step*2,r=i.learningRate;return[-r*(2*s*st.x+i.noise*gauss(k)),-r*(2*st.z+i.noise*gauss(k+0.5))];}
function advance(st,i,seed){if(over(st,i))return st;const[dx,dz]=next(st,i,seed),x=st.x+dx,z=st.z+dz;return{...st,x,z,step:st.step+1,conv:i.noise===0&&gsz(x,z,i.steepness)<0.01,path:st.path.concat([[x,z]])};}
const fresh=(x,z,run)=>({x,z,x0:x,z0:z,step:0,run,on:false,conv:false,path:[[x,z]]});
export function initialState(){return fresh(START[0],START[1],0);}
const cl=(v,a)=>Math.max(-a,Math.min(a,v));
export function reduce({state:st,event:e,inputs:i,seed}){
if(e.type==='step')return!st.on||over(st,i)||e.tick%3?st:advance(st,i,seed);
if(e.type==='action'){
if(e.action==='run')return over(st,i)?st:{...st,on:true};
if(e.action==='pause')return{...st,on:false};
if(e.action==='stepOnce')return advance({...st,on:false},i,seed);
return st;}
if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end'){
const run=st.run+(e.type==='drag_start'?1:0),v=Number(e.value);
if(e.node==='ball')return fresh(cl(v,1.3),st.z0,run);
if(e.node==='knob')return fresh(st.x0,cl(v,2.8),run);}
return st;}
function aim(dx,dz,shown){const v=Math.hypot(dx,dz),h=Math.SQRT1_2;return shown&&v>1e-6?{visible:true,quaternion:[dz/v*h,0,-dx/v*h,h],scale:[1,v*SC,1]}:{visible:false};}
export function evaluate({inputs:i,state,seed}){
const st=state||initialState(),s=i.steepness,L=loss(st.x,st.z,s),[dx,dz]=next(st,i,seed),a=hx(s);
const lift=p=>{const x=cl(p[0],a),z=cl(p[1],H);return[x,K*loss(x,z,s)+0.03,z];};
return{nodes:{
bowl:{scale:[1/Math.sqrt(s),1,1]},
ball:{position:[st.x,K*L+R,st.z]},
stepArrow:aim(dx,dz,!over(st,i)),
trail:{points:st.path.map(lift)},
knob:{position:[-3.6,0.16,st.z0]}},
readouts:{loss:L,gradSize:gsz(st.x,st.z,s),steps:st.step,status:word(st,i)}};}
