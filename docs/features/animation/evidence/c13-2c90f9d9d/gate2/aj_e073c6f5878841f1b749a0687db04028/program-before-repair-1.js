const K=0.25,R=0.2,LIM=4,MAX=60,S=[-3,1];
const loss=(x,z)=>0.25*x*x+0.75*z*z;
const ball=()=>({x:S[0],z:S[1],path:[S],div:false});
const done=b=>b.div||loss(b.x,b.z)<0.001;
function move(b,r){if(done(b))return b;const x=b.x-r*0.5*b.x,z=b.z-r*1.5*b.z;if(Math.abs(x)>LIM||Math.abs(z)>LIM)return {...b,div:true};return {x,z,div:false,path:b.path.concat([[x,z]])};}
const fresh=()=>({n:0,on:false,a:ball(),b:ball()});
const over=s=>s.n>=MAX||(done(s.a)&&done(s.b));
const adv=(s,i)=>over(s)?{...s,on:false}:{...s,n:s.n+1,a:move(s.a,i.lrA),b:move(s.b,i.lrB)};
export function initialState(){return fresh();}
export function reduce({state:s,event:e,inputs}){
if(e.type==='parameter')return fresh();
if(e.type==='step')return !s.on||e.tick%4?s:adv(s,inputs);
if(e.type!=='action')return s;
if(e.action==='run')return {...s,on:!over(s)};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},inputs);
return s;}
const lift=p=>[p[0],K*loss(p[0],p[1])+0.05,p[1]];
const word=(b,s)=>b.div?'diverged':loss(b.x,b.z)<0.001?'converged':s.n>=MAX?'stopped at 60 steps':s.on?'running':'paused';
export function evaluate({inputs,state}){const s=state||fresh(),a=s.a,b=s.b;
return {nodes:{A:{position:[a.x,K*loss(a.x,a.z)+R,a.z]},B:{position:[b.x,K*loss(b.x,b.z)+R,b.z]},trailA:{points:a.path.map(lift)},trailB:{points:b.path.map(lift)},tagA:{text:'A: rate '+inputs.lrA.toFixed(2)},tagB:{text:'B: rate '+inputs.lrB.toFixed(2)}},
readouts:{steps:s.n,lossA:loss(a.x,a.z),lossB:loss(b.x,b.z),statusA:word(a,s),statusB:word(b,s)}};}
