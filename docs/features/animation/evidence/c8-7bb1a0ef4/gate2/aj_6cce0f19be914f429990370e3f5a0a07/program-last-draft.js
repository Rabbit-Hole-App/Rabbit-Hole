const K=0.5,R=0.13,H=2,S=2,N=200,BX=2.25;
const L=(x,z,s)=>0.5*(x*x+s*z*z);
const rnd=n=>{const v=Math.sin(n*12.9898+78.233)*43758.5453;return v-Math.floor(v);};
const gs=n=>Math.sqrt(-2*Math.log(Math.max(1e-9,rnd(n))))*Math.cos(6.2832*rnd(n+0.37));
const cl=(v,a)=>Math.max(-a,Math.min(a,v));
const zl=s=>0.95*H/Math.sqrt(s);
const out=(st,s)=>!isFinite(st.x)||!isFinite(st.z)||Math.abs(st.x)>H||Math.abs(st.z)>H/Math.sqrt(s);
const grad=(st,i)=>{const k=st.run*1009+st.n*2+0.5;return [st.x+i.noise*gs(k),i.stretch*st.z+i.noise*gs(k+0.25)];};
const fresh=(fx,fz,run)=>({fx,fz,x:fx,z:fz,n:0,run,path:[[fx,fz]]});
export function initialState(){return fresh(-1.6,0.6,0);}
function place(s,fx,fz){const t={...s,fx,fz};return s.n===0?{...t,x:fx,z:fz,path:[[fx,fz]]}:t;}
export function reduce({state:s,event:e,inputs:i}){
 if(e.type==='step'){
  if(out(s,i.stretch)||s.n>=N)return s;
  const g=grad(s,i),x=s.x-i.learningRate*g[0],z=s.z-i.learningRate*g[1],n=s.n+1;
  return {...s,x,z,n,path:n%2===0?s.path.concat([[x,z]]):s.path};
 }
 if(e.type==='action'&&e.action==='clearPath')return fresh(s.fx,s.fz,s.run);
 if(e.type==='drag_move'||e.type==='drag_end'){
  if(e.node==='flag')return place(s,cl(e.value+BX,1.9),s.fz);
  if(e.node==='base')return place(s,s.fx,cl(e.value,zl(i.stretch)));
 }
 if(e.type==='parameter'&&e.parameter==='stretch')return place(s,s.fx,cl(s.fz,zl(e.value)));
 return s;
}
function aim(dx,dz,on){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return on&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,S*l,1]}:{visible:false};}
const tag=a=>({visible:a.visible&&a.scale[1]>0.6});
export function evaluate({inputs:i,state}){
 const s=state||initialState(),st=i.stretch,zm=H/Math.sqrt(st),lr=i.learningRate;
 const o=out(s,st),Lv=L(s.x,s.z,st);
 const dp=p=>[cl(isFinite(p[0])?p[0]:0,H),cl(isFinite(p[1])?p[1]:0,zm)];
 const hy=p=>Math.min(K*L(p[0],p[1],st),2);
 const b=dp([s.x,s.z]),live=!o&&s.n<N,g=grad(s,i),d=Math.hypot(s.x,s.z);
 const sa=aim(-lr*g[0],-lr*g[1],live),ta=aim(-lr*s.x,-lr*st*s.z,live&&i.showTrueGradient);
 const by=hy([2,s.fz]);
 const status=o?'diverged':s.n>=N?(Lv<0.05?'converged':'stopped'):s.n===0?'paused':'running';
 return {
  nodes:{
   bowl:{scale:[1,1,1/Math.sqrt(st)]},
   ball:{position:[b[0],hy(b)+R,b[1]]},
   stepArrow:sa,stepTag:tag(sa),
   trueArrow:ta,trueTag:tag(ta),
   minTag:{visible:!o&&d>0.4},
   trail:{points:s.path.concat([[s.x,s.z]]).map(dp).map(p=>[p[0],hy(p)+0.03,p[1]])},
   base:{position:[BX,by,s.fz]},
   flag:{position:[s.fx-BX,hy([s.fx,s.fz])+0.25-by,0]}
  },
  readouts:{loss:Lv,dist:d,steps:s.n,status}
 };
}