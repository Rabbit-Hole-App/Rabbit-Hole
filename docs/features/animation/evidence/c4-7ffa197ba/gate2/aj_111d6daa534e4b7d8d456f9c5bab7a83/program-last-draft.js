const K=0.3,R=0.13,HX=3,HZ=1.5,S=0.3,MAXS=40,TOP=2.7;
const ST={farSide:[2.6,0.3],steepSide:[0.5,1.3],corner:[2.5,1.2]};
const f=(x,y)=>0.5*(x*x+4*y*y);
const off=s=>Math.abs(s.x)>HX||Math.abs(s.y)>HZ;
const done=s=>off(s)||f(s.x,s.y)<0.001||s.n>=MAXS;
const word=s=>off(s)?'left the surface':f(s.x,s.y)<0.001?'converged':s.n>=MAXS?'stopped at 40 steps':s.on?'running':'paused';
function fresh(inputs,kept){const p=ST[inputs.startPoint]||ST.farSide;return {x:p[0],y:p[1],n:0,on:false,path:[p],kept};}
function advance(s,inputs){if(done(s))return s;const lr=inputs.learningRate,x=s.x-lr*s.x,y=s.y-lr*4*s.y;return {...s,x,y,n:s.n+1,path:s.path.concat([[x,y]])};}
export function initialState({inputs}){return fresh(inputs,[]);}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step')return !s.on||done(s)||e.tick%6?s:advance(s,inputs);
if(e.type==='parameter'&&e.parameter==='startPoint')return fresh({...inputs,startPoint:e.value},s.kept);
if(e.type!=='action')return s;
if(e.action==='run')return done(s)?s:{...s,on:true};
if(e.action==='pause')return {...s,on:false};
if(e.action==='stepOnce')return advance({...s,on:false},inputs);
if(e.action==='keepPath')return {...fresh(inputs,s.n>0?s.path:s.kept),on:true};
return s;}
const lift=p=>[p[0],Math.min(K*f(p[0],p[1]),TOP)+0.03,p[1]];
function aim(dx,dz,shown){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return shown&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state}){
const s=state||initialState({inputs}),L=f(s.x,s.y),sh=inputs.showSlopeArrow&&!done(s),al=S*Math.hypot(s.x,4*s.y);
return {nodes:{ball:{position:[s.x,K*L+R,s.y]},slopeArrow:aim(-S*s.x,-S*4*s.y,sh),slopeTag:{visible:sh&&al>0.4},trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
readouts:{status:word(s),loss:L,steps:s.n,xPos:s.x,yPos:s.y,mult:1-4*inputs.learningRate}};}