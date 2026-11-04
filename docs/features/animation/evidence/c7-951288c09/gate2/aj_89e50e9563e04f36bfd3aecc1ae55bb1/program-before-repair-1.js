const K=0.15,R=0.15,H=3,MAX=60,TOL=1e-3;
const loss=(x,y)=>0.5*(x*x+2*y*y);
const out=b=>Math.abs(b.x)>H||Math.abs(b.y)>H;
const done=b=>out(b)||loss(b.x,b.y)<TOL||b.n>=MAX;
const fresh=(x,y)=>({x,y,n:0,path:[[x,y]]});
function adv(b,r){if(done(b))return b;const x=b.x-r*b.x,y=b.y-r*2*b.y;return{x,y,n:b.n+1,path:b.path.concat([[x,y]])};}
const init=(i,on)=>({on,a:fresh(i.startX,i.startY),b:fresh(i.startX,i.startY)});
const both=(s,i,on)=>{const a=adv(s.a,i.rateA),b=adv(s.b,i.rateB);return{a,b,on:on&&!(done(a)&&done(b))};};
export function initialState({inputs}){return init(inputs,false);}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='parameter')return init({...inputs,[e.parameter]:e.value},false);
 if(e.type==='step')return !s.on||e.tick%6?s:both(s,inputs,true);
 if(e.type!=='action')return s;
 if(e.action==='run')return{...s,on:!(done(s.a)&&done(s.b))};
 if(e.action==='pause')return{...s,on:false};
 if(e.action==='stepOnce')return both(s,inputs,false);
 if(e.action==='again')return init(inputs,true);
 return s;}
const word=(b,on)=>out(b)?'diverged':loss(b.x,b.y)<TOL?'converged':b.n>=MAX?'step limit':on?'running':'paused';
const cl=v=>Math.max(-H,Math.min(H,v));
const pt=p=>{const x=cl(p[0]),y=cl(p[1]);return[x,K*loss(x,y)+0.04,y];};
const ball=b=>{const x=cl(b.x),y=cl(b.y);return{position:[x,K*loss(x,y)+R,y]};};
export function evaluate({inputs,state}){
 const s=state||initialState({inputs});
 return{nodes:{ballA:ball(s.a),ballB:ball(s.b),trailA:{points:s.a.path.map(pt)},trailB:{points:s.b.path.map(pt)},tagA:{text:'lr '+inputs.rateA.toFixed(2)},tagB:{text:'lr '+inputs.rateB.toFixed(2)}},
 readouts:{statusA:word(s.a,s.on),lossA:loss(s.a.x,s.a.y),stepsA:s.a.n,statusB:word(s.b,s.on),lossB:loss(s.b.x,s.b.y),stepsB:s.b.n}};}
