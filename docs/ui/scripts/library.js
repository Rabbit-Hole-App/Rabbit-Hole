(() => {
const $=id=>document.getElementById(id),sortLabels={updated:'Last updated',created:'Created',name:'Name',forks:'Most forked'},typeLabels={projects:'Projects',canvases:'Canvas',apps:'Apps'};
const kindFor={projects:['repository'],canvases:['canvas'],apps:['job','server']};
const libraryCase=document.querySelector('[data-library-case]')?.dataset.libraryCase;
let folderId=libraryCase==='folder-empty'?'leetcode':window.RH_LIBRARY_INITIAL_FOLDER||null;
let type=folderId||libraryCase==='empty'?null:'canvases',mine=false,archived=false,query='',sort='updated',api=null,openMenu=null,opener=null;
const sortKey='rabbit-hole.ui-preview.librarySort';try{const saved=localStorage.getItem(sortKey);if(Object.hasOwn(sortLabels,saved))sort=saved}catch{}
// Fixture metadata only. App integration uses cardModel, real dates and server fork counts.
window.RH_HOME_DATA={continueId:null,items:[{id:'untitled',title:'Untitled canvas',kind:'canvas',mine:true,description:'',starred:false,count:0,cover:'canvas-thumbnail-image',updated:'2026-11-08T14:00:00Z',created:'2026-11-06T12:00:00Z',forks:0,updatedLabel:'Updated 1h ago'},{id:'trees',title:'Decision Trees and Random Forests',kind:'canvas',mine:true,description:'Explore how decision trees split data and how random forests combine their predictions.',starred:false,count:0,cover:'home-note-image',updated:'2026-11-07T15:00:00Z',created:'2026-11-07T12:00:00Z',forks:0,updatedLabel:'Updated 1d ago'}]};
window.RH_HOME_DATA.items.push({id:'evaluation',title:'Model evaluation',kind:'canvas',mine:true,folderId:'machine-learning',description:'Compare validation strategies and choose metrics for your model.',starred:false,count:0,cover:'canvas-thumbnail-image',updated:'2026-11-08T13:00:00Z',created:'2026-11-05T12:00:00Z',forks:0,updatedLabel:'Updated 2h ago'});
if(libraryCase==='empty')window.RH_HOME_DATA.items=[];
const useIcon=(name,sprite='standards')=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="'+({x:'../../../icons/library.svg#library-x'})[name]+'"></use></svg>';
function refresh(){api?.refresh()}
function closeMenu(focus=true){if(!openMenu)return;openMenu.hidden=true;opener.setAttribute('aria-expanded','false');if(focus)opener.focus();openMenu=null}
function showMenu(menu,b){if(openMenu===menu){closeMenu();return}closeMenu(false);openMenu=menu;opener=b;menu.hidden=false;b.setAttribute('aria-expanded','true');const box=b.getBoundingClientRect();menu.style.left=Math.max(12,Math.min(box.right-menu.offsetWidth,innerWidth-menu.offsetWidth-12))+'px';menu.style.top=Math.max(12,Math.min(box.bottom+6,innerHeight-menu.offsetHeight-12))+'px';(menu.querySelector('[aria-checked=true]')||menu.querySelector('button')).focus()}
for(const [buttonId,menuId] of [['library-filter','library-filter-menu'],['library-sort','library-sort-menu']]){const b=$(buttonId),menu=$(menuId);b.onclick=()=>showMenu(menu,b);b.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();showMenu(menu,b)}};menu.onkeydown=e=>{const buttons=[...menu.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),i=buttons.indexOf(document.activeElement),n={ArrowDown:(i+1)%buttons.length,ArrowUp:(i+buttons.length-1)%buttons.length,Home:0,End:buttons.length-1}[e.key];if(n!==undefined){e.preventDefault();buttons[n].focus()}if(e.key==='Escape'){e.preventDefault();closeMenu()}if(e.key==='Tab')closeMenu(true)}}
document.addEventListener('pointerdown',e=>{if(openMenu&&!openMenu.contains(e.target)&&!opener.contains(e.target))closeMenu(false)});$('home-main').addEventListener('scroll',()=>closeMenu(false));window.addEventListener('resize',()=>closeMenu(false));
document.querySelectorAll('[data-library-sort]').forEach(b=>b.onclick=()=>{sort=b.dataset.librarySort;try{localStorage.setItem(sortKey,sort)}catch{}closeMenu();refresh()});
document.querySelectorAll('[data-library-type]').forEach(b=>b.onclick=()=>{const value=b.dataset.libraryType;if(value==='archived'){if(archived){type=null;archived=false}else{type='canvases';archived=true}}else{type=type===value&&!archived?null:value;archived=false}closeMenu();refresh()});
$('library-mine').onclick=()=>{mine=!mine;closeMenu();refresh()};
function clearFilters(clearQuery=false){type=null;mine=false;archived=false;if(clearQuery){query='';$('library-search').value=''}refresh()}
$('library-filter-clear').onclick=()=>{clearFilters();closeMenu()};$('library-clear').onclick=()=>{clearFilters(true);$('library-search').focus()};$('library-search').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase();refresh()};
function chip(label,remove){const span=document.createElement('span');span.className='pill neutral library-chip';const text=document.createElement('span');text.textContent=label;const b=document.createElement('button');b.type='button';b.className='icon-button quiet';b.setAttribute('aria-label','Remove filter '+label);b.innerHTML=useIcon('x');b.onclick=()=>{remove();refresh();$('library-filter').focus()};span.append(text,b);return span}
function controls(){const count=(type?1:0)+(mine?1:0);$('library-filter-label').textContent='Filters'+(count?' · '+count:'');$('library-sort-label').textContent='Sort: '+sortLabels[sort];document.querySelectorAll('[data-library-type]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.libraryType==='archived'?archived:type===b.dataset.libraryType&&!archived)));$('library-mine').setAttribute('aria-checked',String(mine));document.querySelectorAll('[data-library-sort]').forEach(b=>b.setAttribute('aria-checked',String(sort===b.dataset.librarySort)));$('library-filter-clear').hidden=count===0;const chips=$('library-chips');chips.replaceChildren();if(type)chips.append(chip(archived?'Archived canvas':typeLabels[type],()=>{type=null;archived=false}));if(mine)chips.append(chip('Mine',()=>mine=false));$('library-search-wrap').hidden=archived||type==='apps';$('library-view-controls').hidden=archived||type==='apps';}
function compare(a,b){const updated=x=>x.updated||x.created||'',title=x=>x.title||'';const by={updated:()=>updated(b).localeCompare(updated(a)),created:()=>(b.created||'').localeCompare(a.created||''),name:()=>title(a).localeCompare(title(b),undefined,{sensitivity:'base',numeric:true}),forks:()=>(b.forks||0)-(a.forks||0)||updated(b).localeCompare(updated(a))};return by[sort]()||a.id.localeCompare(b.id)}
function listFor(items){const searching=!!query&&!archived&&type!=='apps';return items.filter(a=>!!a.archived===archived).filter(a=>!type||kindFor[type].includes(a.kind)).filter(a=>!mine||a.mine).filter(a=>folderId?a.folderId===folderId:searching||!a.folderId).filter(a=>!searching||((a.title||'')+' '+(a.repository||'')).toLocaleLowerCase().includes(query)).sort(compare)}
function render({items,createCard,syncStars,loadState}){
 controls();const folder=window.RHFolderUI.folders.find(f=>f.id===folderId);if(folderId&&!folder){folderId=null}
 $('library-breadcrumb').hidden=!folder;$('library-folder-crumb').textContent=folder?.name||'';$('library-title').textContent=folder?.name||'Library';$('folder-create').hidden=!!folder||archived||type==='apps';$('library-folder-more').hidden=!folder||archived||type==='apps';
 for(const id of ['library-folder-icon','library-crumb-icon']){
  const icon=$(id);
  icon.toggleAttribute('hidden',!folder);
  icon.style.color=folder?.color||'';
 }
 $('library-search').placeholder=folder?'Search in '+folder.name:'Search by name';$('library-search').setAttribute('aria-label',folder?'Search in '+folder.name:'Search by name');
 const counts={};items.filter(a=>!a.archived).forEach(a=>{if(a.folderId)counts[a.folderId]=(counts[a.folderId]||0)+1});window.RHFolderUI.setCounts(counts);$('library-folders').hidden=!!folder||archived||type==='apps'||!window.RHFolderUI.folders.length;
 const results=$('library-results'),shown=listFor(items);results.replaceChildren();
 function card(a){const node=createCard(a,true);node.querySelector('.canvas-footer>span').textContent=a.updatedLabel||'Updated recently';return node}
 if(type){const grid=document.createElement('div');grid.className='home-grid';shown.forEach(a=>grid.append(card(a)));results.append(grid)}else{for(const k of ['projects','canvases','apps']){const sectionItems=shown.filter(a=>kindFor[k].includes(a.kind));if(!sectionItems.length)continue;const section=document.createElement('section');section.className='library-group';const header=document.createElement('div');header.className='library-group-heading';const title=document.createElement('h2');title.textContent=typeLabels[k]+' '+sectionItems.length;const all=document.createElement('button');all.type='button';all.className='button quiet';all.textContent='View all '+sectionItems.length;all.onclick=()=>{type=k;refresh();$('library-filter').focus()};header.append(title,all);const grid=document.createElement('div');grid.className='home-grid';sectionItems.slice(0,6).forEach(a=>grid.append(card(a)));section.append(header,grid);results.append(section)}}
 const folderEmpty=folder&&!counts[folder.id];
 const libraryEmpty=!folder&&!items.some(a=>!a.archived)&&!window.RHFolderUI.folders.length;
 const cardView=!archived&&type!=='apps';
 const scopeEmpty=cardView&&(folderEmpty||libraryEmpty);
 const searching=cardView&&!!query;
 let emptyCopy='No canvases match.';
 if(archived)emptyCopy='No archived canvases.';
 else if(type==='apps')emptyCopy='No apps match.';
 else if(folderEmpty)emptyCopy='This folder is empty. Use Move to folder from a card’s menu.';
 else if(libraryEmpty)emptyCopy='Your library is empty.';
 else if(searching)emptyCopy='No results for “'+$('library-search').value.trim()+'”.';
 else if(folder)emptyCopy='No matching items in this folder.';
 else if(type==='projects')emptyCopy='No projects match.';
 $('home-empty').hidden=shown.length>0;
 $('library-empty-copy').textContent=emptyCopy;
 $('library-empty-glyph').setAttribute('href',archived?'../../../icons/library.svg#library-archive':folder?'../../../icons/library.svg#library-folder-open':'../../../icons/sidebar.svg#sidebar-library');
 $('library-clear').hidden=scopeEmpty||(!type&&!mine&&!searching);
 $('home-loading').hidden=loadState!=='loading';$('home-error').hidden=loadState!=='error';$('home-sections').hidden=loadState!=='ready';$('home-main').setAttribute('aria-busy',String(loadState==='loading'));$('library-result-status').textContent=shown.length+' '+(shown.length===1?'result':'results');syncStars();
}
window.RH_CARD_HOST={render,connect(controller){api=controller}};
window.addEventListener('rh-folder-open',e=>{folderId=e.detail;refresh();$('library-title').focus()});window.addEventListener('rh-folder-deleted',e=>{if(folderId===e.detail)folderId=null;refresh()});window.addEventListener('rh-folders-change',refresh);
$('library-back').onclick=()=>{folderId=null;refresh();$('library-title').focus()};$('library-folder-more').onclick=e=>{const f=window.RHFolderUI.folders.find(f=>f.id===folderId);if(f)window.RHFolderUI.openOptions(f,e.currentTarget)};
document.querySelectorAll('.sidebar-row[aria-current]').forEach(n=>n.removeAttribute('aria-current'));document.querySelector('.sidebar-row[data-label="Library"]').setAttribute('aria-current','page');document.querySelector('.sidebar-row[data-label="Library"]').addEventListener('click',()=>{folderId=null;refresh()});
})();
