import {add,rotate,sampleCurve} from './motion.mjs';

function transform(a,b,c,d){
  const theta=Math.atan2(d[1]-c[1],d[0]-c[0])-Math.atan2(b[1]-a[1],b[0]-a[0]);
  const cs=Math.cos(theta),sn=Math.sin(theta),tx=c[0]-cs*a[0]+sn*a[1],ty=c[1]-sn*a[0]-cs*a[1];
  const w=Math.cos(theta/2),z=Math.sin(theta/2);
  return [w,z,(tx*w+ty*z)/2,(ty*w-tx*z)/2];
}

export function dualQuaternionPoint(point,weights,bones){
  let w=0,z=0,dx=0,dy=0;
  const reference=bones[weights.indexOf(Math.max(...weights))];
  for(let i=0;i<weights.length;i++){
    const q=bones[i],sign=q[0]*reference[0]+q[1]*reference[1]<0?-1:1,k=weights[i]*sign;
    w+=q[0]*k;z+=q[1]*k;dx+=q[2]*k;dy+=q[3]*k;
  }
  const n=Math.hypot(w,z);w/=n;z/=n;dx/=n;dy/=n;
  const c=w*w-z*z,s=2*w*z;
  return [c*point[0]-s*point[1]+2*(dx*w-dy*z),s*point[0]+c*point[1]+2*(dy*w+dx*z)];
}

function affinePoint(point,source,target){
  const [a,b]=source,[c,d]=target,u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]];
  const sl=Math.hypot(...u),tl=Math.hypot(...v),q=[point[0]-a[0],point[1]-a[1]];
  const along=(q[0]*u[0]+q[1]*u[1])/(sl*sl),across=(-q[0]*u[1]+q[1]*u[0])/sl;
  return [c[0]+v[0]*along-v[1]/tl*across,c[1]+v[1]*along+v[0]/tl*across];
}

export function deformPart(part,pose,rig){
  let deform;
  if(part.kind==='chain'){
    const [side,kind]=part.name.split('_');
    const chain=kind==='leg'?['hip','knee','ankle','toe'].map(k=>pose.legs[side][k]):
      ['shoulder','elbow','wrist','grip'].map(k=>pose.arms[side][k]);
    const bones=part.bind.slice(0,-1).map((a,i)=>transform(a,part.bind[i+1],chain[i],chain[i+1]));
    deform=vertex=>dualQuaternionPoint(vertex.position,vertex.weights,bones);
  }else if(part.kind==='ear'){
    const root=part.bind[0],tip=part.bind[2],delta=[pose.head[0]-306,pose.head[1]-196];
    const angle=sampleCurve(rig.ear_curves[part.name==='right_ear'?'near':'far'],pose.phase);
    const axis=[tip[0]-root[0],tip[1]-root[1]],length2=axis[0]**2+axis[1]**2;
    deform=vertex=>{
      const rel=[vertex.position[0]-root[0],vertex.position[1]-root[1]];
      const t=Math.max(0,Math.min(1,(rel[0]*axis[0]+rel[1]*axis[1])/length2));
      return add(add(root,delta),rotate(rel,angle*(.45+.55*t)));
    };
  }else{
    let target;
    if(['torso_coat','pelvis','tail'].includes(part.name))target=[pose.root,pose.shoulder_root];
    else if(part.name==='head')target=[pose.head,add(pose.head,[21,0])];
    else if(part.name==='watch')target=[pose.watch.center,add(pose.watch.center,rotate([27,0],-pose.watch.lag_degrees))];
    else if(part.name==='watch_bow')target=[pose.arms.right.grip,add(pose.watch.center,rotate([0,-21],-pose.watch.lag_degrees))];
    else throw Error(`Unknown rig part ${part.name}`);
    deform=vertex=>affinePoint(vertex.position,part.bind,target);
  }
  const positions=part.vertices.map(deform);
  if(part.kind==='chain')preserveJointSurface(part,positions);
  return positions;
}

// A local tissue constraint prevents the inner ankle from turning triangles
// inside out under deep flexion. Rigid foot/paw vertices are pinned; corrections
// are confined to the blended joint surface, not the skeleton or world root.
const constraintsByPart=new WeakMap();
function preserveJointSurface(part,positions){
  if(!constraintsByPart.has(part)){
    const mobility=part.vertices.map(v=>1-Math.max(...v.weights)),constraints=[];
    for(let i=0;i<part.triangles.length;i+=3){
      const ids=part.triangles.slice(i,i+3);
      if(!ids.some(id=>mobility[id]>.001))continue;
      const [a,b,c]=ids.map(id=>part.vertices[id].position);
      constraints.push({ids,mass:ids.map(id=>mobility[id]),rest:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])});
    }
    constraintsByPart.set(part,constraints);
  }
  const constraints=constraintsByPart.get(part);
  for(let iteration=0;iteration<100;iteration++){
    let worst=0;
    for(const {ids,mass,rest} of constraints){
      const [a,b,c]=ids.map(id=>positions[id]);
      const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const constraint=area-rest*.12;
      if(constraint>=0)continue;
      worst=Math.max(worst,-constraint);
      const gradients=[[b[1]-c[1],c[0]-b[0]],[c[1]-a[1],a[0]-c[0]],[a[1]-b[1],b[0]-a[0]]];
      const denominator=gradients.reduce((sum,g,k)=>sum+mass[k]*(g[0]*g[0]+g[1]*g[1]),0);
      if(denominator<1e-10)continue;
      for(let k=0;k<3;k++){
        const strength=-constraint/denominator*mass[k];
        positions[ids[k]][0]+=gradients[k][0]*strength;
        positions[ids[k]][1]+=gradients[k][1]*strength;
      }
    }
    if(worst<.001)break;
  }
}

export function meshDiagnostics(part,positions){
  const area=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let flipped=0,collapsed=0,minRatio=Infinity,maxStretch=0;
  for(let i=0;i<part.triangles.length;i+=3){
    const ids=part.triangles.slice(i,i+3),before=area(...ids.map(i=>part.vertices[i].position));
    const after=area(...ids.map(i=>positions[i])),ratio=after/before;
    if(ratio<0)flipped++;if(Math.abs(ratio)<.05)collapsed++;minRatio=Math.min(minRatio,ratio);
    for(let j=0;j<3;j++){
      const a=ids[j],b=ids[(j+1)%3],u=part.vertices[a].position,v=part.vertices[b].position;
      const source=Math.hypot(u[0]-v[0],u[1]-v[1]);
      maxStretch=Math.max(maxStretch,Math.hypot(positions[a][0]-positions[b][0],positions[a][1]-positions[b][1])/source);
    }
  }
  return {name:part.name,flipped,collapsed,min_area_ratio:minRatio,max_edge_stretch:maxStretch};
}
