// These deterministic previews illustrate the product; they never call a model,
// upload sources, submit answers, or persist learner data.
const walkthrough=document.querySelector('[data-feature-walkthrough]');
const steps=[...walkthrough.querySelectorAll('[data-feature-step]')];
const compact=matchMedia('(max-width: 800px)');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const copies=steps.map(step=>step.querySelector('.feature-step-copy'));
const demos=steps.map(step=>step.querySelector('.feature-demo'));
const contents=demos.map(demo=>demo.querySelector('.demo-content'));
const clamp=value=>Math.max(0,Math.min(1,value));
const mix=(a,b,t)=>a+(b-a)*t;
const slots=[{x:0,y:0,scale:1},{x:12,y:-26,scale:.975},{x:24,y:-52,scale:.95},{x:32,y:-65,scale:.935}];
let queued=false;

function pose(index,slot,opacity,z){
  const card=index%steps.length,demo=demos[card];
  contents[card].style.opacity='1';
  demo.style.transform=`translate(${slot.x.toFixed(3)}px,${slot.y.toFixed(3)}px) scale(${slot.scale.toFixed(5)})`;
  demo.style.opacity=String(opacity);
  demo.style.visibility=opacity>0?'visible':'hidden';
  demo.style.zIndex=String(z);
}
function between(from,to,progress){
  return {x:mix(from.x,to.x,progress),y:mix(from.y,to.y,progress),scale:mix(from.scale,to.scale,progress)};
}
function deck(front){
  demos.forEach((_,index)=>pose(index,slots[3],0,0));
  pose(front,slots[0],1,4);
  pose(front+1,slots[1],1,3);
  pose(front+3,slots[2],1,2);
}
function shuffle(front,progress){
  // The front card slips out, passes behind at zero opacity, then joins the
  // back. These poses depend only on scroll position, including on reversal.
  const travel={x:-Math.min(42,demos[front].offsetWidth*.065),y:10,scale:.98};
  const incoming=clamp(progress/.8);
  pose(front+1,between(slots[1],slots[0],incoming),1,3);
  pose(front+2,between(slots[3],slots[1],progress),clamp((progress-.2)/.5),2);
  pose(front+3,between(slots[2],slots[3],progress),1-clamp(progress/.4),1);
  if(progress<.45){
    const depart=progress/.45;
    pose(front,between(slots[0],travel,depart),1-depart,4);
  }else{
    const returnToBack=clamp((progress-.45)/.55);
    pose(front,between({...slots[2],x:slots[2].x+14},slots[2],returnToBack),returnToBack,1);
  }
  // Reveal the new text only after the old text has passed behind. Otherwise
  // a paused mid-shuffle scroll would leave two explanations superimposed.
  contents[(front+1)%steps.length].style.opacity=String(clamp((progress-.45)/.35));
}

function update(){
  queued=false;
  const middle=innerHeight*.5;
  if(compact.matches){
    demos.forEach(demo=>['transform','opacity','visibility','z-index'].forEach(property=>demo.style.removeProperty(property)));
    contents.forEach(content=>content.style.removeProperty('opacity'));
  }
  const anchors=compact.matches ? demos : copies;
  const rects=anchors.map(anchor=>anchor.getBoundingClientRect());
  let selected=0,nearest=Infinity;
  rects.forEach((rect,index)=>{
    const distance=Math.abs(rect.top+rect.height/2-middle);
    if(distance<nearest){nearest=distance;selected=index;}
  });
  let moving=false;
  walkthrough.classList.toggle('is-deck',!compact.matches);
  if(compact.matches){
    walkthrough.removeAttribute('data-shuffle');
  }else if(reduced.matches){
    deck(selected);
    walkthrough.dataset.shuffle='0';
  }else{
    const centers=rects.map(rect=>rect.top+rect.height/2);
    let front=0;
    while(front<steps.length-2&&middle>centers[front+1])front++;
    const chapter=clamp((middle-centers[front])/(centers[front+1]-centers[front]));
    // Hold the reading pose across most of a chapter. Only the middle third
    // of the distance to the next chapter moves the deck.
    const progress=clamp((chapter-.34)/.32);
    if(progress===0)deck(front);
    else if(progress===1)deck(front+1);
    else{shuffle(front,progress);moving=true;}
    walkthrough.dataset.shuffle=progress.toFixed(4);
  }
  walkthrough.classList.toggle('is-shuffling',moving);
  steps.forEach((step,index)=>{
    step.classList.toggle('is-active',index===selected);
    const rect=demos[index].getBoundingClientRect();
    const visible=rect.bottom>120&&rect.top<innerHeight-60;
    step.classList.toggle('is-running',index===selected&&visible&&!moving&&!document.hidden&&!reduced.matches);
  });
  walkthrough.dataset.activeStep=String(selected+1);
}
function schedule(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(update);
}
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',schedule);
document.addEventListener('visibilitychange',update);
compact.addEventListener('change',schedule);
reduced.addEventListener('change',schedule);
new ResizeObserver(schedule).observe(walkthrough);
document.fonts.ready.then(schedule);
update();
