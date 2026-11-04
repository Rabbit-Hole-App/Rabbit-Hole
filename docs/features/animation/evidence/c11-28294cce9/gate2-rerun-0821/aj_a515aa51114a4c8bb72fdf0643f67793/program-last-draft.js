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
const word=(b,s)=>off(b)?'diverged':L(b.x,b.y)<TOL?'converged':s.n>=MAXS?'stopped at 60 steps':s.on?'running':s.n===0?'ready':'paused';
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const lift=p=>{const x=cl(p[0],4),z=cl(p[1],2);return[x,K*L(x,z)+0.05,z];};
const pos=(b,up)=>{const x=cl(b.x,4),z=cl(b.y,2),gx=K*x,gz=K*4*z;return[x,K*L(x,z)+R*Math.sqrt(1+gx*gx+gz*gz)+up,z];};
function aim(b,show){const dx=-b.x,dz=-4*b.y,v=Math.hypot(dx,dz),h=Math.SQRT1_2;
if(!show||fin(b)||v<1e-6)return{visible:false};
return{visible:true,quaternion:[dz/v*h,0,-dx/v*h,h],scale:[1,S*v,1]};}
export function evaluate({inputs,state}){const s=state||initialState(),sh=inputs.showGradient&&s.n<MAXS;
const pa=pos(s.a,0),pb0=pos(s.b,0),near=Math.hypot(pa[0]-pb0[0],pa[2]-pb0[2])<2*R,pb=near?[pb0[0],Math.max(pb0[1],pa[1]+2*R),pb0[2]]:pb0;
return{nodes:{ballA:{position:pa},ballB:{position:pb},arrA:aim(s.a,sh),arrB:aim(s.b,sh),trailA:{points:s.a.p.map(lift)},trailB:{points:s.b.p.map(lift)}},
readouts:{lossA:L(s.a.x,s.a.y),lossB:L(s.b.x,s.b.y),statusA:word(s.a,s),statusB:word(s.b,s),steps:s.n}};}