const K=0.25,R=0.15,N=40,H=3,TOL=0.05,GAP=0.32;
const ST={near:[1,2.5],far:[2.5,2.5]};
const loss=(x,y)=>0.5*(1.5*x*x+0.5*y*y);
const ball=p=>({x:p[0],y:p[1],out:false,path:[[p[0],p[1]]]});
const fresh=(inp,on)=>{const p=ST[inp.start]||ST.near;return{on,step:0,a:ball(p),b:ball(p)};};
function move(b,r){if(b.out)return b;const nx=b.x-r*1.5*b.x,ny=b.y-r*0.5*b.y;
if(Math.abs(nx)<=H&&Math.abs(ny)<=H)return{...b,x:nx,y:ny,path:b.path.concat([[nx,ny]])};
const f=(o,n)=>Math.abs(n)>H?(Math.sign(n)*H-o)/(n-o):1,t=Math.min(f(b.x,nx),f(b.y,ny));
const ex=b.x+t*(nx-b.x),ey=b.y+t*(ny-b.y);return{...b,x:ex,y:ey,out:true,path:b.path.concat([[ex,ey]])};}
const done=s=>s.step>=N||(s.a.out&&s.b.out);
const advance=(s,inp)=>done(s)?{...s,on:false}:{...s,step:s.step+1,a:move(s.a,inp.rateA),b:move(s.b,inp.rateB)};
export function initialState({inputs}){return fresh(inputs,false);}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step'){if(!s.on||e.tick%6)return s;const n=advance(s,inputs);return done(n)?{...n,on:false}:n;}
if(e.type==='parameter')return fresh({...inputs,[e.parameter]:e.value},true);
if(e.type!=='action')return s;
if(e.action==='run')return done(s)?s:{...s,on:true};
if(e.action==='pause')return{...s,on:false};
if(e.action==='stepOnce')return advance({...s,on:false},inputs);
return s;}
const word=(b,s)=>b.out?'diverged':loss(b.x,b.y)<TOL?'converged':s.on&&!done(s)?'running':'paused';
const lift=p=>[p[0],K*loss(p[0],p[1])+0.04,p[1]];
const pos=(x,y)=>[x,K*loss(x,y)+R,y];
export function evaluate({inputs,state}){const s=state||fresh(inputs,false);
const d=Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y),o=d<GAP?(GAP-d)/2:0,sg=s.a.x<=s.b.x?1:-1;
return{nodes:{ballA:{position:pos(s.a.x-sg*o,s.a.y)},ballB:{position:pos(s.b.x+sg*o,s.b.y)},tagA:{visible:s.a.out},tagB:{visible:s.b.out},trailA:{points:s.a.path.map(lift)},trailB:{points:s.b.path.map(lift)}},
readouts:{lossA:loss(s.a.x,s.a.y),lossB:loss(s.b.x,s.b.y),steps:s.step,statusA:word(s.a,s),statusB:word(s.b,s)}};}
