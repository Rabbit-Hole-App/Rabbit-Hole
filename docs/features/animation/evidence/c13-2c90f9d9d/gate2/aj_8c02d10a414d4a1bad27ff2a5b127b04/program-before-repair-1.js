const K=0.3,R=0.2,XM=2,ZM=3,NZ=1.5,S=0.15,MAXN=200,SX=1.5,SZ=2.5;
const L=(x,z)=>0.5*(z*z+4*x*x);
const rnd=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gs=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(6.283185*rnd(n+0.37));
const sd=i=>NZ/Math.sqrt(i.batchSize);
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
function grad(s,i){const d=sd(i);return [4*s.x+d*gs(s.n*2+11),s.z+d*gs(s.n*2+12)];}
function adv(s,i){if(s.n>=MAXN)return s;const r=i.learningRate,g=grad(s,i),x=cl(s.x-r*g[0],XM),z=cl(s.z-r*g[1],ZM),ex=s.ex-r*4*s.ex,ez=s.ez-r*s.ez;return {...s,x,z,ex,ez,n:s.n+1,p:s.p.concat([[x,z]]),q:s.q.concat([[ex,ez]])};}
const fresh=(x,z)=>({x,z,ex:x,ez:z,sx:x,sz:z,n:0,on:false,p:[[x,z]],q:[[x,z]]});
export function initialState(){return fresh(SX,SZ);}
export function reduce({state:s,event:e,inputs:i}){
if(e.type==='step'){if(!s.on||s.n>=MAXN||e.tick%3)return s;const t=adv(s,i);return t.n>=MAXN?{...t,on:false}:t;}
if(e.type==='action'){if(e.action==='run')return s.n>=MAXN?s:{...s,on:true};if(e.action==='pause')return {...s,on:false};if(e.action==='stepOnce')return adv({...s,on:false},i);return s;}
if(e.type==='drag_move'||e.type==='drag_end'){if(e.node==='ball')return fresh(cl(e.value,XM),s.sz);if(e.node==='ghost')return fresh(s.sx,cl(e.value,ZM));}
return s;}
const lift=p=>[p[0],K*L(p[0],p[1])+0.04,p[1]];
export function evaluate({inputs:i,state}){
const s=state||initialState(),g=grad(s,i),v=Math.hypot(g[0],g[1]),h=Math.SQRT1_2,done=s.n>=MAXN;
const arrow=i.showArrow&&!done&&v>1e-9?{visible:true,quaternion:[g[1]/v*h,0,-g[0]/v*h,h],scale:[1,S*v,1]}:{visible:false};
return {nodes:{ball:{position:[s.x,K*L(s.x,s.z)+R,s.z]},ghost:{position:[s.ex,K*L(s.ex,s.ez)+R,s.ez],visible:!!i.showExact},gradArrow:arrow,sgdTrail:{points:s.p.map(lift)},gdTrail:{points:s.q.map(lift),visible:!!i.showExact}},
readouts:{sgdLoss:L(s.x,s.z),gdLoss:L(s.ex,s.ez),steps:s.n,noise:sd(i),status:done?'finished':s.on?'running':'paused'}};}
