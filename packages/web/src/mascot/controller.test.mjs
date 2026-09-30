import test from 'node:test';
import assert from 'node:assert/strict';
import {MascotController,portalPose} from './controller.js';

test('the same timeline enters the upper opening down and the lower opening up',()=>{
  const m=new MascotController();
  assert.ok(m.portals.A.y<m.portals.B.y);
  for(const [direction,from,to] of [[1,'A','B'],[-1,'B','A']]){
    const sample=q=>portalPose(direction>0?q:1-q,direction,m.portals);
    const phases=[[.12,'approach_portal'],[.22,'turn_to_portal'],[.28,'portal_crouch'],[.38,'portal_enter'],[.5,'portal_hidden'],[.62,'portal_exit'],[.72,'recover_from_portal'],[.78,'turn_from_portal'],[.87,'depart_portal'],[1,'idle_breathe']];
    for(const [q,state] of phases)assert.equal(sample(q).state,state);
    assert.equal(sample(.38).portal,from);assert.equal(sample(.62).portal,to);
    assert.equal(sample(.38).yaw,4);assert.equal(sample(.62).yaw,0);
    assert.equal(sample(.5).hidden,true);assert.equal(sample(1).hidden,false);
  }
});
test('mid-transition reversal keeps the spatial anchor, scale depth and compression continuous',()=>{
  const m=new MascotController();
  for(let i=0;i<=1000;i++){
    const p=i/1000,down=portalPose(p,1,m.portals),up=portalPose(p,-1,m.portals);
    assert.equal(down.hidden,up.hidden);
    if(!down.hidden){
      assert.ok(Math.abs(down.position.x-up.position.x)<1e-10,`x at ${p}`);
      assert.ok(Math.abs(down.position.y-up.position.y)<1e-10,`y at ${p}`);
      assert.ok(Math.abs(down.depth-up.depth)<1e-10,`depth at ${p}`);
      assert.ok(Math.abs(down.crouch-up.crouch)<1e-10,`crouch at ${p}`);
    }
  }
});
test('elapsed time cannot complete a scroll transition; reversing does not reset it',()=>{
  const m=new MascotController();m.setProgress(.38);
  for(let i=0;i<600;i++)m.tick(1/60);
  assert.equal(m.progress,.38);const before=m.snapshot();
  m.setProgress(.379);const reversed=m.tick(1/60);
  assert.equal(reversed.state,'portal_exit');assert.equal(reversed.portal,'A');
  assert.ok(Math.abs(before.depth-reversed.depth)<.02);
  assert.deepEqual(reversed.position,before.position);
  assert.ok(Math.abs(reversed.yaw-before.yaw)<.24,'facing moves through authored views');
});
test('entry uses a fixed page center and perpendicular normal, not a floor or lateral sink',()=>{
  const m=new MascotController();
  for(const p of [.31,.36,.40,.44]){
    const sample=portalPose(p,1,m.portals);
    assert.deepEqual(sample.position,{x:m.portals.A.x,y:m.portals.A.y});
    assert.deepEqual(m.portals.A.normal,[0,0,1]);
  }
});
test('moving either opening updates both directions, including during a hidden transfer',()=>{
  const m=new MascotController();m.setProgress(.5);
  assert.equal(m.movePortal('A',.25,.26),true);assert.equal(m.movePortal('B',.74,.75),true);
  assert.deepEqual(portalPose(.38,1,m.portals).position,{x:.25,y:.26});
  assert.deepEqual(portalPose(.62,-1,m.portals).position,{x:.74,y:.75});
  assert.equal(m.movePortal('B',.25,.26),false);assert.equal(m.movePortal('A',NaN,.2),false);
});
test('pause holds the pose and reduced motion shows a visible front-facing destination',()=>{
  const m=new MascotController();m.setProgress(.38);m.tick(.02);
  const before=m.snapshot();for(let i=0;i<90;i++)m.tick(.02,{paused:true});assert.deepEqual(m.snapshot(),before);
  for(const [p,id] of [[.38,'A'],[.62,'B']]){
    m.setProgress(p);const s=m.tick(.02,{reduced:true});
    assert.equal(s.hidden,false);assert.equal(s.depth,0);assert.equal(s.yaw,0);assert.equal(s.state,'idle_breathe');
    assert.ok(Math.abs(s.position.y-m.portals[id].y)<.1);
  }
});
test('living actions remain available at both resting locations and settle to breathing',()=>{
  for(const p of [0,1])for(const action of ['idle_look_left','idle_look_right','idle_watch_check','crouch']){
    const m=new MascotController();m.setProgress(p);assert.equal(m.action(action),true);let maximum=0;
    for(let i=0;i<240;i++)maximum=Math.max(maximum,m.tick(1/60).gesture);
    assert.ok(maximum>.99);assert.equal(m.state,'idle_breathe');
  }
  const m=new MascotController();m.setProgress(.4);assert.equal(m.action('idle_watch_check'),false);
});
