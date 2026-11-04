const K=0.25,R=0.14,XW=2,ZW=2.5,SIG=2,MAXN=300,SC=1.5,START=[1.2,2.2];
const loss=(x,z)=>0.5*(z*z+4*x*x);
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const rnd=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s);};
const gauss=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(2*Math.PI*rnd(n+0.37));
const sdOf=i=>i.batchSize==='full'?0:SIG/Math.sqrt(Number(i.batchSize));
function grads(s,i,seed){const sd=sdOf(i),k=(seed||0)*7919+s.run*2003+s.step*3;return{tx:4*s.x,tz:s.z,nx:4*s.x+sd*gauss(k+1),nz:s.z+sd*gauss(k+2)};}
const done=s=>s.st!=='running'&&s.st!=='paused';
function advance(s,i,seed){
  if(done(s))return s;
  const g=grads(s,i,seed),lr=i.learningRate;
  let x=s.x-lr*g.nx,z=s.z-lr*g.nz;
  const out=Math.abs(x)>XW||Math.abs(z)>ZW;
  x=cl(x,XW);z=cl(z,ZW);
  const step=s.step+1,calm=loss(x,z)<0.1?s.calm+1:0;
  const path=step%3===0?s.path.concat([[x,z]]):s.path;
  const st=out?'diverged':calm>=5?'converged':step>=MAXN?'stopped':s.st;
  return{...s,x,z,step,calm,path,st};
}
const fresh=(run,start,kept)=>({x:start[0],z:start[1],start,step:0,run,calm:0,path:[start],kept,st:'paused'});
export function initialState(){return fresh(0,START,[]);}
export function reduce({state:s,event:e,inputs,seed}){
  if(e.type==='step')return s.st!=='running'||e.tick%3?s:advance(s,inputs,seed);
  if(e.type==='drag_move'||e.type==='drag_end')return fresh(s.run,[cl(e.value,XW),s.start[1]],s.kept);
  if(e.type!=='action')return s;
  if(e.action==='play')return done(s)?s:{...s,st:'running'};
  if(e.action==='pause')return s.st==='running'?{...s,st:'paused'}:s;
  if(e.action==='stepOnce')return advance(done(s)?s:{...s,st:'paused'},inputs,seed);
  if(e.action==='runAgain')return{...fresh(s.run+1,s.start,s.step>0?s.path.concat([[s.x,s.z]]):s.kept),st:'running'};
  return s;
}
const lift=p=>[p[0],K*loss(p[0],p[1])+0.04,p[1]];
function aim(dx,dz,w,show){
  const v=Math.hypot(dx,dz),h=Math.SQRT1_2;
  if(!show||v<1e-6)return{visible:false};
  return{visible:true,quaternion:[dz/v*h,0,-dx/v*h,h],scale:[w,v*SC,w]};
}
export function evaluate({inputs,state,seed}){
  const s=state||initialState(),L=loss(s.x,s.z),g=grads(s,inputs,seed),lr=inputs.learningRate,live=!done(s);
  return{
    nodes:{
      ball:{position:[s.x,K*L+R,s.z]},
      noisyArrow:aim(-lr*g.nx,-lr*g.nz,2,live),
      fullArrow:aim(-lr*g.tx,-lr*g.tz,1,live),
      trail:{points:s.path.concat([[s.x,s.z]]).map(lift)},
      ghost:{points:s.kept.map(lift)}
    },
    readouts:{loss:L,steps:s.step,noise:sdOf(inputs),status:s.st}
  };
}
