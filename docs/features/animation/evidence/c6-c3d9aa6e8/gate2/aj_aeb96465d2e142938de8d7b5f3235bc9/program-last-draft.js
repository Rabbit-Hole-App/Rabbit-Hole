const K=0.15,H=4,TOL=0.001,MAX=60,R=0.18;
const L=(x,y)=>0.5*x*x+0.75*y*y;
const out=b=>Math.abs(b.x)>H||Math.abs(b.y)>H;
const done=b=>out(b)||L(b.x,b.y)<TOL||b.n>=MAX;
const ball=i=>({x:i.startX,y:i.startY,n:0,path:[[i.startX,i.startY]]});
const fresh=i=>({on:false,a:ball(i),b:ball(i)});
function move(b,lr){if(done(b))return b;const x=b.x-lr*b.x,y=b.y-lr*1.5*b.y;return{x,y,n:b.n+1,path:b.path.concat([[x,y]])};}
const adv=(s,i)=>({...s,a:move(s.a,i.lrA),b:move(s.b,i.lrB)});
const both=s=>done(s.a)&&done(s.b);
export function initialState({inputs}){return fresh(inputs);}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step'){if(!s.on||e.tick%6)return s;const t=adv(s,inputs);return both(t)?{...t,on:false}:t;}
if(e.type==='parameter')return fresh({...inputs,[e.parameter]:e.value});
if(e.type!=='action')return s;
if(e.action==='run')return both(s)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},inputs);
if(e.action==='backToStart')return fresh(inputs);
return s;}
const word=(b,on)=>out(b)?'left the surface':L(b.x,b.y)<TOL?'settled':b.n>=MAX?'60-step limit':on?'going down':'paused';
const c=v=>Math.max(-H,Math.min(H,v));
const lift=p=>{const x=c(p[0]),z=c(p[1]);return[x,K*L(x,z)+0.05,z];};
const pos=(x,y,up)=>{const a=c(x),b=c(y);return[a,K*L(a,b)+R+up,b];};
const f=v=>Math.round(v*100)/100;
export function evaluate({inputs,state}){const s=state||fresh(inputs);
const pa=pos(s.a.x,s.a.y,0);const q=pos(s.b.x,s.b.y,0);
const near=Math.hypot(pa[0]-q[0],pa[2]-q[2])<2*R;
const pb=near?[q[0],Math.max(q[1],pa[1])+2*R,q[2]]:q;
return{nodes:{ballA:{position:pa},ballB:{position:pb},tagA:{text:'lr '+f(inputs.lrA)},tagB:{text:'lr '+f(inputs.lrB)},pathA:{points:s.a.path.map(lift)},pathB:{points:s.b.path.map(lift)}},
readouts:{statusA:word(s.a,s.on),statusB:word(s.b,s.on),lossA:L(s.a.x,s.a.y),lossB:L(s.b.x,s.b.y),stepsA:s.a.n,stepsB:s.b.n}};}
