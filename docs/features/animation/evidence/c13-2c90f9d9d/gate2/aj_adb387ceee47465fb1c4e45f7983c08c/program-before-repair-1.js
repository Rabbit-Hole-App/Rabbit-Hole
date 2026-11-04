const K=0.08,R=0.2,H=4,S=1.5,MAXS=200,ST=[-3,2];
const two=i=>i.surface==='twoValleys';
const loss=(x,y,t)=>t?(x*x-4)**2/8+2*y*y:0.5*(x*x+4*y*y);
const grad=(x,y,t)=>t?[x*(x*x-4)/2,4*y]:[x,4*y];
const out=s=>Math.abs(s.x)>H||Math.abs(s.y)>H;
function word(s,i){if(out(s))return'diverged';const g=grad(s.x,s.y,two(i));if(Math.hypot(g[0],g[1])<0.01)return'settled';if(s.n>=MAXS)return'stopped at 200';return s.on?'running':'paused';}
const done=(s,i)=>{const w=word(s,i);return w!=='running'&&w!=='paused';};
function adv(s,i){if(done(s,i))return s;const g=grad(s.x,s.y,two(i)),r=i.learningRate,x=s.x-r*g[0],y=s.y-r*g[1];return{...s,x,y,n:s.n+1,path:s.path.concat([[x,y]]).slice(-256)};}
const fresh=(x,y,kept)=>({x,y,n:0,on:false,path:[[x,y]],kept});
export function initialState(){return fresh(ST[0],ST[1],[]);}
export function reduce({state:s,event:e,inputs:i}){
if(e.type==='step'){if(!s.on)return s;if(done(s,i))return{...s,on:false};if(e.tick%2)return s;const t=adv(s,i);return done(t,i)?{...t,on:false}:t;}
if(e.type==='action'){
if(e.action==='run')return done(s,i)?s:{...s,on:true};
if(e.action==='stepOnce')return adv({...s,on:false},i);
if(e.action==='clearTrail')return{...s,path:[[s.x,s.y]]};
if(e.action==='keepPath')return fresh(ST[0],ST[1],s.n>0?s.path:s.kept);
return s;}
if(e.type==='parameter'&&e.parameter==='surface')return out(s)?fresh(ST[0],ST[1],[]):fresh(s.x,s.y,[]);
if(e.type.startsWith('drag')&&typeof e.value==='number'){const x=Math.max(-3.8,Math.min(3.8,e.value)),y=Math.abs(s.y)>3.8?ST[1]:s.y;return fresh(x,y,s.kept);}
return s;}
const rim=c=>Math.max(-H,Math.min(H,c));
export function evaluate({inputs:i,state}){
const s=state||initialState(),t=two(i),L=loss(s.x,s.y,t),g=grad(s.x,s.y,t),r=i.learningRate,dx=-r*g[0],dz=-r*g[1],m=Math.hypot(dx,dz),v=m*S;
const lift=p=>{const x=rim(p[0]),z=rim(p[1]);return[x,K*loss(x,z,t)+0.05,z];};
const bx=rim(s.x),bz=rim(s.y),pos=[bx,K*loss(bx,bz,t)+R,bz],h=Math.SQRT1_2;
const arr=i.showArrow&&!done(s,i)&&v>0.05?{visible:true,quaternion:[dz/m*h,0,-dx/m*h,h],scale:[1,v,1]}:{visible:false},off={visible:false};
return{nodes:{surfV:{visible:!t},surfT:{visible:t},ballV:{visible:!t,position:pos},ballT:{visible:t,position:pos},arrowV:t?off:arr,arrowT:t?arr:off,trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},
readouts:{status:word(s,i),loss:L,slope:Math.hypot(g[0],g[1]),steps:s.n}};}
