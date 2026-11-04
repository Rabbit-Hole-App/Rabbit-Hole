const A=3,K=0.5,R=0.13,H=2,S=0.4,MAXS=200;
const loss=(x,z)=>0.5*(A*x*x+z*z);
const cl=v=>Math.max(-H,Math.min(H,v));
const rand=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rand(n))))*Math.cos(2*Math.PI*rand(n+0.5));
function grad(s,inp){const b=inp.batchSize,sd=b==='full'?0:2/Math.sqrt(Number(b)),k=s.run*1009+s.step*2+1;return [A*s.x+sd*gauss(k),s.z+sd*gauss(k+0.37)];}
const word=s=>Math.abs(s.x)>=H||Math.abs(s.z)>=H?'diverged':loss(s.x,s.z)<0.002?'converged':s.on?'running':'paused';
const over=s=>s.step>=MAXS||word(s)==='diverged'||word(s)==='converged';
function advance(s,inp){if(over(s))return {...s,on:false};const g=grad(s,inp),lr=inp.learningRate,x=cl(s.x-lr*g[0]),z=cl(s.z-lr*g[1]),step=s.step+1;return {...s,x,z,step,path:step%2?s.path:s.path.concat([[x,z]]).slice(-101)};}
const fresh=(x,z,run,kept)=>({x,z,step:0,run,on:false,path:[[x,z]],kept});
export function initialState(){return fresh(0.3,1.6,0,[]);}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step'){if(!s.on||e.tick%3)return s;const n=advance(s,inputs);return over(n)?{...n,on:false}:n;}
if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end')return fresh(Math.max(-1.95,Math.min(1.95,e.value)),s.z,s.run+1,s.kept);
if(e.type!=='action')return s;
if(e.action==='run')return over(s)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return advance({...s,on:false},inputs);
if(e.action==='clearPath')return fresh(s.x,s.z,s.run+1,s.path.length>1?s.path:s.kept);
return s;}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),4)+0.04,p[1]];
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state}){
const s=state||initialState(),L=loss(s.x,s.z),live=!over(s),g=grad(s,inputs),tx=A*s.x,tz=s.z,px=K*A*s.x,pz=K*s.z;
return {nodes:{ball:{position:[s.x,K*L+R*Math.sqrt(1+px*px+pz*pz),s.z]},noisyArrow:aim(S*g[0],S*g[1],live),trueArrow:aim(S*tx,S*tz,live&&inputs.showTrueGradient),trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
readouts:{loss:L,steps:s.step,slope:Math.hypot(tx,tz),status:word(s)}};}
