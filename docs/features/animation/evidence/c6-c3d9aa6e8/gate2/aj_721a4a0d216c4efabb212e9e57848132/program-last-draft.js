const K=0.35,CAP=6,R=0.15,S=0.15,XM=2,ZM=1.5,MAXS=200;
const F={bowl:{L:(x,z)=>0.5*(x*x+4*z*z),g:(x,z)=>[x,4*z],st:[1.8,1.2]},twoValleys:{L:(x,z)=>(x*x-1)**2+z*z,g:(x,z)=>[4*x*(x*x-1),2*z],st:[-0.3,1.2]}};
const f=i=>F[i.surface]||F.bowl;
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const out=s=>Math.abs(s.x)>XM||Math.abs(s.z)>ZM;
function word(s,i){if(out(s))return'diverged';const g=f(i).g(s.x,s.z);if(Math.hypot(g[0],g[1])<1e-3)return'converged';if(s.n>=MAXS)return'step limit';return s.on?'running':'paused';}
const done=(s,i)=>{const w=word(s,i);return w!=='running'&&w!=='paused';};
const fresh=(x,z)=>({x:cl(x,XM),z:cl(z,ZM),n:0,on:false,path:[[cl(x,XM),cl(z,ZM)]]});
function adv(s,i){if(done(s,i))return s;const g=f(i).g(s.x,s.z),r=i.learningRate,x=s.x-r*g[0],z=s.z-r*g[1];return{...s,x,z,n:s.n+1,path:s.path.concat([[x,z]])};}
export function initialState({inputs}){const p=f(inputs).st;return fresh(p[0],p[1]);}
export function reduce({state:s,event:e,inputs:i}){
if(e.type==='step'){if(!s.on||e.tick%3)return s;const t=adv(s,i);return done(t,i)?{...t,on:false}:t;}
if(e.type==='action'){if(e.action==='run')return done(s,i)?s:{...s,on:true};if(e.action==='pause')return{...s,on:false};if(e.action==='stepOnce')return adv({...s,on:false},i);return s;}
if(e.type==='parameter'&&e.parameter==='surface'){const p=(F[e.value]||F.bowl).st;return fresh(p[0],p[1]);}
if(e.type.startsWith('drag')){if(e.node==='knob')return fresh(s.x,e.value);if(e.node==='ballA'||e.node==='ballB')return fresh(e.value,s.z);}
return s;}
function aim(dx,dz,on){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;if(!on||l<1e-6)return{visible:false};const ux=dx/l,uz=dz/l;return{visible:true,position:[ux*R,0,uz*R],quaternion:[uz*h,0,-ux*h,h],scale:[1,l,1]};}
export function evaluate({inputs:i,state}){
const s=state||initialState({inputs:i}),fn=f(i),L=fn.L(s.x,s.z),g=fn.g(s.x,s.z),gm=Math.hypot(g[0],g[1]);
const h=(x,z)=>K*Math.min(fn.L(x,z),CAP),isB=i.surface!=='twoValleys';
const pos=[s.x,h(s.x,s.z)+R,s.z],a=aim(-g[0]*S,-g[1]*S,!out(s)&&i.showArrow);
const last=s.path.length-1,pts=s.path.filter((p,k)=>k%2===0||k===last).map(p=>{const x=cl(p[0],XM),z=cl(p[1],ZM);return[x,h(x,z)+0.03,z];});
return{nodes:{surfBowl:{visible:isB},surfValleys:{visible:!isB},ballA:{visible:isB,position:pos},ballB:{visible:!isB,position:pos},arrA:a,arrB:a,trail:{points:pts},knob:{position:[-2.35,0.08,cl(s.z,ZM)]}},
readouts:{loss:L,steps:s.n,slope:gm,status:word(s,i)}};}
