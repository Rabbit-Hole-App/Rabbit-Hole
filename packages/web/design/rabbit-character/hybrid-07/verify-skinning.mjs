import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {evaluatePose,RunMotion} from '../articulated-06/motion.mjs';
import {deformPart as oldDeform,meshDiagnostics} from '../articulated-06/skinning.mjs';

const root=new URL('./',import.meta.url);
const previous=JSON.parse(fs.readFileSync(new URL('../articulated-06/rig.json',root)));
const damaged=previous.parts.find(p=>p.name==='left_leg');
const before=meshDiagnostics(damaged,oldDeform(damaged,evaluatePose(4.25,previous),previous));
assert.ok(before.max_edge_stretch>5,'Regression fixture must expose the old ankle stretch');
console.log('Reproduced candidate 06 ankle stretch:',before.max_edge_stretch);

const rig=JSON.parse(fs.readFileSync(new URL('rig.json',root)));
const {deformPart}=await import('./skinning.mjs');
let sectionError=0,anchorError=0,seamError=0,minKnee=Infinity,minAnkle=Infinity,maxAnkle=0;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
for(let i=0;i<800;i++){
  const pose=evaluatePose(i/100,rig);
  assert.deepEqual(pose,evaluatePose(i/100,previous),'Skinning must not change the motion');
  for(const side of ['left','right']){
    const l=pose.legs[side],u=[l.knee[0]-l.hip[0],l.knee[1]-l.hip[1]],v=[l.ankle[0]-l.knee[0],l.ankle[1]-l.knee[1]];
    const cross=u[0]*v[1]-u[1]*v[0];assert.ok(cross>0,'Knee branch must never invert');minKnee=Math.min(minKnee,cross);
    const f=[l.toe[0]-l.ankle[0],l.toe[1]-l.ankle[1]];
    const angle=Math.acos(Math.max(-1,Math.min(1,(-v[0]*f[0]-v[1]*f[1])/Math.hypot(...v)/Math.hypot(...f))))*180/Math.PI;
    minAnkle=Math.min(minAnkle,angle);maxAnkle=Math.max(maxAnkle,angle);
  }
  for(const part of rig.parts.filter(p=>p.kind==='leg-section')){
    const points=deformPart(part,pose,rig);
    for(let j=0;j<points.length;j+=3){
      const k=(j+17)%points.length;
      sectionError=Math.max(sectionError,Math.abs(distance(points[j],points[k])-distance(part.vertices[j].position,part.vertices[k].position)));
    }
  }
}
assert.ok(sectionError<1e-7,'An anatomical section stretched');
for(const p of rig.parts){
  const a=deformPart(p,evaluatePose(0,rig),rig),b=deformPart(p,evaluatePose(8,rig),rig);
  a.forEach((x,i)=>{seamError=Math.max(seamError,distance(x,b[i]));});
}
assert.ok(seamError<1e-7);
for(const tangent of [[1,0],[0,1],[Math.SQRT1_2,Math.SQRT1_2]]){
  const motion=new RunMotion(rig),normal=[tangent[1],-tangent[0]],anchors=new Map();let d=0;
  for(let i=0;i<600;i++){
    d+=[624,780,936][Math.floor(i/200)]*[1/60,1/144,1/30,.008][i%4];
    const state=motion.sample({position:[d*tangent[0],d*tangent[1]],travelledDistance:d,tangent,normal});
    for(const [side,c] of Object.entries(state.contacts))if(c){
      const key=`${side}/${c.episode}`,a=anchors.get(key)||c.anchor;anchors.set(key,a);
      anchorError=Math.max(anchorError,distance(a,c.toe));
    }
  }
}
assert.ok(anchorError<1e-7);
for(const [name,hash] of Object.entries(rig.source_sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+name,root))).digest('hex'),hash);
const report={tested_at:new Date().toISOString(),guide_samples:800,old_ankle_max_edge_stretch:before.max_edge_stretch,
  max_rigid_section_distance_error:sectionError,max_world_anchor_error:anchorError,max_surface_seam_error:seamError,
  min_positive_knee_cross:minKnee,approved_ankle_angle_range:[minAnkle,maxAnkle],unchanged_inputs:Object.keys(rig.source_sha256).length,
  technical_checks_pass:true,visual_approval:false};
fs.mkdirSync(new URL('qa/',root),{recursive:true});fs.writeFileSync(new URL('qa/skinning-verification.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
