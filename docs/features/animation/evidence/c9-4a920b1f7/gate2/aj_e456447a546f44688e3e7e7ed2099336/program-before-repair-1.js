const K=0.25,R=0.14,HX=3,HY=1.5,MAX=40,S0={wall:[1,1.2],end:[2.6,0.15]};
const loss=(x,y)=>0.5*(x*x+4*y*y);
const out=s=>Math.abs(s.x)>HX||Math.abs(s.y)>HY;
const word=s=>out(s)?'diverged':loss(s.x,s.y)<1e-3?'converged':s.n>=MAX?'step limit':s.on?'running':'paused';
const done=s=>out(s)||loss(s.x,s.y)<1e-3||s.n>=MAX;
const fresh=(st,kept)=>{const p=S0[st]||S0.wall;return {x:p[0],y:p[1],n:0,on:false,path:[p],kept,last:0,cross:false};};
function advance(s,inputs){
  if(done(s))return s;
  const lr=inputs.learningRate,gx=s.x,gy=4*s.y,x=s.x-lr*gx,y=s.y-lr*gy;
  return {...s,x,y,n:s.n+1,last:lr*Math.hypot(gx,gy),cross:s.y*y<0,path:s.path.concat([[x,y]])};
}
export function initialState({inputs}){return fresh(inputs.start,[]);}
export function reduce({state:s,event:e,inputs}){
  if(e.type==='step')return !s.on||done(s)||e.tick%5?s:advance(s,inputs);
  if(e.type==='parameter')return e.parameter==='start'?fresh(e.value,s.kept):s;
  if(e.type!=='action')return s;
  if(e.action==='run')return done(s)?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return advance({...s,on:false},inputs);
  if(e.action==='newRun')return fresh(inputs.start,s.n>0?s.path:s.kept);
  return s;
}
const lift=p=>[p[0],Math.min(K*loss(p[0],p[1]),2.25)+0.05,p[1]];
export function evaluate({inputs,state}){
  const s=state||initialState({inputs}),L=loss(s.x,s.y),dx=-s.x,dz=-4*s.y,l=Math.hypot(dx,dz),h=Math.SQRT1_2;
  const show=inputs.showArrow&&!done(s)&&l>1e-6;
  const r={status:word(s),steps:s.n,loss:L};
  if(s.n>0){r.crossed=s.cross?'yes':'no';r.lastStep=s.last;}
  return {
    nodes:{
      ball:{position:[s.x,K*L+R,s.y]},
      arrow:show?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,0.25*l,1]}:{visible:false},
      trail:{points:s.path.map(lift)},
      ghost:{points:s.kept.map(lift)}
    },
    readouts:r
  };
}
