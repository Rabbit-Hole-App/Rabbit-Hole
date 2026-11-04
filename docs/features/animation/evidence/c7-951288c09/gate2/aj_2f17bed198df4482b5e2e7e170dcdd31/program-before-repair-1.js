const K=0.125,R=0.15,HX=3,HZ=2,MAX=60,TOL=0.001,S=[-2.5,1.5],AS=0.2,TOP=3.2;
const loss=(x,z)=>0.5*(x*x+4*z*z);
const out=b=>Math.abs(b.x)>HX||Math.abs(b.z)>HZ;
const conv=b=>loss(b.x,b.z)<TOL;
const done=b=>out(b)||conv(b)||b.n>=MAX;
const word=(b,on)=>out(b)?'diverged':conv(b)?'converged':b.n>=MAX?'stopped at 60':on?'running':'paused';
const fresh=()=>({x:S[0],z:S[1],n:0,path:[S]});
function move(b,lr){if(done(b))return b;const x=b.x-lr*b.x,z=b.z-lr*4*b.z;return {x,z,n:b.n+1,path:b.path.concat([[x,z]])};}
const adv=(s,i)=>({...s,a:move(s.a,i.lrA),b:move(s.b,i.lrB)});
export function initialState(){return {on:false,a:fresh(),b:fresh()};}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step'){if(!s.on||e.tick%6)return s;const n=adv(s,inputs);return done(n.a)&&done(n.b)?{...n,on:false}:n;}
 if(e.type!=='action')return s;
 if(e.action==='run')return done(s.a)&&done(s.b)?s:{...s,on:true};
 if(e.action==='pause')return {...s,on:false};
 if(e.action==='stepOnce')return adv({...s,on:false},inputs);
 if(e.action==='backToStart')return initialState();
 return s;}
const cl=(v,h)=>Math.max(-h,Math.min(h,v));
const lift=(p,r)=>{const x=cl(p[0],HX),z=cl(p[1],HZ);return [x,Math.min(K*loss(x,z),TOP)+r,z];};
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state}){
 const s=state||initialState(),a=s.a,b=s.b,sh=!!inputs.showArrows;
 return {nodes:{
  ballA:{position:lift([a.x,a.z],R)},ballB:{position:lift([b.x,b.z],R)},
  arrowA:aim(-a.x*AS,-4*a.z*AS,sh&&!done(a)),arrowB:aim(-b.x*AS,-4*b.z*AS,sh&&!done(b)),
  trailA:{points:a.path.map(p=>lift(p,0.04))},trailB:{points:b.path.map(p=>lift(p,0.04))}},
  readouts:{lossA:loss(a.x,a.z),lossB:loss(b.x,b.z),stepsA:a.n,stepsB:b.n,statusA:word(a,s.on),statusB:word(b,s.on)}};}
