
const $=id=>document.getElementById(id);let accepted=false,editing=false,busy=false,timer,savedDraft='',editDraft='';
const depthNames=['Overview','Standard','Deep'];
const baseSteps=[['How a split is chosen','Compare candidate splits using impurity reduction.','Explanation'],['Why a forest reduces variance','See how combining different trees stabilizes predictions.','Interactive visual'],['Read feature importance carefully','Recognize common biases and avoid causal conclusions.','Explanation']];
function getSteps(){let steps=baseSteps.map(x=>[...x]);if($('depth').value==='0')steps=steps.map((s,i)=>[s[0],['Recognize what a useful split does.','Understand why combining trees helps.','Know what importance can and cannot tell you.'][i],s[2]]);if($('depth').value==='2')steps.splice(1,0,['Calculate impurity reduction','Work through a weighted Gini impurity example.','Worked example']);if($('mode').value==='practice'){const out=[];for(const s of steps){out.push(s);out.push(['Practice: '+s[0].charAt(0).toLowerCase()+s[0].slice(1),'Check your reasoning with a short question and feedback.','Practice']);}steps=out;}return steps;}
function paintSteps(target){$(target).replaceChildren(...getSteps().map(s=>{const li=document.createElement('li'),body=document.createElement('div');for(const [name,text]of [['step-title',s[0]],['step-description',s[1]],['format',s[2]]]){const el=document.createElement('div');el.className=name;el.textContent=text;body.append(el);}li.append(body);return li;}));}
function setBusy(value){busy=value;$('accept').disabled=value;for(const id of ['scope','depth','mode','edit','edit-accepted'])$(id).disabled=value;$('send').disabled=value||!$('input').value.trim();$('status').replaceChildren();if(value){const spin=document.createElement('span');spin.className='spinner';spin.setAttribute('aria-hidden','true');$('status').append(spin,document.createTextNode('Generating your roadmap'));}$('preview').style.opacity=value?'.45':'1';}
function revise(){clearTimeout(timer);setBusy(true);timer=setTimeout(()=>{paintSteps('steps');setBusy(false);},550);}
$('depth').addEventListener('input',()=>{const name=depthNames[$('depth').value];$('depth-value').value=name;$('depth').setAttribute('aria-valuetext',name);document.querySelectorAll('.depth-labels span').forEach((el,i)=>el.classList.toggle('chosen',i===Number($('depth').value)));revise();});$('mode').onchange=revise;
function beginEdit(){if(busy)return;if(!editing){savedDraft=$('input').value;$('input').value=editDraft;}editing=true;$('edit-pill').classList.remove('hidden');$('input').placeholder='What would you like to change?';$('send').disabled=!$('input').value.trim();$('input').focus();}
function exitEdit(){editDraft=$('input').value;$('input').value=savedDraft;editing=false;$('edit-pill').classList.add('hidden');$('input').placeholder='Message Tutor…';$('send').disabled=!$('input').value.trim();}
$('edit').onclick=beginEdit;$('edit-accepted').onclick=beginEdit;$('close-edit').onclick=exitEdit;
$('input').oninput=()=>{$('send').disabled=busy||!$('input').value.trim();};
$('composer').onsubmit=e=>{e.preventDefault();if(busy||!$('input').value.trim())return;if(!editing){$('input').value='';$('send').disabled=true;return;}const request=$('input').value.trim();exitEdit();editDraft='';accepted=false;$('parameters').classList.remove('hidden');$('draft-actions').classList.remove('hidden');$('accepted-actions').classList.add('hidden');$('draft-label').textContent='Roadmap draft';$('intro').textContent='Here’s your revised roadmap.';$('outcome').textContent=request;revise();};
$('accept').onclick=()=>{if(busy||accepted)return;accepted=true;$('draft-label').textContent='Roadmap';$('parameters').classList.add('hidden');$('draft-actions').classList.add('hidden');$('accepted-actions').classList.remove('hidden');$('intro').textContent='Your roadmap is ready. We’ll start with “How a split is chosen”.';window.renderAcceptedRoadmap();if(editing)exitEdit();};
function showPanel(toc){$('chat-pane').classList.toggle('hidden',toc);$('toc-pane').classList.toggle('hidden',!toc);document.querySelector('.tabs [title="Chat"]').classList.toggle('active',!toc);document.querySelector('.tabs [title="Table of contents"]').classList.toggle('active',toc);}
$('open-toc').onclick=()=>showPanel(true);document.querySelector('.tabs [title="Chat"]').onclick=()=>showPanel(false);document.querySelector('.tabs [title="Table of contents"]').onclick=()=>{if(accepted)showPanel(true);};paintSteps('steps');

