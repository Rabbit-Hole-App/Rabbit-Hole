
(() => {
const sidebar=document.getElementById('sidebar'), collapse=document.getElementById('collapse'), account=document.getElementById('account'), menu=document.getElementById('account-menu'), tooltip=document.getElementById('sidebar-tooltip'), separator=document.getElementById('resize-sidebar'), status=document.getElementById('preview-status');
let width=300,collapsed=false,timer=null,tipTarget=null,drag=null;
const announce=label=>{status.textContent=label+' selected in this local sidebar preview. No app action is performed.'};
function hideTip(){clearTimeout(timer);tooltip.hidden=true;if(tipTarget)tipTarget.removeAttribute('aria-describedby');tipTarget=null;}
function showTip(target,label){hideTip();timer=setTimeout(()=>{if(!label)return;tipTarget=target;tooltip.textContent=label;tooltip.hidden=false;target.setAttribute('aria-describedby','sidebar-tooltip');const box=target.getBoundingClientRect(),edge=sidebar.getBoundingClientRect().right;tooltip.style.left=Math.max(8,Math.min(edge+8,innerWidth-tooltip.offsetWidth-8))+'px';tooltip.style.top=Math.max(8,Math.min(box.top+(box.height-tooltip.offsetHeight)/2,innerHeight-tooltip.offsetHeight-8))+'px';},400)}
function positionMenu(){const edge=sidebar.getBoundingClientRect();menu.style.left=(collapsed?Math.min(edge.right+8,Math.max(10,innerWidth-270)):10)+'px';menu.style.top=(collapsed?8:58)+'px'}
function closeMenu(focus=false){menu.hidden=true;account.setAttribute('aria-expanded','false');if(focus)account.focus()}
function openMenu(){hideTip();positionMenu();menu.hidden=false;account.setAttribute('aria-expanded','true');menu.querySelector('[role=menuitem]').focus()}
account.onclick=()=>menu.hidden?openMenu():closeMenu(true);
account.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();openMenu()}};
menu.onkeydown=e=>{const items=[...menu.querySelectorAll('[role=menuitem]')],index=items.indexOf(document.activeElement);let next;if(e.key==='ArrowDown')next=(index+1)%items.length;if(e.key==='ArrowUp')next=(index+items.length-1)%items.length;if(e.key==='Home')next=0;if(e.key==='End')next=items.length-1;if(next!==undefined){e.preventDefault();items[next].focus()}if(e.key==='Tab'){closeMenu();if(e.shiftKey){e.preventDefault();account.focus()}else{e.preventDefault();collapse.focus()}}};
menu.querySelectorAll('[data-account-action]').forEach(b=>b.onclick=()=>{announce(b.dataset.accountAction);closeMenu(true)});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!account.contains(e.target))closeMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTip();if(!menu.hidden)closeMenu(true)}});
function setCollapsed(value){hideTip();closeMenu();collapsed=value;sidebar.classList.toggle('collapsed',value);collapse.setAttribute('aria-label',value?'Expand sidebar':'Collapse sidebar');collapse.setAttribute('aria-expanded',String(!value));collapse.querySelector('use').setAttribute('href',value?'../../../icons/sidebar.svg#sidebar-panel-left-open':'../../../icons/sidebar.svg#sidebar-panel-left-close');separator.tabIndex=value?-1:0;}
collapse.onclick=()=>setCollapsed(!collapsed);
const recentToggle=document.getElementById('recent-toggle');recentToggle.onclick=()=>{const open=recentToggle.getAttribute('aria-expanded')!=='true';recentToggle.setAttribute('aria-expanded',String(open));recentToggle.setAttribute('aria-label',open?'Collapse Recent':'Expand Recent');document.getElementById('recent-list').hidden=!open;hideTip()};
document.querySelectorAll('.sidebar-row').forEach(b=>{b.onclick=()=>{hideTip();closeMenu();document.querySelectorAll('.sidebar-row').forEach(n=>delete n.dataset.open);if(b.dataset.kind==='destination'){document.querySelectorAll('.sidebar-row[aria-current]').forEach(n=>n.removeAttribute('aria-current'));b.setAttribute('aria-current','page')}else b.dataset.open='true';announce(b.dataset.label)};});
document.querySelectorAll('.sidebar-row,#account,#collapse,#recent-toggle').forEach(b=>{const label=()=>{if(b.classList.contains('sidebar-row')){const text=b.querySelector('.row-label');return collapsed||text.scrollWidth>text.clientWidth?b.dataset.label:null}if(b===account)return collapsed?'Account menu':b.querySelector('.account-label').scrollWidth>b.querySelector('.account-label').clientWidth?'Yudhisteer Chintaram':null;return b.getAttribute('aria-label')};b.addEventListener('pointerenter',()=>showTip(b,label()));b.addEventListener('pointerleave',hideTip);b.addEventListener('focus',()=>{if(b.matches(':focus-visible'))showTip(b,label())});b.addEventListener('blur',hideTip);b.addEventListener('pointerdown',hideTip)});
function setWidth(next){width=Math.max(200,Math.min(400,next));sidebar.style.setProperty('--sidebar-width',width+'px');separator.setAttribute('aria-valuenow',String(Math.round(width)));hideTip();closeMenu();}
separator.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,width};sidebar.classList.add('resizing');separator.setPointerCapture(e.pointerId);separator.focus();e.preventDefault()};
separator.onpointermove=e=>{if(drag)setWidth(drag.width+e.clientX-drag.x)};
function endResize(){drag=null;sidebar.classList.remove('resizing')};separator.onpointerup=endResize;separator.onpointercancel=endResize;separator.onlostpointercapture=endResize;
separator.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?40:10;setWidth(e.key==='Home'?200:e.key==='End'?400:width+(e.key==='ArrowLeft'?-step:step))};
window.addEventListener('resize',()=>{hideTip();if(!menu.hidden)positionMenu()});document.getElementById('sidebar-scroll').addEventListener('scroll',hideTip);
})();

