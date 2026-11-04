const K=0.3,R=0.15,MAXS=60,EVERY=6,AS=0.25;
const L=(x,y,c)=>0.5*(x*x+c*y*y);
const lim=c=>3/Math.sqrt(c);
const off=(s,c)=>Math.abs(s.x)>3||Math.abs(s.y)>lim(c);
const word=(s,c)=>off(s,c)?'diverged':L(s.x,s.y,c)<1e-3?'converged':s.n>=MAXS?'stopped':s.n>0?'running':'paused';
const done=(s,c)=>{const w=word(s,c);return w!=='running'&&w!=='paused';};
const fresh=(sx,sy,ghost)=>({sx,sy,x:sx,y:sy,n:0,path:[[sx,sy]],ghost});
const keep=s=>s.n>0?s.path:s.ghost;
function advance(s,i){const c=i.curvature,lr=i.learningRate;if(done(s,c))return s;const x=s.x-lr*s.x,y=s.y-lr*c*s.y;return{...s,x,y,n:s.n+1,path:s.path.concat([[x,y]])};}
export function initialState(){return fresh(-2.5,0.8,[]);}
export function reduce({state:s,event:e,inputs}){
if(e.type==='step')return e.tick%EVERY?s:advance(s,inputs);
if(e.type==='action'){if(e.action==='takeStep')return advance(s,inputs);if(e.action==='runAgain')return fresh(s.sx,s.sy,keep(s));return s;}
if(e.type==='parameter'){if(e.parameter==='curvature')return fresh(s.sx,s.sy,[]);if(e.parameter==='learningRate')return fresh(s.sx,s.sy,keep(s));return s;}
if(e.type==='drag_move'||e.type==='drag_end'){const v=Math.max(-2.8,Math.min(2.8,Number(e.value)));if(e.node==='startMark')return fresh(v,s.sy,s.ghost);if(e.node==='yHandle')return fresh(s.sx,Math.max(-0.9,Math.min(0.9,v)),s.ghost);}
return s;}
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs,state}){
const c=inputs.curvature,s=state||initialState(),v=L(s.x,s.y,c),gx=s.x,gy=c*s.y;
const lift=p=>[p[0],Math.min(K*L(p[0],p[1],c),2.7)+0.05,p[1]];
return{nodes:{
bowl:{scale:[1,1,1/Math.sqrt(c)]},
ball:{position:[s.x,K*v+R,s.y]},
downArrow:aim(-AS*gx,-AS*gy,inputs.showArrow&&!done(s,c)),
startMark:{position:[s.sx,K*L(s.sx,s.sy,c)+0.03,s.sy]},
yHandle:{position:[3.5,0.15,s.sy]},
trail:{points:s.path.map(lift)},
ghost:{points:s.ghost.map(lift)}},
readouts:{loss:v,status:word(s,c),steps:s.n,grad:Math.hypot(gx,gy),posX:s.x,posY:s.y}};}
