const K=0.1,R=0.22,HX=5,HY=3,MAX=60,TOL=0.001;
const loss=(x,y)=>0.5*(x*x+4*y*y);
const out=b=>Math.abs(b.x)>HX||Math.abs(b.y)>HY;
const done=b=>out(b)||loss(b.x,b.y)<TOL||b.n>=MAX;
const word=(b,on)=>out(b)?'diverged':loss(b.x,b.y)<TOL?'converged':b.n>=MAX?'stopped':on?'running':'paused';
const ball=()=>({x:-4,y:2,n:0,p:[[-4,2]]});
function adv(b,r){if(done(b))return b;const x=b.x*(1-r),y=b.y*(1-4*r);return{x,y,n:b.n+1,p:b.p.concat([[x,y]])};}
const fresh=()=>({a:ball(),b:ball(),on:false});
export function initialState(){return fresh();}
function both(s,i){const a=adv(s.a,i.learningRateA),b=adv(s.b,i.learningRateB);return{a,b,on:s.on&&!(done(a)&&done(b))};}
export function reduce({state:s,event:e,inputs:i}){
if(e.type==='parameter')return fresh();
if(e.type==='step')return !s.on||e.tick%6?s:both(s,i);
if(e.type!=='action')return s;
if(e.action==='run')return done(s.a)&&done(s.b)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return both({...s,on:false},i);
return s;}
const cl=p=>[Math.max(-HX,Math.min(HX,p[0])),Math.max(-HY,Math.min(HY,p[1]))];
const lift=(p,h)=>{const c=cl(p);return[c[0],K*loss(c[0],c[1])+h,c[1]];};
const pos=b=>'('+b.x.toFixed(2)+', '+b.y.toFixed(2)+')';
export function evaluate({state}){const s=state||fresh(),a=s.a,b=s.b;
return{nodes:{ballA:{position:lift([a.x,a.y],R)},ballB:{position:lift([b.x,b.y],R)},trailA:{points:a.p.map(p=>lift(p,0.06))},trailB:{points:b.p.map(p=>lift(p,0.06))}},
readouts:{statusA:word(a,s.on),lossA:loss(a.x,a.y),stepsA:a.n,posA:pos(a),statusB:word(b,s.on),lossB:loss(b.x,b.y),stepsB:b.n,posB:pos(b)}};}
