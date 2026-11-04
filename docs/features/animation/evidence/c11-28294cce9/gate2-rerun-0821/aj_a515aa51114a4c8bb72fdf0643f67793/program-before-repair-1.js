const K=0.15,R=0.3,X0=-3.5,Y0=1.5,MAXS=60,TOL=0.001,S=0.15;
const L=(x,y)=>0.5*(x*x+4*y*y);
const off=b=>Math.abs(b.x)>4||Math.abs(b.y)>2;
const fin=b=>off(b)||L(b.x,b.y)<TOL;
const ball=()=>({x:X0,y:Y0,p:[[X0,Y0]]});
const fresh=on=>({a:ball(),b:ball(),n:0,on});
const move=(b,r)=>{if(fin(b))return b;const x=b.x-r*b.x,y=b.y-r*4*b.y;return{x,y,p:b.p.concat([[x,y]])};};
const over=s=>s.n>=MAXS||(fin(s.a)&&fin(s.b));
const adv=(s,i)=>{if(over(s))return{...s,on:false};const t={...s,n:s.n+1,a:move(s.a,i.lrA),b:move(s.b,i.lrB)};return over(t)?{...t,on:false}:t;};
export function initialState(){return fresh(false);}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step')return !s.on||e.tick%6?s:adv(s,inputs);
if(e.type==='parameter')return e.parameter==='showGradient'?s:fresh(false);
if(e.type!=='action')return s;
if(e.action==='run')return over(s)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return adv({...s,on:false},inputs);
if(e.action==='rerun')return fresh(true);
return s;}
const word=(b,s)=>off(b)?'diverged':L(b.x,b.y)<TOL?'converged':s.n>=MAXS?'stopped at 60 steps':s.on?'running':'paused';
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const lift=p=>[cl(p[0],4),Math.min(K*L(p[0],p[1]),2.4)+0.05,cl(p[1],2)];
const pos=b=>{const gx=K*b.x,gz=K*4*b.y;return[b.x,K*L(b.x,b.y)+R*Math.sqrt(1+gx*gx+gz*gz),b.y];};
function aim(b,show){const dx=-b.x,dz=-4*b.y,v=Math.hypot(dx,dz),h=Math.SQRT1_2;
if(!show||fin(b)||v<1e-6)return{visible:false};
return{visible:true,quaternion:[dz/v*h,0,-dx/v*h,h],scale:[1,S*v,1]};}
export function evaluate({inputs,state}){const s=state||initialState(),sh=inputs.showGradient&&s.n<MAXS;
return{nodes:{ballA:{position:pos(s.a)},ballB:{position:pos(s.b)},arrA:aim(s.a,sh),arrB:aim(s.b,sh),trailA:{points:s.a.p.map(lift)},trailB:{points:s.b.p.map(lift)}},
readouts:{lossA:L(s.a.x,s.a.y),lossB:L(s.b.x,s.b.y),statusA:word(s.a,s),statusB:word(s.b,s),steps:s.n}};}
