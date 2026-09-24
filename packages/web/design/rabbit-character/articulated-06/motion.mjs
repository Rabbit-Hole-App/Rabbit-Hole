// Exact port of the approved guide; animation never assigns physics position.
export const mod = (n,m) => ((n%m)+m)%m;
const rad = Math.PI/180;
export const add = (a,b) => a.map((v,i)=>v+(b[i]||0));
const polar = (length,degrees) => [length*Math.sin(degrees*rad),length*Math.cos(degrees*rad),0];
export const rotate = ([x,y],degrees) => [x*Math.cos(degrees*rad)-y*Math.sin(degrees*rad),x*Math.sin(degrees*rad)+y*Math.cos(degrees*rad)];
const hermite=(a,b,va,vb,t,span=1)=>(2*t**3-3*t*t+1)*a+(t**3-2*t*t+t)*va*span+(-2*t**3+3*t*t)*b+(t**3-t*t)*vb*span;
function periodic(values,phase){
  const p=mod(phase,values.length),i=Math.floor(p),n=values.length;
  return hermite(values[i],values[(i+1)%n],(values[(i+1)%n]-values[mod(i-1,n)])/2,
    (values[(i+2)%n]-values[i])/2,p-i);
}
export function sampleCurve(values,phase){
  const p=mod(phase,8)/8*values.length,i=Math.floor(p),t=p-i;
  return values[i]*(1-t)+values[(i+1)%values.length]*t;
}
export function solveKnee(hip,ankle,d){
  const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],distance=Math.hypot(dx,dy);
  const upper=d.upper_leg,lower=d.lower_leg;
  if(distance>=upper+lower||distance<=Math.abs(upper-lower))throw Error('Unreachable support ankle');
  const along=(upper**2-lower**2+distance**2)/(2*distance),normal=Math.sqrt(upper**2-along**2);
  return [hip[0]+along*dx/distance+normal*dy/distance,hip[1]+along*dy/distance-normal*dx/distance,hip[2]];
}
function stance(p,d){
  const t=Math.max(0,Math.min(1,(p-1)/1.5)),angle=55*(3*t*t-2*t*t*t);
  const [dx,dy]=rotate([d.foot_length-16,15],angle);
  return {ankle:[356-60*p-dx,480-dy],angle};
}
export function evaluatePose(phase,rig){
  const p=mod(phase,8),d=rig.dimensions,root=[256,periodic([356,371,358,348],p),0];
  const lean=periodic([12,13,11,12],p),shoulder_root=add(root,polar(d.torso_length,180-lean));
  const hip_yaw=-6*Math.cos(p*Math.PI/4),shoulder_yaw=8*Math.cos(p*Math.PI/4);
  const result={phase:p,root,shoulder_root,head:add(shoulder_root,[14,-45,0]),lean_degrees:lean,
    hip_yaw_degrees:hip_yaw,shoulder_yaw_degrees:shoulder_yaw,legs:{},arms:{}};
  const swStart=stance(2.5,d),swEnd=stance(0,d);
  const swing=[[2.5,...swStart.ankle,55],[3,160,410,5],[4,161,394,-35],[5,176,401,-15],
    [6,211,426,-8],[7,308,425,-12],[8,...swEnd.ankle,0]];
  function swingValue(local,component){
    const tangent=i=>i===0||i===swing.length-1?(component===1?-60:0):
      (swing[i+1][component]-swing[i-1][component])/(swing[i+1][0]-swing[i-1][0]);
    const i=swing.findIndex((_,i)=>i<swing.length-1&&local<=swing[i+1][0]);
    const a=swing[i],b=swing[i+1],span=b[0]-a[0];
    return hermite(a[component],b[component],tangent(i),tangent(i+1),(local-a[0])/span,span);
  }
  for(const [side,sign] of [['left',-1],['right',1]]){
    const hip=add(root,[sign*d.hip_width/2*Math.sin(hip_yaw*rad),0,sign*d.hip_width/2*Math.cos(hip_yaw*rad)]);
    const local=mod(p+(side==='left'?0:4),8),support=local<=2.5;
    const s=support?stance(local,d):{ankle:[swingValue(local,1),swingValue(local,2)],angle:swingValue(local,3)};
    const ankle=[...s.ankle,hip[2]],angle=s.angle;
    result.legs[side]={hip,knee:solveKnee(hip,ankle,d),ankle,
      heel:add(ankle,[...rotate([-16,15],angle),0]),toe:add(ankle,[...rotate([d.foot_length-16,15],angle),0]),
      support,foot_angle_degrees:angle,local_phase:local};
    const shoulder=add(shoulder_root,[sign*d.shoulder_width/2*Math.sin(shoulder_yaw*rad),0,sign*d.shoulder_width/2*Math.cos(shoulder_yaw*rad)]);
    const counter=Math.cos((p+(side==='right'?0:4))*Math.PI/4),upper=-16.5+41.5*counter;
    const elbow_angle=side==='right'?110-20*counter:103-25*counter,fore=upper+180-elbow_angle;
    const elbow=add(shoulder,polar(d.upper_arm,upper)),wrist=add(elbow,polar(d.forearm,fore));
    result.arms[side]={shoulder,elbow,wrist,grip:add(wrist,polar(d.hand,fore-8)),elbow_angle_degrees:elbow_angle};
  }
  const angle=sampleCurve(rig.watch_curve,p),grip=result.arms.right.grip;
  result.watch={hand:'right',grip,center:add(grip,[d.watch_grip_to_center*Math.sin(angle),d.watch_grip_to_center*Math.cos(angle),0]),
    diameter:d.watch_diameter,lag_degrees:angle/rad};
  return result;
}

