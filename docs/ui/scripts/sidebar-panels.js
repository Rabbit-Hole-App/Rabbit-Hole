
(() => {
const $=id=>document.getElementById(id), sidebar=$('sidebar');
const panels={Search:$('search-panel'),Trash:$('trash-panel'),Notifications:$('notifications-panel'),Feedback:$('feedback-panel')};
const triggers={};let active=null,opener=null,highlight=0;let feedbackTimer=null;
const canvases=['Untitled canvas','Decision Trees and Random Forests'];
let deleted=['Feature Scaling Explorer','Forest Voting Explorer'];
const iconRefs={"i-Shapes":"../../../icons/standards.svg#i-Shapes","i-Trash2":"../../../icons/standards.svg#i-Trash2","project":"../../../icons/library.svg#library-folder-git-2"};
const svg=name=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="'+iconRefs[name]+'"></use></svg>';
Object.keys(panels).forEach(name=>{const b=document.querySelector('.sidebar-row[data-label="'+name+'"]');triggers[name]=b;b.setAttribute('aria-controls',panels[name].id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-haspopup','dialog');});
const badge=document.createElement('span');badge.className='count-badge';badge.textContent='1';badge.setAttribute('aria-hidden','true');triggers.Notifications.append(badge);triggers.Notifications.setAttribute('aria-label','Notifications, 1 unread');
function position(){if(!active||!['Feedback','Notifications'].includes(active))return;const p=panels[active];const left=sidebar.getBoundingClientRect().right+12;p.style.left=(left+p.offsetWidth+12<=innerWidth?left:Math.max(12,innerWidth-p.offsetWidth-12))+'px';}
function close(focus=true){if(!active)return;const name=active,p=panels[name];active=null;if(p.tagName==='DIALOG'&&p.open)p.close();else p.hidden=true;triggers[name].setAttribute('aria-expanded','false');delete triggers[name].dataset.open;if(focus&&opener?.isConnected)opener.focus();}
function open(name){if(active===name){close();return;}close(false);$('account-menu').hidden=true;$('account').setAttribute('aria-expanded','false');$('sidebar-tooltip').hidden=true;active=name;opener=triggers[name];document.querySelectorAll('.sidebar-row').forEach(b=>delete b.dataset.open);opener.dataset.open='true';opener.setAttribute('aria-expanded','true');const p=panels[name];if(p.tagName==='DIALOG')p.showModal();else{p.hidden=false;position();}if(name==='Search')resetSearch();else if(name==='Feedback')$('feedback-text').focus();else p.querySelector('[data-close-surface]').focus();if(name==='Notifications'){badge.hidden=true;opener.setAttribute('aria-label','Notifications');}}
Object.entries(triggers).forEach(([name,b])=>b.addEventListener('click',()=>open(name)));
Object.values(panels).forEach(p=>{p.querySelector('[data-close-surface]').onclick=()=>close();p.addEventListener('cancel',e=>{e.preventDefault();close();});p.addEventListener('click',e=>{if(p.tagName!=='DIALOG'||e.target!==p)return;const r=p.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});});
document.addEventListener('pointerdown',e=>{if(active&&panels[active].tagName!=='DIALOG'&&!panels[active].contains(e.target)&&!triggers[active].contains(e.target))close(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();close();return;}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='f'&&!e.target.closest('input,textarea,[contenteditable]')){e.preventDefault();open('Search');}if(!active||e.key!=='Tab')return;const p=panels[active];const items=[...p.querySelectorAll('button:not([disabled]),input,textarea,[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
window.addEventListener('resize',position);new ResizeObserver(position).observe(sidebar);
const searchInput=$('search-query'), searchList=$('search-results'), searchClear=$('search-clear');
const project={title:'Machine Learning Notes', name:'learning-lab/ml-notes', kind:'Project', runbook:'How to read a confusion matrix'};
let searchRows=[];
const recentTitles=[...canvases];
function searchGroups(query){
 const library=canvases.map(title=>({title, name:title.toLowerCase().replace(/[^a-z0-9]+/g,'-'), kind:'Canvas'}));
 library.push(project);
 const rank=item=>recentTitles.includes(item.title)?recentTitles.indexOf(item.title):recentTitles.length;
 return [
  ['Library',library.filter(item=>[item.title,item.name].some(value=>value.toLowerCase().includes(query))).sort((a,b)=>rank(a)-rank(b))],
  ['Runbooks',query?library.filter(item=>item.runbook?.toLowerCase().includes(query)):[]],
 ];
}
function pick(title){
 const previous=recentTitles.indexOf(title);
 if(previous>=0)recentTitles.splice(previous,1);
 recentTitles.unshift(title);
 recentTitles.splice(5);
 close();
 const row=[...document.querySelectorAll('.sidebar-row')].find(node=>node.dataset.label===title);
 if(row){
  document.querySelector('.sidebar-row[aria-current]')?.removeAttribute('aria-current');
  row.setAttribute('aria-current','page');
  row.focus();
 }
 $('preview-status').textContent='Selected '+title+' in this local preview.';
}
function moveSearchHighlight(next,focus=false){
 if(!searchRows.length)return;
 highlight=Math.min(searchRows.length-1,Math.max(0,next));
 searchRows.forEach((row,index)=>{row.dataset.active=String(index===highlight);});
 searchRows[highlight].scrollIntoView?.({block:'nearest'});
 if(focus)searchRows[highlight].focus();
}
function searchResult(item){
 const button=document.createElement('button');
 button.type='button';
 button.className='menu-item search-result';
 button.innerHTML=svg(item.kind==='Project'?'project':'i-Shapes')+'<span class="result-title"></span><span class="result-kind"></span>';
 button.querySelector('.result-title').textContent=item.title;
 button.querySelector('.result-kind').textContent=item.kind;
 button.onclick=()=>pick(item.title);
 const index=searchRows.length;
 button.onkeydown=event=>{
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
  event.preventDefault();
  moveSearchHighlight(index+(event.key==='ArrowDown'?1:-1),true);
 };
 searchRows.push(button);
 return button;
}
function renderSearch(){
 const query=searchInput.value.trim().toLowerCase();
 searchList.replaceChildren();
 searchRows=[];
 for(const [name,items] of searchGroups(query)){
  if(!items.length)continue;
  const heading=document.createElement('p');
  heading.className='search-group-title';
  heading.textContent=name;
  searchList.append(heading,...items.map(searchResult));
 }
 const noResults=Boolean(query)&&searchRows.length===0;
 if(noResults){
  const empty=document.createElement('p');
  empty.className='search-no-results';
  empty.textContent='No results';
  searchList.append(empty);
 }
 searchClear.hidden=!noResults;
 $('search-count').textContent=searchRows.length+(searchRows.length===1?' result':' results');
 moveSearchHighlight(highlight);
}
function resetSearch(){
 highlight=0;
 searchInput.value='';
 renderSearch();
 searchInput.focus();
}
searchClear.onclick=resetSearch;
searchInput.oninput=()=>{highlight=0;renderSearch();};
searchInput.onkeydown=event=>{
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){
  event.preventDefault();
  moveSearchHighlight(highlight+(event.key==='ArrowDown'?1:-1));
 }
 if(event.key==='Enter'&&searchRows[highlight]){
  event.preventDefault();
  searchRows[highlight].click();
 }
};
function renderTrash(){const list=$('trash-items');list.replaceChildren();if(!deleted.length){list.innerHTML='<div class="empty-state">'+svg('i-Trash2')+'<strong>Nothing in the trash.</strong><span>Deleted canvases will appear here.</span></div>';return;}deleted.forEach((title,i)=>{const row=document.createElement('div');row.className='trash-row';row.innerHTML=svg('i-Shapes')+'<div class="item-copy"><strong></strong><small>Canvas · Deleted '+(i?'yesterday':'2 hours ago')+'</small></div><button class="button secondary" type="button">Restore</button>';row.querySelector('strong').textContent=title;row.querySelector('button').setAttribute('aria-label','Restore '+title);row.querySelector('button').onclick=()=>{deleted=deleted.filter(t=>t!==title);canvases.push(title);$('restore-status').textContent=title+' restored.';renderTrash();($('trash-items').querySelector('button')||panels.Trash.querySelector('[data-close-surface]')).focus();};list.append(row);});}renderTrash();
$('clear-notifications').onclick=()=>{$('notification-items').hidden=true;$('notifications-empty').hidden=false;$('clear-notifications').hidden=true;panels.Notifications.querySelector('[data-close-surface]').focus();badge.hidden=true;$('preview-status').textContent='Notifications cleared.';};
document.querySelectorAll('[data-feedback-kind]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-feedback-kind]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));const bug=b.dataset.feedbackKind==='bug';$('feedback-label').textContent=bug?'What went wrong?':'Your idea';$('feedback-text').placeholder=bug?'What happened, and what did you expect?':'What would you like Rabbit Hole to do?';$('feedback-status').textContent='';$('feedback-text').focus();});
$('feedback-text').oninput=()=>{$('feedback-submit').disabled=!$('feedback-text').value.trim();$('feedback-status').textContent='';};
let feedbackSending=false,feedbackSuccessTimer=null;
const feedbackRow=triggers.Feedback;
const feedbackIcon=feedbackRow.querySelector('use');
const originalFeedbackIcon=feedbackIcon.getAttribute('href');
function resetFeedbackConfirmation(){
 clearTimeout(feedbackSuccessTimer);
 feedbackIcon.setAttribute('href',originalFeedbackIcon);
 feedbackRow.style.removeProperty('color');
 feedbackRow.dataset.label='Feedback';
 feedbackRow.setAttribute('aria-label','Feedback');
}
feedbackRow.addEventListener('click',resetFeedbackConfirmation);
$('feedback-form').onsubmit=e=>{
 e.preventDefault();
 if(feedbackSending||!$('feedback-text').value.trim())return;
 feedbackSending=true;resetFeedbackConfirmation();
 $('feedback-submit').disabled=true;
 $('feedback-submit').textContent='Submitting…';
 $('feedback-text').disabled=true;
 document.querySelectorAll('[data-feedback-kind]').forEach(b=>b.disabled=true);
 $('feedback-form').setAttribute('aria-busy','true');
 // Local success simulation. Production uses FeedbackButton.jsx API and error handling.
 feedbackTimer=setTimeout(()=>{
  feedbackSending=false;
  $('feedback-form').removeAttribute('aria-busy');
  $('feedback-text').disabled=false;
  $('feedback-text').value='';
  document.querySelectorAll('[data-feedback-kind]').forEach(b=>b.disabled=false);
  $('feedback-submit').textContent='Submit';
  $('feedback-submit').disabled=true;
  $('feedback-status').textContent='';
  if(active==='Feedback')close();
  feedbackIcon.setAttribute('href','../../../icons/standards.svg#i-Check');
  feedbackRow.style.setProperty('color','var(--green)');
  feedbackRow.dataset.label='Sent, thank you';
  feedbackRow.setAttribute('aria-label','Feedback sent, thank you');
  $('preview-status').textContent='Feedback sent, thank you.';
  feedbackSuccessTimer=setTimeout(resetFeedbackConfirmation,2500);
 },500);
};
const initial=document.querySelector('[data-sidebar-initial]')?.dataset.sidebarInitial;
if(initial&&triggers[initial])triggers[initial].click();
})();

