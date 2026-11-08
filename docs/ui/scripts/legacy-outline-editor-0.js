
const items=[
{title:'Why trees, and what a tree does',description:'See how a series of yes/no questions divides the data and produces a prediction.'},
{title:'Measuring impurity',description:'Compare Gini and entropy to understand what makes a group of examples more consistent.',children:[
 {title:'Gini impurity',description:'Work through one small calculation using a mixed group of examples.'},
 {title:'Entropy',description:'Compare the same split using a second measure of uncertainty.'}
]},
{title:'Information gain and greedy splitting',description:'Choose between candidate splits and understand why the tree decides one split at a time.'},
{title:'Stopping the tree',description:'See how depth limits and minimum leaf size control complexity and overfitting.'},
{title:'Random forests',description:'Understand how bagging and random feature choices make individual trees differ.'},
{title:'Feature importance',description:'Compare impurity-based and permutation importance, including their limitations.'},
{title:'When trees beat neural networks',description:'Identify where tree models are useful without treating that advantage as universal.'},
{title:'Building a tree from scratch',description:'Connect the split rule, stopping condition and prediction to a small implementation.'},
{title:'Using it in practice',description:'Put the ideas together and explain the choices behind a simple tree or forest.'}
];
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
 if(level===1){const state=document.createElement('div');state.className='state';state.textContent='Planned · Explanation';content.append(state);}
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
const tree=document.getElementById('tree');items.forEach((item,i)=>tree.append(makeEntry(item,String(i+1))));
document.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{
 const level=Number(button.dataset.add);
 const entry={title:level===1?'New section':level===2?'New sub-section':'New sub-sub-section',description:'Add a short description of what this section covers.'};
 if(level===1)tree.append(makeEntry(entry,String(tree.children.length+1)));
 else{let parent=tree.lastElementChild,sub=parent.querySelector(':scope > .children');if(!sub){sub=document.createElement('ol');sub.className='children';parent.append(sub);}if(level===3){let last=sub.lastElementChild;if(!last){last=makeEntry({title:'New sub-section',description:'What this part covers.'},tree.children.length+'.1',2);sub.append(last);}let nested=last.querySelector(':scope > .children');if(!nested){nested=document.createElement('ol');nested.className='children';last.append(nested);}nested.append(makeEntry(entry,tree.children.length+'.'+sub.children.length+'.'+(nested.children.length+1),3));}else sub.append(makeEntry(entry,tree.children.length+'.'+(sub.children.length+1),2));}
 const all=tree.querySelectorAll('.title');const title=all[all.length-1];title.contentEditable='true';title.focus();title.scrollIntoView({block:'nearest'});
});
