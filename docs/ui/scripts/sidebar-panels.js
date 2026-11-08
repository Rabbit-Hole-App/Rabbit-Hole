
(() => {
const $=id=>document.getElementById(id), sidebar=$('sidebar');
const panels={Search:$('search-panel'),Trash:$('trash-panel'),Notifications:$('notifications-panel'),Feedback:$('feedback-panel')};
const triggers={};let active=null,opener=null,highlight=0;let feedbackTimer=null;
const canvases=['Untitled canvas','Decision Trees and Random Forests'];
let deleted=['Feature Scaling Explorer','Forest Voting Explorer'];
const iconRefs={"i-Shapes":"../../../icons/standards.svg#i-Shapes","i-Trash2":"../../../icons/standards.svg#i-Trash2","sidebar-search":"../../../icons/sidebar.svg#sidebar-search"};
const svg=name=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="'+iconRefs[name]+'"></use></svg>';
Object.keys(panels).forEach(name=>{const b=document.querySelector('.sidebar-row[data-label="'+name+'"]');triggers[name]=b;b.setAttribute('aria-controls',panels[name].id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-haspopup','dialog');});
const badge=document.createElement('span');badge.className='count-badge';badge.textContent='1';badge.setAttribute('aria-hidden','true');triggers.Notifications.append(badge);triggers.Notifications.setAttribute('aria-label','Notifications, 1 unread');
function position(){if(!active||!['Feedback','Notifications'].includes(active))return;const p=panels[active];const left=sidebar.getBoundingClientRect().right+12;p.style.left=(left+p.offsetWidth+12<=innerWidth?left:Math.max(12,innerWidth-p.offsetWidth-12))+'px';}
function close(focus=true){if(!active)return;const name=active,p=panels[name];active=null;if(p.tagName==='DIALOG'&&p.open)p.close();else p.hidden=true;triggers[name].setAttribute('aria-expanded','false');delete triggers[name].dataset.open;if(focus&&opener?.isConnected)opener.focus();}
function open(name){if(active===name){close();return;}close(false);$('account-menu').hidden=true;$('account').setAttribute('aria-expanded','false');$('sidebar-tooltip').hidden=true;active=name;opener=triggers[name];document.querySelectorAll('.sidebar-row').forEach(b=>delete b.dataset.open);opener.dataset.open='true';opener.setAttribute('aria-expanded','true');const p=panels[name];if(p.tagName==='DIALOG')p.showModal();else{p.hidden=false;position();}if(name==='Search'){highlight=0;$('search-query').value='';renderSearch();$('search-query').focus();}else if(name==='Feedback')$('feedback-text').focus();else p.querySelector('[data-close-surface]').focus();if(name==='Notifications'){badge.hidden=true;opener.setAttribute('aria-label','Notifications');}}
Object.entries(triggers).forEach(([name,b])=>b.addEventListener('click',()=>open(name)));
Object.values(panels).forEach(p=>{p.querySelector('[data-close-surface]').onclick=()=>close();p.addEventListener('cancel',e=>{e.preventDefault();close();});p.addEventListener('click',e=>{if(p.tagName!=='DIALOG'||e.target!==p)return;const r=p.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});});
document.addEventListener('pointerdown',e=>{if(active&&panels[active].tagName!=='DIALOG'&&!panels[active].contains(e.target)&&!triggers[active].contains(e.target))close(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();close();return;}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='f'&&!e.target.closest('input,textarea,[contenteditable]')){e.preventDefault();open('Search');}if(!active||e.key!=='Tab')return;const p=panels[active];const items=[...p.querySelectorAll('button:not([disabled]),input,textarea,[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
window.addEventListener('resize',position);new ResizeObserver(position).observe(sidebar);
function hits(){return canvases.filter(t=>t.toLowerCase().includes($('search-query').value.trim().toLowerCase()));}
function pick(title){close();document.querySelectorAll('.sidebar-row[aria-current]').forEach(n=>n.removeAttribute('aria-current'));const row=[...document.querySelectorAll('.sidebar-row')].find(n=>n.dataset.label===title);if(row){row.setAttribute('aria-current','page');row.focus();}$('preview-status').textContent='Selected '+title+' in this local preview.';}
function renderSearch(){const list=$('search-results'),results=hits();highlight=Math.max(0,Math.min(highlight,results.length-1));list.replaceChildren();$('search-count').textContent=results.length+' results';if(!results.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML=svg('sidebar-search')+'<strong>No results</strong><span>Try another canvas title.</span>';list.append(empty);return;}results.forEach((title,i)=>{const b=document.createElement('button');b.type='button';b.className='menu-item search-result';b.dataset.active=String(i===highlight);b.innerHTML=svg('i-Shapes')+'<span class="result-title"></span><span class="result-kind">Canvas</span>';b.querySelector('.result-title').textContent=title;b.onclick=()=>pick(title);b.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();highlight=(i+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;renderSearch();list.children[highlight].focus();};list.append(b);});}
$('search-query').oninput=()=>{highlight=0;renderSearch();};$('search-query').onkeydown=e=>{const results=hits();if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(!results.length)return;highlight=e.key==='ArrowDown'?0:results.length-1;renderSearch();$('search-results').children[highlight].focus();}if(e.key==='Enter'&&results.length){e.preventDefault();pick(results[highlight]);}};
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

