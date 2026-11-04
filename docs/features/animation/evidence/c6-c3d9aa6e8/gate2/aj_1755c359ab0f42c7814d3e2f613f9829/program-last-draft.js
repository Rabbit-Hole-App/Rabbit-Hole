const K=0.2,R=0.14,HX=3,HZ=2,TOP=2.6,TOL=0.001,MAX=60,S0=[2.5,1.5],SC=0.12;
const loss=(x,z)=>0.5*(x*x+4*z*z);
const ball=()=>({x:S0[0],z:S0[1],done:'',path:[S0]});
function move(b,lr){if(b.done)return b;const x=b.x-lr*b.x,z=b.z-lr*4*b.z;const done=Math.abs(x)>HX||Math.abs(z)>HZ?'diverged':loss(x,z)<TOL?'converged':'';return{x,z,done,path:b.path.concat([[x,z]])};}
const over=s=>s.step>=MAX||(s.a.done&&s.b.done);
function adv(s,i){if(over(s))return{...s,on:false};const n={...s,a:move(s.a,i.lrA),b:move(s.b,i.lrB),step:s.step+1};if(over(n))n.on=false;return n;}
export function initialState(){return{a:ball(),b:ball(),step:0,on:false};}
export function reduce({state:s,event:e,inputs}){if(e.type==='step')return!s.on||e.tick%6?s:adv(s,inputs);if(e.type!=='action')return s;if(e.action==='run')return over(s)?s:{...s,on:true};if(e.action==='pause')return{...s,on:false};if(e.action==='stepOnce')return adv({...s,on:false},inputs);if(e.action==='again')return initialState();return s;}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),TOP)+0.03,p[1]];
function arrow(b){const dx=-b.x,dz=-4*b.z,m=Math.hypot(dx,dz);if(b.done||m<1e-6)return{visible:false};const h=Math.SQRT1_2,ux=dx/m,uz=dz/m;return{visible:true,position:[R*ux,0,R*uz],quaternion:[uz*h,0,-ux*h,h],scale:[1,m*SC,1]};}
const word=(s,b)=>b.done||(s.step>=MAX?'stopped at 60 steps':s.on?'running':'paused');
export function evaluate({state}){const s=state||initialState(),a=s.a,b=s.b;const pos=q=>[q.x,Math.min(K*loss(q.x,q.z),TOP)+R,q.z];return{nodes:{ballA:{position:pos(a)},ballB:{position:pos(b)},arrowA:arrow(a),arrowB:arrow(b),trailA:{points:a.path.map(lift)},trailB:{points:b.path.map(lift)}},readouts:{lossA:loss(a.x,a.z),lossB:loss(b.x,b.z),distA:Math.hypot(a.x,a.z),distB:Math.hypot(b.x,b.z),statusA:word(s,a),statusB:word(s,b),steps:s.step}};}
