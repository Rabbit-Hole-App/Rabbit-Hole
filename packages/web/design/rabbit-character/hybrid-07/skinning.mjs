import {deformPart as originalDeform} from '../articulated-06/skinning.mjs';

function rigid(point,origin,angle){
  const c=Math.cos(angle),s=Math.sin(angle);
  return [origin[0]+point[0]*c-point[1]*s,origin[1]+point[0]*s+point[1]*c];
}
export function correctiveWeights(leg,rig){
  return Object.fromEntries(Object.entries(rig.correction_shapes).map(([name,shape])=>{
    const delta=Math.abs(leg.local_phase-shape.phase),d=Math.min(delta,8-delta)/shape.width;
    return [name,d>=1?0:(1-d*d)**2];
  }));
}
export function deformPart(part,pose,rig){
  if(part.kind==='leg-section'){
    const leg=pose.legs[part.side];let origin,angle;
    if(part.section==='foot'){origin=leg.ankle;angle=leg.foot_angle_degrees*Math.PI/180;}
    else{
      const [a,b]=part.section==='thigh'?[leg.hip,leg.knee]:[leg.knee,leg.ankle];
      origin=a;angle=Math.atan2(b[1]-a[1],b[0]-a[0])-Math.PI/2;
    }
    return part.vertices.map(v=>rigid(v.position,origin,angle));
  }
  if(part.kind==='joint-skin'){
    const leg=pose.legs[part.side],joint=leg[part.joint],weights=correctiveWeights(leg,rig);
    const radius=[...part.radius];
    for(const [name,weight] of Object.entries(weights)){
      const delta=rig.correction_shapes[name][part.joint+'_radius_delta'];
      radius[0]+=delta[0]*weight;radius[1]+=delta[1]*weight;
    }
    // Corrections are bounded to 1-2 px on a small overlap surface. The shin,
    // thigh and complete foot never enter this operation.
    const direction=part.joint==='knee'?[leg.knee[0]-leg.hip[0],leg.knee[1]-leg.hip[1]]:
      [leg.ankle[0]-leg.knee[0],leg.ankle[1]-leg.knee[1]];
    const angle=Math.atan2(direction[1],direction[0])-Math.PI/2;
    return part.vertices.map(v=>rigid(v.position.map((x,i)=>x*radius[i]/part.radius[i]),joint,angle));
  }
  return originalDeform(part,pose,rig);
}

export function sectionOutline(part,pose){
  return deformPart({...part,vertices:part.outline.map(position=>({position}))},pose,{});
}
