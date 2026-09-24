import {smooth} from './controller.js';
const rotate=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];

export function livingPose(sample,rig,{still=false}={}){
  const breath=still?0:(1-Math.cos(sample.time*Math.PI*2/3.6))*.5;
  const check=sample.state==='idle_watch_check'?sample.gesture:0;
  const glance=sample.state==='idle_look_right'?sample.gesture:0;
  const body=p=>{
    const upper=1-smooth((p[1]-385)/78);
    const chest=Math.exp(-(((p[1]-280)/78)**2));
    return [p[0]+sample.crouch*12*upper+(p[0]-257)*breath*.014*chest,p[1]+sample.crouch*42*upper-breath*3*upper];
  };
  const j=rig.joints,shoulder=body(j.shoulder),upperAngle=-check*.55,foreAngle=-check*1.62;
  const elbow=add(shoulder,rotate(sub(j.elbow,j.shoulder),upperAngle));
  const wrist=add(elbow,rotate(sub(j.wrist,j.elbow),foreAngle));
  const grip=add(wrist,rotate(sub(j.grip,j.wrist),foreAngle));
  const watchLag=check*.065*Math.sin(sample.time*3),watch=add(grip,rotate(sub(j.watch,j.grip),watchLag));
  return {body,shoulder,elbow,wrist,grip,watch,upperAngle,foreAngle,watchLag,
    headAngle:check*.28-glance*.13,neck:body(j.neck),breath,crouch:sample.crouch,time:sample.time,still};
}

export function deformLiving(part,pose,rig){
  const j=rig.joints;
  function head(p){return add(pose.neck,rotate(sub(p,j.neck),pose.headAngle));}
  return part.vertices.map(({position:p})=>{
    if(part.name==='body')return pose.body(p);
    if(part.name==='head')return head(p);
    if(part.name.startsWith('ear')){
      const lag=pose.still?0:.018*Math.sin(pose.time*2*Math.PI/3.6-.6)+(part.name==='ear_near'?.008:-.008)*Math.sin(pose.time*1.7);
      const t=1-smooth((p[1]-60)/105),angle=lag+pose.crouch*.30;
      return head(add(j.ear_root,rotate(sub(p,j.ear_root),angle*(.4+.6*t))));
    }
    if(part.name==='watch')return add(pose.watch,rotate(sub(p,j.watch),pose.watchLag));
    if(part.name==='bow')return add(pose.grip,rotate(sub(p,j.grip),pose.watchLag));
    if(part.name==='arm'){
      const upper=add(pose.shoulder,rotate(sub(p,j.shoulder),pose.upperAngle));
      const lower=add(pose.elbow,rotate(sub(p,j.elbow),pose.foreAngle));
      const weight=smooth((p[1]-j.elbow[1]+7)/14);
      return upper.map((v,i)=>v+(lower[i]-v)*weight);
    }
    throw Error('Unknown living attachment '+part.name);
  });
}
