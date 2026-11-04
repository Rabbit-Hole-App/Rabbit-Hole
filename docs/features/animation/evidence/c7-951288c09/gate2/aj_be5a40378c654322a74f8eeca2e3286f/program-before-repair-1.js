const K=0.4,H=2,R=0.16,S=0.2,Z0=1.3,X0=1.6;
const isBowl=i=>i.surfaceShape!=='twoValleys';
const loss=(i,x,z)=>isBowl(i)?0.5*(x*x+3*z*z):0.25*x**4-x*x+0.3*x+1.5+0.75*z*z;
const grad=(i,x,z)=>isBowl(i)?[x,3*z]:[x*x*x-2*x+0.3,1.5*z];
const fresh=sx=>({sx,x:sx,z:Z0,n:0,on:false,end:'',d:0,path:[[sx,Z0]]});
function adv(s,i){
 if(s.end)return s;
 const g=grad(i,s.x,s.z),r=i.learningRate,x=s.x-r*g[0],z=s.z-r*g[1],n=s.n+1;
 const g2=grad(i,x,z);
 const end=Math.abs(x)>H||Math.abs(z)>H?'diverged':Math.hypot(g2[0],g2[1])<0.001?'converged':n>=200?'200 steps reached':'';
 const path=(n%2===0||end)&&s.path.length<100?s.path.concat([[x,z]]):s.path;
 return {...s,x,z,n,end,path,d:loss(i,x,z)-loss(i,s.x,s.z),on:end?false:s.on};
}
export function initialState(){return fresh(X0);}
export function reduce({state:s,event:e,inputs:i}){
 if(e.type==='step')return !s.on||s.end||e.tick%3?s:adv(s,i);
 if(e.type==='action'){
  if(e.action==='run')return s.end?s:{...s,on:true};
  if(e.action==='pause')return {...s,on:false};
  if(e.action==='stepOnce')return adv({...s,on:false},i);
  return s;
 }
 if(e.type==='parameter'&&e.parameter==='surfaceShape')return fresh(s.sx);
 if(e.type.indexOf('drag')===0)return fresh(Math.max(-1.95,Math.min(1.95,e.value)));
 return s;
}
const hgt=(i,x,z)=>Math.min(K*loss(i,x,z),3.3);
export function evaluate({inputs:i,state}){
 const s=state||initialState(),b=isBowl(i),L=loss(i,s.x,s.z),g=grad(i,s.x,s.z),st=Math.hypot(g[0],g[1]);
 const show=i.showArrow&&st>1e-6&&s.end!=='diverged',h=Math.SQRT1_2,dx=-g[0]/st,dz=-g[1]/st;
 const arr=show?{visible:true,quaternion:[dz*h,0,-dx*h,h],scale:[1,st*S,1]}:{visible:false};
 const pos=[s.x,hgt(i,s.x,s.z)+R,s.z];
 const r={loss:L,steps:s.n,steep:st,status:s.end||(s.on?'running':'paused')};
 if(s.n>0)r.change=s.d;
 return {nodes:{bowlS:{visible:b},tvS:{visible:!b},ballA:{visible:b,position:pos},ballB:{visible:!b,position:pos},arrA:arr,arrB:arr,trail:{points:s.path.map(p=>[p[0],hgt(i,p[0],p[1])+0.05,p[1]])}},readouts:r};
}
