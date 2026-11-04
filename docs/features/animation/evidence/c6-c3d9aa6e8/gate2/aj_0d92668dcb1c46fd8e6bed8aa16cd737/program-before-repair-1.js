const K=0.32,R=0.15,H=3,X0=2.8,Z0=0.5,MAXS=40,TOL=1e-3;
const loss=(x,z,k)=>0.5*(x*x+k*z*z);
const edge=k=>H/Math.sqrt(k);
const cl=(v,m)=>Math.max(-m,Math.min(m,v));
const word=(s,k)=>Math.abs(s.x)>H||Math.abs(s.z)>edge(k)?'diverged':loss(s.x,s.z,k)<TOL?'converged':s.step>=MAXS?'step limit':'running';
const fresh=kept=>({x:X0,z:Z0,step:0,prev:null,path:[[X0,Z0]],kept});
function advance(s,i){const k=i.steepness;if(word(s,k)!=='running')return s;const r=i.learningRate,x=s.x*(1-r),z=s.z*(1-r*k);return {...s,x,z,step:s.step+1,prev:loss(s.x,s.z,k),path:s.path.concat([[x,z]])};}
export function initialState(){return fresh([]);}
export function reduce({state:s,event:e,inputs}){
 if(e.type==='step')return e.tick%8?s:advance(s,inputs);
 if(e.type==='action'&&e.action==='stepOnce')return advance(s,inputs);
 if(e.type==='parameter')return e.parameter==='learningRate'?fresh(s.step>0?s.path:s.kept):fresh([]);
 return s;}
export function evaluate({inputs,state}){
 const s=state||initialState(),k=inputs.steepness,r=inputs.learningRate,ez=edge(k);
 const q=p=>[cl(p[0],H),cl(p[1],ez)];
 const lift=p=>{const c=q(p);return [c[0],K*loss(c[0],c[1],k)+0.04,c[1]];};
 const c=q([s.x,s.z]),gx=K*c[0],gz=K*k*c[1],L=loss(s.x,s.z,k),w=word(s,k);
 const dx=-r*s.x,dz=-r*k*s.z,l=Math.hypot(dx,dz),h=Math.SQRT1_2;
 const arrow=w==='running'&&l>1e-6?{visible:true,quaternion:[dz/l*h,0,-dx/l*h,h],scale:[1,l,1]}:{visible:false};
 const ro={status:w,steps:s.step,loss:L,overLimit:1/k,runLimit:2/k};
 if(s.prev!==null)ro.dLoss=L-s.prev;
 return {nodes:{bowl:{scale:[1,1,1/Math.sqrt(k)]},ball:{position:[c[0],K*loss(c[0],c[1],k)+R*Math.sqrt(1+gx*gx+gz*gz),c[1]]},stepArrow:arrow,trail:{points:s.path.map(lift)},ghost:{points:s.kept.map(lift)}},readouts:ro};}
