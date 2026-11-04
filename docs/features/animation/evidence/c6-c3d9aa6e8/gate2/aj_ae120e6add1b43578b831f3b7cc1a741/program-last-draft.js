const K=0.3,R=0.18,H=4,MAXS=200,TOP=5.2,A=3;
const L=(x,y,s)=>0.5*(x*x+s*y*y);
const fr=v=>v-Math.floor(v);
const rnd=(n,sd)=>fr(Math.sin(n*12.9898+sd*78.233)*43758.5453);
const gauss=(n,sd)=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n,sd))))*Math.cos(2*Math.PI*rnd(n+0.37,sd));
const fresh=(sx,sy,run,kept)=>({sx,sy,x:sx,y:sy,n:0,run,on:false,path:[[sx,sy]],kept});
const off=(s,i)=>Math.abs(s.x)>H||Math.sqrt(i.steepness)*Math.abs(s.y)>H;
const conv=(s,i)=>i.noise===0&&L(s.x,s.y,i.steepness)<1e-6;
const done=(s,i)=>off(s,i)||s.n>=MAXS||conv(s,i);
function next(s,i,sd){const k=s.run*4001+s.n*2+1,a=i.noise;return[-i.learningRate*(s.x+a*gauss(k,sd)),-i.learningRate*(i.steepness*s.y+a*gauss(k+0.5,sd))];}
function advance(s,i,sd){if(done(s,i))return s;const[dx,dy]=next(s,i,sd),x=s.x+dx,y=s.y+dy,n=s.n+1;return{...s,x,y,n,path:n%2?s.path:s.path.concat([[x,y]]).slice(-100)};}
export function initialState(){return fresh(-3.2,1.2,0,[]);}
export function reduce({state:s,event:e,inputs:i,seed}){
if(e.type==='step')return !s.on||done(s,i)||e.tick%3?s:advance(s,i,seed);
if((e.type==='drag_move'||e.type==='drag_end')&&e.node==='ball')return fresh(Math.max(-3.8,Math.min(3.8,e.value)),s.sy,s.run,s.kept);
if(e.type!=='action')return s;
if(e.action==='run')return done(s,i)?s:{...s,on:true};
if(e.action==='stepOnce')return advance({...s,on:false},i,seed);
if(e.action==='restartRun')return fresh(s.sx,s.sy,s.run+1,s.n>0?s.path.concat([[s.x,s.y]]):s.kept);
return s;}
const lift=(p,st)=>[p[0],Math.min(K*L(p[0],p[1],st),TOP)+0.05,p[1]];
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1.5,A*l,1.5]}:{visible:false};}
function word(s,i,lo){if(off(s,i))return'diverged';if(done(s,i))return lo<0.05?'converged':'stopped';return s.on?'running':'paused';}
export function evaluate({inputs:i,state,seed}){
const s=state||initialState(),st=i.steepness,lo=L(s.x,s.y,st),live=!done(s,i),[dx,dy]=next(s,i,seed);
return{nodes:{
bowl:{scale:[1,2,1/Math.sqrt(st)]},
ball:{position:[s.x,Math.min(K*lo,TOP)+R,s.y]},
divTag:{visible:off(s,i)},
stepArrow:aim(dx,dy,live),
slopeArrow:aim(-i.learningRate*s.x,-i.learningRate*st*s.y,live),
trail:{points:s.path.concat([[s.x,s.y]]).map(p=>lift(p,st))},
ghost:{points:s.kept.map(p=>lift(p,st))}},
readouts:{loss:lo,dist:Math.hypot(s.x,s.y),steps:s.n,status:word(s,i,lo)}};}
