const R=0.16,H=2,MAXS=200,SZ=1.5;
const S={bowl:{K:0.25,L:(x,z)=>2*x*x+0.5*z*z,g:(x,z)=>[4*x,z]},twoValleys:{K:0.5,L:(x,z)=>0.25*(x*x-2)**2+0.3*x+0.25*z*z+0.5,g:(x,z)=>[x*(x*x-2)+0.3,0.5*z]}};
const sf=i=>S[i.surface]||S.bowl;
const slope=(s,i)=>Math.hypot(...sf(i).g(s.x,s.z));
const word=(s,i)=>Math.abs(s.x)>H||Math.abs(s.z)>H?'diverged':slope(s,i)<1e-3?'converged':s.n>=MAXS?'stopped':s.on?'running':'paused';
const over=(s,i)=>{const w=word(s,i);return w!=='running'&&w!=='paused';};
const fresh=(x,kept)=>({x,z:SZ,n:0,on:false,path:[[x,SZ]],kept});
function adv(s,i){if(over(s,i))return {...s,on:false};const g=sf(i).g(s.x,s.z),r=i.learningRate,x=s.x-r*g[0],z=s.z-r*g[1];return {...s,x,z,n:s.n+1,path:s.path.concat([[x,z]])};}
export function initialState(){return fresh(1,[]);}
export function reduce({state:s,event:e,inputs:i}){
 if(e.type==='step'){if(!s.on)return s;if(over(s,i))return {...s,on:false};return e.tick%3?s:adv(s,i);}
 if(e.type==='parameter')return e.parameter==='surface'?fresh(1,[]):s;
 if(e.type==='drag_start'||e.type==='drag_move'||e.type==='drag_end')return fresh(Math.max(-1.9,Math.min(1.9,Number(e.value))),s.kept);
 if(e.type!=='action')return s;
 if(e.action==='run')return over(s,i)?s:{...s,on:true};
 if(e.action==='pause')return {...s,on:false};
 if(e.action==='stepOnce')return adv({...s,on:false},i);
 if(e.action==='keepPath')return fresh(s.path[0][0],s.n>0?s.path:s.kept);
 return s;}
function aim(dx,dz,show){const l=Math.hypot(dx,dz),h=Math.SQRT1_2;return show&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};}
export function evaluate({inputs:i,state}){
 const s=state||initialState(),f=sf(i),v=i.surface==='twoValleys',L=f.L(s.x,s.z),g=f.g(s.x,s.z),r=i.learningRate,live=!over(s,i);
 const lift=p=>[p[0],Math.min(f.K*f.L(p[0],p[1]),3)+0.03,p[1]];
 const gx=f.K*g[0],gz=f.K*g[1],ball={position:[s.x,Math.min(f.K*L,3)+R*Math.sqrt(1+gx*gx+gz*gz),s.z]};
 const a=aim(-r*g[0],-r*g[1],live&&i.showArrow!==false);
 return {nodes:{surfB:{visible:!v},surfV:{visible:v},ballB:v?{visible:false}:{...ball,visible:true},ballV:v?{...ball,visible:true}:{visible:false},arrowB:a,arrowV:a,trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
 readouts:{loss:L,steps:s.n,slope:Math.hypot(g[0],g[1]),status:word(s,i)}};}
