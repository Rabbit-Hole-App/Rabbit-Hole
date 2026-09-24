import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {evaluatePose,RunMotion} from './motion.mjs';
import {deformPart,meshDiagnostics} from './skinning.mjs';

const root=new URL('./',import.meta.url);
const rig=JSON.parse(fs.readFileSync(new URL('rig.json',root)));
const fixture=JSON.parse(fs.readFileSync(new URL('qa/guide-fixture.json',root)));
let maxError=0,boneError=0,anchorError=0;
function compare(actual,expected){
  if(typeof expected==='number'){maxError=Math.max(maxError,Math.abs(actual-expected));assert.ok(Math.abs(actual-expected)<1e-7);}
  else if(typeof expected==='object')for(const key of Object.keys(expected))compare(actual[key],expected[key]);
  else assert.equal(actual,expected);
}
for(const expected of fixture){
  const pose=evaluatePose(expected.phase,rig);compare(pose,expected);
  for(const side of ['left','right']){
    const leg=pose.legs[side],arm=pose.arms[side];
    for(const [a,b,length] of [[leg.hip,leg.knee,rig.dimensions.upper_leg],[leg.knee,leg.ankle,rig.dimensions.lower_leg],
      [arm.shoulder,arm.elbow,rig.dimensions.upper_arm],[arm.elbow,arm.wrist,rig.dimensions.forearm]]){
      boneError=Math.max(boneError,Math.abs(Math.hypot(...a.map((x,i)=>x-b[i]))-length));
    }
    assert.equal(pose.watch.hand,'right');assert.deepEqual(pose.watch.grip,pose.arms.right.grip);
  }
}
for(const tangent of [[1,0],[0,1],[Math.SQRT1_2,Math.SQRT1_2]]){
  const normal=[tangent[1],-tangent[0]],motion=new RunMotion(rig);let distance=0;
  const anchors=new Map();
  for(let i=0;i<720;i++){
    const speed=i<240?624:i<480?936:780,dt=[1/60,1/144,1/30,.008][i%4];distance+=speed*dt;
    const position=[100+distance*tangent[0],500+distance*tangent[1]],before=[...position];
    const state=motion.sample({position,travelledDistance:distance,tangent,normal});
    assert.deepEqual(position,before);
    for(const [side,contact] of Object.entries(state.contacts))if(contact){
      const key=`${side}-${contact.episode}`,previous=anchors.get(key)||contact.anchor;anchors.set(key,previous);
      anchorError=Math.max(anchorError,Math.hypot(...contact.toe.map((x,i)=>x-previous[i])));
    }
  }
}
assert.ok(anchorError<1e-6);assert.ok(boneError<1e-7);
compare(evaluatePose(8,rig),evaluatePose(0,rig));
const worst={},stretch={};
for(let i=0;i<160;i++){
  const pose=evaluatePose(i/20,rig);
  for(const part of rig.parts){
    const positions=deformPart(part,pose,rig);assert.ok(positions.flat().every(Number.isFinite));
    const diagnostic=meshDiagnostics(part,positions);
    assert.equal(diagnostic.flipped,0,`${part.name} inverted surface at phase ${i/20}`);
    assert.equal(diagnostic.collapsed,0,`${part.name} collapsed surface at phase ${i/20}`);
    if(!worst[part.name]||diagnostic.min_area_ratio<worst[part.name].min_area_ratio)worst[part.name]={phase:i/20,...diagnostic};
    if(!stretch[part.name]||diagnostic.max_edge_stretch>stretch[part.name].max_edge_stretch)
      stretch[part.name]={phase:i/20,max_edge_stretch:diagnostic.max_edge_stretch};
  }
}
// The solver must close as a surface too, not merely as joint coordinates.
let seamError=0;
for(const part of rig.parts){
  const a=deformPart(part,evaluatePose(0,rig),rig),b=deformPart(part,evaluatePose(8,rig),rig);
  a.forEach((p,i)=>p.forEach((v,k)=>{seamError=Math.max(seamError,Math.abs(v-b[i][k]));}));
}
assert.ok(seamError<1e-8);
for(const [filename,expected] of Object.entries(rig.source_sha256))
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+filename,root))).digest('hex'),expected);
const report={tested_at:new Date().toISOString(),approved_guide_samples:fixture.length,max_guide_error:maxError,
  max_bone_error:boneError,max_world_anchor_error:anchorError,unchanged_inputs:Object.keys(rig.source_sha256).length,
  worst_mesh_diagnostics:worst,worst_surface_stretch:stretch,max_surface_seam_error:seamError,
  mathematical_checks_pass:true,visual_gate:'failed: pinched recovery ankles',visual_approval:false};
fs.writeFileSync(new URL('qa/motion-verification.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
