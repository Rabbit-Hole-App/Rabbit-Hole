/* Integration boundary: the host opts into the same-origin adapter. Clean previews use deterministic local fixtures.
   Handle availability is authoritative only on explicit Save: PUT /api/profile returns 409 {taken:true}.
   Never call PUT while typing or treat a failed check as an available handle. */
(() => {
 const error=(message,status=0,taken=false)=>Object.assign(new Error(message),{status,taken});
 window.createSettingsApi=(request=window.fetch.bind(window))=>{
  const send=async(path,options={})=>{
   let response;try{response=await request(path,{credentials:'same-origin',cache:'no-store',...options});}catch{throw error('Could not connect. Try again.');}
   let body;try{body=await response.json();}catch{throw error('Could not read the response. Try again.',response.status);}
   if(!response.ok)throw error(body.error||'Could not save. Try again.',response.status,body.taken===true);
   if(body.unavailable)throw error('AI usage unavailable.',503);
   return body;
  };
  return {loadProfile:()=>send('/api/profile'),saveProfile:patch=>send('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}),loadUsage:()=>send('/api/learn/usage')};
 };
 window.createSettingsDemoApi=(scenario='ready')=>{
  let profile={name:'Yudhisteer Chintaram',handle:'yudhisteer',description:'',avatar:null};const calls={};
  const wait=()=>new Promise(resolve=>setTimeout(resolve,scenario==='loading'?1600:450));
  const first=key=>{calls[key]=(calls[key]||0)+1;return calls[key]===1;};
  return {
   async loadProfile(){await wait();if(scenario==='profile-unavailable'&&first('profile'))throw error('Profile unavailable. Try again.',503);return {...profile};},
   async saveProfile(patch){await wait();
    if(patch.handle?.toLowerCase()==='taken_name')throw error('@taken_name is taken. Choose another.',409,true);
    if(scenario==='save-failure'&&first('save'))throw error('Could not save. Try again.',503);
    if(scenario==='avatar-failure'&&'avatar' in patch&&first('avatar'))throw error('Picture could not be uploaded. Try again.',503);
    profile={...profile,...patch};return {...profile};
   },
   async loadUsage(){await wait();if(scenario==='usage-unavailable'&&first('usage'))throw error('AI usage unavailable.',503);
    const empty=scenario==='usage-empty',exhausted=scenario==='usage-exhausted';
    return {allowanceCredits:10000,usedCredits:empty?0:exhausted?10000:3000,reservedCredits:empty||exhausted?0:250,remainingCredits:empty?10000:exhausted?0:6750,enforced:true,resetsAt:new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()+1,1)).toISOString(),byFeature:empty?[]:[{feature:'tutor',usedCredits:exhausted?10000:1450,reservedCredits:0},{feature:'artifact',usedCredits:exhausted?0:900,reservedCredits:0},{feature:'image',usedCredits:exhausted?0:450,reservedCredits:0},{feature:'ask',usedCredits:exhausted?0:200,reservedCredits:0}]};
   },
   async savePreference(){await wait();if(scenario==='preference-failure'&&first('preference'))throw error('Not saved. Try again.',503);}
  };
 };
})();
