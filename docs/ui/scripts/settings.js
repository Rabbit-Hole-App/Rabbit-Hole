(() => {
const $=id=>document.getElementById(id), dialog=$('settings-dialog'), purchase=$('purchase-dialog');
const params=new URLSearchParams(location.search), state={theme:'light',textSize:'default',sendKey:'enter',speed:'1',analytics:'rejected',amount:'20'};
const scenario=params.get('case')||document.querySelector('[data-settings-case]')?.dataset.settingsCase||'ready';
const api=window.RH_SETTINGS_API||(window.RH_SETTINGS_USE_SERVER===true?window.createSettingsApi():window.createSettingsDemoApi(scenario));
let usageLoaded=false;
const saved={name:'Yudhisteer Chintaram',handle:'yudhisteer',description:''};
const timers=new WeakMap();
function announce(text){$('settings-status').textContent=text;}
function choosePane(key,focus=true){
 if(!document.querySelector('[data-pane="'+key+'"]'))key='profile';
 document.querySelectorAll('[data-pane]').forEach(b=>{if(b.dataset.pane===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 document.querySelectorAll('.settings-pane').forEach(p=>p.hidden=p.id!=='pane-'+key);
 document.querySelector('.settings-scroll').scrollTop=0;
 if(focus)$('title-'+key).focus({preventScroll:true});
 if(key==='usage'&&!usageLoaded){usageLoaded=true;loadUsage();}
}
document.querySelectorAll('[data-pane]').forEach(b=>b.onclick=()=>choosePane(b.dataset.pane));
$('open-settings').onclick=()=>{dialog.showModal();document.querySelector('.settings-pane:not([hidden]) h2').focus();};
$('close-settings').onclick=()=>dialog.close();
for(const modal of [dialog,purchase]){
 modal.addEventListener('click',e=>{if(e.target!==modal)return;const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();});
 modal.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
}
purchase.addEventListener('close',()=>$('buy-credits').focus());
dialog.addEventListener('close',()=>$('open-settings').focus());
function flash(button,label='Saved'){
 clearTimeout(timers.get(button));
 const original=button.dataset.originalLabel||button.textContent;button.dataset.originalLabel=original;
 button.textContent=label;button.dataset.saved='true';
 timers.set(button,setTimeout(()=>{button.textContent=original;delete button.dataset.saved;},1800));
}
function validateHandle(raw){
 const value=raw.replace(/^@+/, '').toLowerCase();
 if(raw!==raw.trim())return {error:'A handle has no spaces.'};
 if(value.length<3||value.length>30)return {error:'A handle is 3–30 characters.'};
 if(!/^[a-z0-9][a-z0-9_]{2,29}$/.test(value))return {error:'Use letters, numbers and _, starting with a letter or number.'};
 if(RESERVED_HANDLES.includes(value))return {error:'@'+value+' is reserved. Choose another.'};
 return {value};
}
document.querySelectorAll('[data-profile-field]').forEach(form=>{
 const name=form.dataset.profileField,input=$('profile-'+name),save=form.querySelector('button'),error=$(name+'-error');
 input.setAttribute('aria-describedby',error.id+(name==='description'?' description-count':''));
 function edited(){
  if(name==='handle')input.value=input.value.replace(/^@+/, '');
  clearTimeout(timers.get(save));save.textContent='Save';delete save.dataset.saved;
  save.disabled=input.value===saved[name];error.hidden=true;input.removeAttribute('aria-invalid');
  if(name==='description')$('description-count').textContent=input.value.length+'/160';
 }
 input.addEventListener('input',edited);
 form.onsubmit=async e=>{
  e.preventDefault();if(save.disabled)return;
  let value=input.value;
  if(name==='handle'){const result=validateHandle(value);if(result.error){error.textContent=result.error;error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}value=result.value;}
  if(name==='description')value=value.replace(/[\s\u0000-\u001f\u007f]+/g,' ').trim();
  if(name==='name')value=value.replace(/\s+/g,' ').trim();
  error.hidden=true;input.removeAttribute('aria-invalid');save.disabled=true;input.disabled=true;
  save.textContent=name==='handle'?'Checking…':'Saving…';form.setAttribute('aria-busy','true');
  try{
   const result=await api.saveProfile({[name]:value});
   if(!result||typeof result[name]!=='string'&&result[name]!==null)throw new Error('Could not confirm the save. Try again.');
   value=result[name]??'';saved[name]=value;input.value=value;
   if(name==='description')$('description-count').textContent=value.length+'/160';
   if(name==='handle')$('public-profile').href='https://digrabbithole.com/@'+encodeURIComponent(value);
   if(name==='name'&&!$('profile-avatar').querySelector('img'))$('profile-avatar').textContent=(value.trim()[0]||'Y').toUpperCase();
   save.dataset.originalLabel='Save';flash(save);announce(name[0].toUpperCase()+name.slice(1)+' saved');
  }catch(problem){
   error.textContent=problem.message||'Could not save. Try again.';error.hidden=false;
   save.disabled=false;save.textContent=problem.taken?'Save':'Retry';
   if(problem.taken){input.setAttribute('aria-invalid','true');}
  }finally{input.disabled=false;form.removeAttribute('aria-busy');if(dialog.open&&!input.closest('[hidden]'))input.focus({preventScroll:true});}
 };

});
const reservedSource=['about','account','admin','api','app','apps','auth','billing','blog','docs','explore','help','home','library','login','logout','me','mod','moderator','null','official','privacy','rabbit','rabbithole','root','security','settings','signin','signup','staff','support','system','team','terms','undefined','www'];
const RESERVED_HANDLES=reservedSource;
$('upload-picture').onclick=()=>$('picture-input').click();
let pendingAvatar;
function displayAvatar(value){
 if(value){const img=new Image();img.alt='Profile picture';img.src=value;$('profile-avatar').replaceChildren(img);}else $('profile-avatar').textContent=(saved.name[0]||'Y').toUpperCase();
 $('upload-picture').textContent=value?'Change picture':'Upload picture';$('remove-picture').hidden=!value;
}
async function saveAvatar(){
 const err=$('picture-error');err.hidden=true;$('picture-retry').hidden=true;$('picture-progress').hidden=false;
 $('upload-picture').disabled=true;$('remove-picture').disabled=true;$('picture-progress').querySelector('span').textContent=pendingAvatar===null?'Removing picture…':'Uploading picture…';$('picture-retry').textContent=pendingAvatar===null?'Retry removal':'Retry upload';
 try{const response=await api.saveProfile({avatar:pendingAvatar});if(!response||!Object.hasOwn(response,'avatar'))throw new Error('Could not confirm the upload. Try again.');displayAvatar(response.avatar);announce(response.avatar?'Picture updated':'Picture removed');pendingAvatar=undefined;}
 catch(error){err.textContent=error.message||'Picture could not be uploaded. Try again.';err.hidden=false;$('picture-retry').hidden=false;}
 finally{$('picture-progress').hidden=true;$('upload-picture').disabled=false;$('remove-picture').disabled=false;if(dialog.open&&!$('profile-data').closest('[hidden]'))($('picture-retry').hidden?$('upload-picture'):$('picture-retry')).focus({preventScroll:true});}
}
$('picture-input').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const err=$('picture-error');err.hidden=true;$('picture-retry').hidden=true;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)){err.textContent='Choose a PNG, JPG or WebP image.';err.hidden=false;return;}
 $('upload-picture').disabled=true;
 try{
  const bitmap=await createImageBitmap(file),side=Math.min(bitmap.width,bitmap.height),canvas=document.createElement('canvas');
  canvas.width=canvas.height=Math.min(256,side);
  canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,canvas.width,canvas.height);bitmap.close();
  pendingAvatar=canvas.toDataURL('image/png');
 }catch{err.textContent='That image could not be read. Choose another PNG, JPG or WebP image.';err.hidden=false;$('upload-picture').disabled=false;return;}
 await saveAvatar();
};
$('picture-retry').onclick=saveAvatar;
$('remove-picture').onclick=()=>{pendingAvatar=null;saveAvatar();};
const mod=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
document.querySelector('[data-choice="sendKey"] [data-value="mod"]').textContent=mod+'+Enter';
document.querySelectorAll('[data-choice]').forEach(group=>{
 group.querySelectorAll('[data-value]').forEach(b=>b.onclick=()=>{
  const key=group.dataset.choice;state[key]=b.dataset.value;
  group.querySelectorAll('[data-value]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));
  if(key==='textSize')document.documentElement.style.setProperty('--settings-scale',({default:1,large:1.125,larger:1.25})[state.textSize]);
  if(key==='sendKey')$('send-key-description').textContent=state.sendKey==='enter'?'Shift+Enter adds a new line.':'Enter adds a new line.';
  if(key==='analytics')$('analytics-description').textContent=state.analytics==='accepted'?'On in this browser, including public-board measurement. Rejecting stops collection and removes local identifiers; previously sent events are retained.':'Off in this browser.';
  if(key==='amount'){updatePurchase();if(state.amount==='other')$('other-amount').focus();}
  announce(group.getAttribute('aria-label')+': '+b.textContent);
  if(key!=='amount')persistPreference(group,key,state[key]);
 });
});
$('reduce-motion').onchange=e=>{document.documentElement.toggleAttribute('data-reduce-motion',e.target.checked);persistPreference(e.target,'reduceMotion',e.target.checked);};
for(const id of ['email-updates','email-newsletter'])$(id).onchange=e=>{if(id==='email-updates'){$('confirm-updates').hidden=true;$('email-confirm-description').hidden=true;}announce(e.target.getAttribute('aria-label')+(e.target.checked?' on':' off'));persistPreference(e.target,id,e.target.checked);};
if(params.get('email')==='confirm'){$('confirm-updates').hidden=false;$('email-confirm-description').hidden=false;}
$('confirm-updates').onclick=()=>{$('confirm-updates').hidden=true;$('email-confirm-description').hidden=true;$('email-updates').focus();announce('Rabbit Hole Updates confirmed');};
$('log-out').onclick=()=>{dialog.close();announce('Signed out');};
function amountValue(value){const n=Number(value.trim());return /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value.trim())&&Number.isFinite(n)&&n>0?n:null;}
function updatePurchase(){
 const other=state.amount==='other',amount=other?amountValue($('other-amount').value):Number(state.amount);
 $('other-amount-label').hidden=!other;$('purchase-notice').hidden=true;
 $('amount-error').hidden=!other||amount!==null||!$('other-amount').value;
 $('other-amount').setAttribute('aria-invalid',String(other&&amount===null&&!!$('other-amount').value));
 $('purchase-buy').disabled=amount===null;$('purchase-total').hidden=amount===null;
 if(amount!==null)$('purchase-total').textContent='Total: '+amount.toLocaleString('en-US',{style:'currency',currency:'USD'});
}
$('buy-credits').onclick=()=>{updatePurchase();purchase.showModal();purchase.querySelector('[aria-pressed="true"]').focus();};
$('purchase-cancel').onclick=()=>purchase.close();$('other-amount').oninput=updatePurchase;
$('purchase-buy').onclick=()=>{$('purchase-notice').textContent='Credit purchases are coming soon.';$('purchase-notice').hidden=false;};
async function persistPreference(control,key,value){
 const host=control.closest('.row-control');let status=host.querySelector('.preference-state');
 if(!status){status=document.createElement('div');status.className='preference-state';status.setAttribute('role','status');host.append(status);}
 const restoreRetryFocus=status.contains(document.activeElement);
 const token=Symbol();status.requestToken=token;status.removeAttribute('data-error');status.replaceChildren(document.createTextNode('Saving…'));
 const children=[...host.querySelectorAll('button,input')];children.forEach(n=>n.disabled=true);
 try{
  if(key.startsWith('email-'))await api.saveProfile({emailPreferences:{source:'settings',disclosure:'v2',[key==='email-updates'?'updates':'newsletter']:{enabled:value}}});
  else if(api.savePreference)await api.savePreference(key,value);
  else throw new Error('Could not save this preference. Try again.');
  if(status.requestToken!==token)return;status.textContent='Saved';setTimeout(()=>{if(status.requestToken===token)status.textContent='';},1800);
 }catch{if(status.requestToken!==token)return;status.setAttribute('data-error','');status.textContent='Not saved.';const retry=document.createElement('button');retry.className='button secondary';retry.type='button';retry.textContent='Retry';retry.onclick=()=>persistPreference(control,key,value);status.append(retry);}
 finally{if(status.requestToken===token){children.forEach(n=>n.disabled=false);if(restoreRetryFocus&&dialog.open&&!host.closest('[hidden]'))(status.querySelector('button')||host.querySelector('[aria-pressed="true"]')||host.querySelector('input,button'))?.focus();}}
}
async function loadProfile(){
 const retryFocused=document.activeElement===$('profile-retry');
 $('profile-loading').hidden=false;$('profile-unavailable').hidden=true;$('profile-data').hidden=true;
 try{
  const profile=await api.loadProfile();if(!profile||!['name','handle','description'].every(k=>k in profile))throw new Error('Profile unavailable');
  for(const key of ['name','handle','description']){saved[key]=profile[key]??'';$('profile-'+key).value=saved[key];}
  $('description-count').textContent=saved.description.length+'/160';displayAvatar(profile.avatar);
  $('public-profile').href='https://digrabbithole.com/@'+encodeURIComponent(saved.handle);
  $('profile-data').hidden=false;
  if(scenario==='handle-taken'){$('profile-handle').value='taken_name';$('profile-handle').dispatchEvent(new Event('input'));}
 }catch{$('profile-unavailable').hidden=false;}
 finally{$('profile-loading').hidden=true;if(retryFocused&&dialog.open)($('profile-data').hidden?$('profile-retry'):$('profile-name')).focus();}
}
$('profile-retry').onclick=loadProfile;
const fmt=n=>n>0&&Math.round(n)===0?'Less than 1':Math.round(n).toLocaleString('en-US');
async function loadUsage(){
 const retryFocused=document.activeElement===$('usage-retry');
 $('usage-state').hidden=false;$('usage-state-label').textContent='Loading AI usage';$('usage-retry').hidden=true;$('usage-ready').hidden=true;
 try{
  const u=await api.loadUsage();
  if(!u||u.unavailable||!['allowanceCredits','usedCredits','reservedCredits','remainingCredits'].every(k=>typeof u[k]==='number'&&Number.isFinite(u[k])&&u[k]>=0)||u.allowanceCredits===0||!u.resetsAt||Number.isNaN(Date.parse(u.resetsAt)))throw new Error('Invalid usage');
  const rows=[...$('usage-ready').querySelectorAll('.settings-row')];
  [u.allowanceCredits,u.usedCredits,u.reservedCredits,u.remainingCredits].forEach((v,i)=>rows[i].querySelector('.usage-value').textContent=fmt(v));
  rows[2].hidden=u.reservedCredits===0;$('remaining-value').toggleAttribute('data-empty',u.remainingCredits===0);
  let exhausted=$('usage-exhausted');if(!exhausted){exhausted=document.createElement('p');exhausted.id='usage-exhausted';exhausted.className='field-error';rows[3].querySelector('.row-copy').append(exhausted);}exhausted.textContent=u.remainingCredits===0?'No AI credits remaining.':'';
  const meter=$('usage-meter');meter.setAttribute('aria-valuemax',u.allowanceCredits);meter.setAttribute('aria-valuenow',Math.min(u.usedCredits,u.allowanceCredits));meter.setAttribute('aria-valuetext',fmt(u.usedCredits)+' used; '+fmt(u.reservedCredits)+' reserved; '+fmt(u.remainingCredits)+' remaining');
  const used=Math.min(100,u.usedCredits/u.allowanceCredits*100),reserved=Math.min(100-used,u.reservedCredits/u.allowanceCredits*100);
  meter.querySelector('.usage-used').style.width=used+'%';meter.querySelector('.usage-reserved').style.width=reserved+'%';
  $('renewal-date').textContent=new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(u.resetsAt));
  $('usage-note').hidden=u.enforced===true;
  const table=document.querySelector('.feature-table');table.querySelectorAll('.feature-row').forEach(n=>n.remove());
  const names={tutor:'Tutor',artifact:'Generated cards',image:'Images',ask:'Chat'},features=(u.byFeature||[]).filter(r=>r.usedCredits>0);
  for(const f of features){const row=document.createElement('div');row.className='feature-row';row.setAttribute('role','row');for(const text of [names[f.feature]||'Other',fmt(f.usedCredits)]){const cell=document.createElement('span');cell.setAttribute('role','cell');cell.textContent=text;row.append(cell);}table.append(row);}
  $('usage-no-activity').hidden=u.usedCredits!==0;table.hidden=!features.length;
  $('usage-state').hidden=true;$('usage-ready').hidden=false;
 }catch{$('usage-state-label').textContent='AI usage unavailable.';$('usage-retry').hidden=false;}
 finally{if(retryFocused&&dialog.open)($('usage-ready').hidden?$('usage-retry'):$('buy-credits')).focus();}
}
$('usage-retry').onclick=loadUsage;
if(params.get('analytics')==='blocked'){
 document.querySelectorAll('[data-choice="analytics"] button').forEach(b=>b.disabled=true);
 $('analytics-description').textContent='Off. Your browser asks sites not to track you.';
}
if(params.get('analytics')==='outdated'){
 const accepted=document.querySelector('[data-choice="analytics"] [data-value="accepted"]');accepted.textContent='Accept update';
 document.querySelectorAll('[data-choice="analytics"] button').forEach(b=>b.setAttribute('aria-pressed','false'));
 $('analytics-description').textContent='Public-board measurement stays off until you accept this update. Rejecting turns all optional analytics off.';
}
dialog.showModal();choosePane(params.get('pane')||document.querySelector('[data-settings-pane]')?.dataset.settingsPane||'profile');loadProfile();
if(document.querySelector('[data-settings-purchase]'))$('buy-credits').click();
})();