// Reuse the approved 01-table-of-contents.html tree renderer and controls.
(()=>{
const arrow='<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
const check='<svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg>';
let counter=0;
const announce=text=>document.getElementById('announcement').textContent=text;
function makeEntry(item,number,level=1){
 const id='section-'+(++counter),li=document.createElement('li');
 const row=document.createElement('div');row.className='row';row.dataset.section=id;
 const label=document.createElement('label');label.className='check-wrap';label.title='Mark section done (manual)';
 const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label',item.title+' done');
 const circle=document.createElement('span');circle.className='circle';circle.setAttribute('aria-hidden','true');circle.innerHTML=check;label.append(input,circle);
 const n=document.createElement('span');n.className='number';n.textContent=number;
 const content=document.createElement('div');content.className='content';
 const title=document.createElement('button');title.className='title';title.type='button';title.textContent=item.title;title.title='Select section; double-click to edit';
 title.onclick=()=>{document.querySelectorAll('.row.current').forEach(r=>r.classList.remove('current'));row.classList.add('current');announce('Selected '+number+' '+title.textContent+'. In RH this navigates to its linked canvas content or proposal.');};
 title.ondblclick=()=>{title.contentEditable='true';title.focus();};
 title.onkeydown=event=>{if(title.isContentEditable&&event.key==='Enter'){event.preventDefault();title.blur();}};
 title.onblur=()=>title.contentEditable='false';
 const desc=document.createElement('p');desc.className='description';desc.textContent=item.description;
 content.append(title,desc);
 if(level===1){const state=document.createElement('div');state.className='state';state.textContent='Planned · '+(item.format||'Explanation');content.append(state);}
 row.append(label,n,content);li.append(row);
 if(item.children){
  const sub=document.createElement('ol');sub.className='children';sub.id=id+'-children';
  item.children.forEach((child,j)=>sub.append(makeEntry(child,number+'.'+(j+1),level+1)));
  const fold=document.createElement('button');fold.className='fold';fold.type='button';fold.setAttribute('aria-expanded','true');fold.setAttribute('aria-controls',sub.id);fold.setAttribute('aria-label','Collapse '+item.title);fold.innerHTML=arrow;
  fold.onclick=()=>{const open=fold.getAttribute('aria-expanded')==='true';fold.setAttribute('aria-expanded',String(!open));fold.setAttribute('aria-label',(open?'Expand ':'Collapse ')+item.title);sub.classList.toggle('hidden',open);};
  row.append(fold);li.append(sub);
 }
 return li;
}
const tree=document.getElementById('tree');window.renderAcceptedRoadmap=()=>{counter=0;tree.replaceChildren(...getSteps().map((s,i)=>makeEntry({title:s[0],description:s[1],format:s[2]},String(i+1))));};
document.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{
 const level=Number(button.dataset.add);
 const entry={title:level===1?'New section':level===2?'New sub-section':'New sub-sub-section',description:'Add a short description of what this section covers.'};
 if(level===1)tree.append(makeEntry(entry,String(tree.children.length+1)));
 else{let parent=tree.lastElementChild,sub=parent.querySelector(':scope > .children');if(!sub){sub=document.createElement('ol');sub.className='children';parent.append(sub);}if(level===3){let last=sub.lastElementChild;if(!last){last=makeEntry({title:'New sub-section',description:'What this part covers.'},tree.children.length+'.1',2);sub.append(last);}let nested=last.querySelector(':scope > .children');if(!nested){nested=document.createElement('ol');nested.className='children';last.append(nested);}nested.append(makeEntry(entry,tree.children.length+'.'+sub.children.length+'.'+(nested.children.length+1),3));}else sub.append(makeEntry(entry,tree.children.length+'.'+(sub.children.length+1),2));}
 const all=tree.querySelectorAll('.title');const title=all[all.length-1];title.contentEditable='true';title.focus();title.scrollIntoView({block:'nearest'});
});

})();
