/* Assembled template behavior; shared widgets and resize loaded first.
   Only local draft state changes. This preview does not call the app backend. */
(() => {

const $=id=>document.getElementById(id), dialog=$('dialog'), tabs=[...document.querySelectorAll('[data-tab]')];
let sources=[];
function render(){const list=$('sources');list.replaceChildren();sources.forEach((source,index)=>{const row=window.makeSourceRow(source,()=>{sources.splice(index,1);render();const buttons=list.querySelectorAll('button');(buttons[Math.min(index,buttons.length-1)]||tabs.find(t=>t.getAttribute('aria-selected')==='true')).focus()});list.append(row)});$('empty').hidden=sources.length>0;$('blank').hidden=sources.length>0;$('start').disabled=!sources.length;if(sources.length){$('start').removeAttribute('aria-describedby')}else{$('start').setAttribute('aria-describedby','empty')};$('repo-add').disabled=sources.some(s=>s.type==='repo');$('source-status').textContent=sources.length+' source'+(sources.length===1?'':'s')+' added.';}
function addFiles(files){for(const f of files){const key=f.name+':'+f.size+':'+f.lastModified;if(!sources.some(s=>s.key===key))sources.push({key,type:'file',name:f.name,detail:f.size<1024?f.size+' B':f.size<1048576?(f.size/1024).toFixed(1)+' KB':(f.size/1048576).toFixed(1)+' MB'})}render()}
dialog.addEventListener('sourcefiles',event=>addFiles(event.detail));
for(const type of ['link','repo']){$(type+'-panel').addEventListener('submit',e=>{e.preventDefault();const input=$(type+'-input'),error=$(type+'-error');error.hidden=true;input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');try{const url=new URL(input.value.trim());if(!['https:','http:'].includes(url.protocol))throw Error('Use an http or https URL.');if(url.username||url.password)throw Error('Use a URL without embedded credentials.');if(type==='repo'&&sources.some(s=>s.type==='repo'))throw Error('Remove the existing repository before adding another.');if(type==='repo'&&(url.hostname!=='github.com'||url.pathname.split('/').filter(Boolean).length!==2))throw Error('Enter a GitHub repository URL: https://github.com/owner/repository.');if(sources.some(s=>s.key===url.href))throw Error('This source is already added.');sources.push({key:url.href,type,name:url.href,detail:type==='repo'?'Repository':'Link'});input.value='';render();input.focus()}catch(err){error.textContent=err.message||'Enter a valid URL.';error.hidden=false;input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',type+'-error')}})}
function finish(kind){document.getElementById('home-start-host').close();}
document.querySelector('.start-close').onclick=()=>finish('close');$('blank').onclick=()=>finish('blank');$('start').onclick=()=>finish('sources');
document.addEventListener('keydown',e=>{if(!document.getElementById("home-start-host").open)return;if(e.key==='Escape'){finish('close');return}if(e.key==='Tab'){const items=[...dialog.querySelectorAll('button,input,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('title'))){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
installResize(dialog,$('resize'));


})();