// Position, distance and surface basis belong to the caller. Facing/art selection
// is separate; this view does not imply that other directions may be mirrored.
export class RunMotion {
  constructor(rig){this.rig=rig;this.reset();}
  reset(){this.distance=0;this.anchors={left:null,right:null};this.episodes={left:null,right:null};}
  sample({position,travelledDistance,tangent=[1,0],normal=[0,-1]}){
    if(travelledDistance<0)throw Error('run_right requires nonnegative travelled distance');
    this.distance=travelledDistance;
    const phase=travelledDistance/60,pose=evaluatePose(phase,this.rig);
    const world=point=>[position[0]+(point[0]-256)*tangent[0]+(480-point[1])*normal[0],
                        position[1]+(point[0]-256)*tangent[1]+(480-point[1])*normal[1]];
    const contacts={};
    for(const side of ['left','right']){
      const leg=pose.legs[side],offset=side==='left'?0:4,episode=Math.floor((phase+offset)/8);
      if(leg.support){
        if(this.episodes[side]!==episode||!this.anchors[side]){
          this.anchors[side]=world(leg.toe);this.episodes[side]=episode;
        }
        // Solve the visual leg back to the immutable world contact, not a frozen
        // full-character transform. At consistent distance input this is zero.
        const [ax,ay]=this.anchors[side],dx=ax-position[0],dy=ay-position[1];
        const toe=[256+dx*tangent[0]+dy*tangent[1],480-dx*normal[0]-dy*normal[1],leg.toe[2]];
        const delta=[toe[0]-leg.toe[0],toe[1]-leg.toe[1],0];
        leg.toe=toe;leg.ankle=add(leg.ankle,delta);leg.heel=add(leg.heel,delta);
        leg.knee=solveKnee(leg.hip,leg.ankle,this.rig.dimensions);
        contacts[side]={anchor:[ax,ay],toe:world(leg.toe),episode,correction:delta.slice(0,2)};
      }else {this.anchors[side]=null;contacts[side]=null;}
    }
    return {pose,contacts,physics:{position:[...position],travelledDistance},visualRootOffset:[0,0],world};
  }
}
