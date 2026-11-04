const K=0.15,R=0.18,S=0.25,N=60,TOL=0.005;
const ST={far_left:[-3.6,0.6],steep_side:[-1,1.8],corner:[-3.5,1.7]};
const L=(x,y)=>0.5*(x*x+4*y*y);
const ball=p=>({x:p[0],y:p[1],path:[p],end:''});
const fresh=inp=>{const p=ST[inp.start]||ST.far_left;return{a:ball(p),b:ball(p),n:0,on:false}};
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
function move(o,lr){if(o.end)return o;let x=o.x-lr*o.x,y=o.y-lr*4*o.y,end='';if(Math.abs(x)>4||Math.abs(y)>2){x=cl(x,4);y=cl(y,2);end='diverged'}else if(L(x,y)<TOL)end='converged';return{x,y,end,path:o.path.concat([[x,y]])}}
const over=s=>s.n>=N||(s.a.end&&s.b.end);
const adv=(s,i)=>over(s)?s:{...s,a:move(s.a,i.lrA),b:move(s.b,i.lrB),n:s.n+1};
export function initialState({inputs}){return fresh(inputs)}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step'){if(!s.on||e.tick%4)return s;const t=adv(s,inputs);return over(t)?{...t,on:false}:t}
 if(e.type==='parameter'){return e.parameter==='showArrows'?s:fresh({...inputs,[e.parameter]:e.value})}
 if(e.type!=='action')return s;
 if(e.action==='run')return over(s)?s:{...s,on:true};
 if(e.action==='pause')return{...s,on:false};
 if(e.action==='stepOnce')return adv({...s,on:false},inputs);
 if(e.action==='again')return fresh(inputs);
 return s}
const lift=p=>[p[0],Math.min(K*L(p[0],p[1]),2.4)+0.05,p[1]];
function aim(o,show){const dx=-o.x*S,dz=-4*o.y*S,l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&!o.end&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false}}
const word=(o,s)=>o.end||(s.n>=N?'step limit':s.on?'running':'paused');
export function evaluate({inputs,state}){const s=state||fresh(inputs),a=s.a,b=s.b,sh=!!inputs.showArrows;
 return{nodes:{ballA:{position:[a.x,K*L(a.x,a.y)+R,a.y]},ballB:{position:[b.x,K*L(b.x,b.y)+R,b.y]},arrowA:aim(a,sh),arrowB:aim(b,sh),trailA:{points:a.path.map(lift)},trailB:{points:b.path.map(lift)}},
 readouts:{lossA:L(a.x,a.y),lossB:L(b.x,b.y),steps:s.n,statusA:word(a,s),statusB:word(b,s)}}}
