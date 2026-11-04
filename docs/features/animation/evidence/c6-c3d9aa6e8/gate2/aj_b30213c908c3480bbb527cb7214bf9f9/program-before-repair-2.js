const K=0.2,R=0.14,S=1.5,XM=3,ZM=2,N=200,AS=2;
const loss=(x,z)=>0.5*(x*x+4*z*z);
const rnd=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gau=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(6.2832*rnd(n+0.37));
const sdv=i=>i.batchSize==='full'?0:S/Math.sqrt(Number(i.batchSize));
const out=(x,z)=>Math.abs(x)>XM||Math.abs(z)>ZM;
function grad(s,i,seed){const sd=sdv(i),k=(seed||0)*7+s.run*100003+s.step*2+1;return [s.x+sd*gau(k),4*s.z+sd*gau(k+0.5)];}
const done=s=>out(s.x,s.z)||s.step>=N;
const word=s=>out(s.x,s.z)?'diverged':s.step>=N?(loss(s.x,s.z)<0.1?'converged':'paused'):s.on?'running':'paused';
const fresh=(sx,sz,run)=>({sx,sz,x:sx,z:sz,ex:sx,ez:sz,step:0,run,on:false,path:[[sx,sz]],epath:[[sx,sz]]});
function adv(s,i,seed){if(done(s))return s;const [gx,gz]=grad(s,i,seed),lr=i.learningRate,x=s.x-lr*gx,z=s.z-lr*gz;let ex=s.ex,ez=s.ez;if(!out(ex,ez)){ex-=lr*ex;ez-=lr*4*ez;}return {...s,x,z,ex,ez,step:s.step+1,path:s.path.concat([[x,z]]).slice(-210),epath:s.epath.concat([[ex,ez]]).slice(-210)};}
export function initialState(){return fresh(-2.5,1.5,0);}
export function reduce({state:s,event:e,inputs:i,seed}){
if(e.type==='step')return !s.on||done(s)||e.tick%2?s:adv(s,i,seed);
if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end')return e.node==='ball'?fresh(Math.max(-2.8,Math.min(2.8,e.value)),s.sz,s.run):s;
if(e.type!=='action')return s;
if(e.action==='run')return done(s)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='once')return adv({...s,on:false},i,seed);
if(e.action==='again')return fresh(s.sx,s.sz,s.run+1);
return s;}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),2.6)+0.05,p[1]];
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,AS*l,1]}:{visible:false};}
export function evaluate({inputs:i,state,seed}){
const s=state||initialState(),L=loss(s.x,s.z),[gx,gz]=grad(s,i,seed),lr=i.learningRate;
return {nodes:{ball:{position:[s.x,K*L+R,s.z]},stepArrow:aim(-lr*gx,-lr*gz,!done(s)),trail:{points:s.path.map(lift)},exact:{visible:!!i.showExact,points:s.epath.map(lift)}},
readouts:{loss:L,steps:s.step,noise:sdv(i),dist:Math.hypot(s.x,s.z),status:word(s)}};}