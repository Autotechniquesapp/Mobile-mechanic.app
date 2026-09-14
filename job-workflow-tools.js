(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
let recognition=null;
let listening=false;
let saveTimer=null;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function write(db){try{localStorage.setItem(DBKEY,JSON.stringify(db));}catch{}}
function context(){
  const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null;
  const job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));
  const customer=shop?.customers?.find(c=>String(c.id)===String(job?.customerId||job?.customer_id||''))||
    shop?.customers?.find(c=>String(c.name||'').toLowerCase()===String(job?.customerName||job?.customer_name||'').toLowerCase())||null;
  return {db,sid,shop,job,customer};
}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2600);}
function locationText(job,customer){
  const loc=job?.serviceAddress||job?.service_address||job?.address||job?.jobAddress||job?.job_address||job?.location?.address||customer?.serviceAddress||customer?.service_address||customer?.address||'';
  if(typeof loc==='string'&&loc.trim())return loc.trim();
  const lat=job?.lat??job?.latitude??job?.location?.lat??customer?.lat??customer?.latitude;
  const lng=job?.lng??job?.longitude??job?.location?.lng??customer?.lng??customer?.longitude;
  if(Number.isFinite(Number(lat))&&Number.isFinite(Number(lng)))return `${Number(lat)},${Number(lng)}`;
  return '';
}
function mapUrl(name,where){
  const q=where?`${name} near ${where}`:name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function supplierMarkup(where){
  const names=['AutoZone','O’Reilly Auto Parts','NAPA Auto Parts','Advance Auto Parts','Dealership Parts'];
  return `<div class="jwt-supplier-grid">${names.map(name=>`<a class="jwt-supplier" href="${esc(mapUrl(name,where))}" target="_blank" rel="noopener"><b>${esc(name)}</b><span>Find / call / navigate in Google Maps</span></a>`).join('')}</div>`;
}
function speechSupported(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition);}
async function saveFindings(text,{quiet=false}={}){
  const {db,sid,shop,job}=context();if(!job)return;
  job.findings=text;
  if(shop&&sid){db.shops[sid]=shop;write(db);}
  if(sb&&job.id){
    try{
      const r=await sb.from('jobs').update({findings:text,updated_at:new Date().toISOString()}).eq('id',job.id);
      if(r.error)throw r.error;
      if(!quiet)toast('Findings saved.','good');
    }catch(err){if(!quiet)toast(err?.message||'Could not save findings.','bad');}
  }else if(!quiet){toast('Findings saved on this device.','good');}
}
function queueSave(text){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveFindings(text,{quiet:true}),700);}
function textarea(){return document.querySelector('[data-jwt-findings]');}
function setListeningUI(on){
  listening=on;
  const btn=document.querySelector('[data-jwt-voice]');
  if(btn){btn.classList.toggle('live',on);btn.textContent=on?'■ Stop Listening':'🎤 Speak Findings';}
  const state=document.querySelector('[data-jwt-voice-state]');if(state)state.textContent=on?'Listening… speak naturally.':'Tap the mic and talk. Your words go into Findings.';
}
function startVoice(){
  if(!speechSupported()){toast('Voice dictation is not supported in this browser.','bad');return;}
  if(listening){try{recognition?.stop();}catch{}return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang='en-US';
  let base=textarea()?.value?.trim()||'';
  recognition.onstart=()=>setListeningUI(true);
  recognition.onerror=e=>{setListeningUI(false);toast(e.error==='not-allowed'?'Microphone permission is blocked. Allow microphone access and try again.':`Voice error: ${e.error||'unknown'}`,'bad');};
  recognition.onend=()=>setListeningUI(false);
  recognition.onresult=ev=>{
    let finalText='',interim='';
    for(let i=ev.resultIndex;i<ev.results.length;i++){
      const t=ev.results[i][0]?.transcript?.trim()||'';
      if(ev.results[i].isFinal)finalText+=(finalText?' ':'')+t;else interim+=(interim?' ':'')+t;
    }
    if(finalText){base=[base,finalText].filter(Boolean).join(base?'. ':'');const box=textarea();if(box){box.value=base;box.dispatchEvent(new Event('input',{bubbles:true}));queueSave(base);}}
    const preview=document.querySelector('[data-jwt-interim]');if(preview)preview.textContent=interim;
  };
  try{recognition.start();}catch(err){setListeningUI(false);toast(err?.message||'Could not start microphone.','bad');}
}
function addFindingAsWork(){
  const text=textarea()?.value?.trim();if(!text)return toast('Enter a finding first.','bad');
  const add=[...document.querySelectorAll('[data-jwo-add="work"]')][0];
  if(!add)return toast('Open the work order first.','bad');
  const originalPrompt=window.prompt;
  window.prompt=(message)=>/Add work item/i.test(message||'')?text:originalPrompt(message);
  try{add.click();}finally{window.prompt=originalPrompt;}
}
function mount(){
  const workOrder=document.querySelector('[data-job-work-order]');
  if(!workOrder||document.querySelector('[data-job-workflow-tools]'))return;
  const {job,customer}=context();if(!job)return;
  injectCss();
  const where=locationText(job,customer);
  const findings=job.findings||'';
  const sec=document.createElement('section');sec.className='jwt';sec.dataset.jobWorkflowTools='1';
  sec.innerHTML=`
    <div class="jwt-head"><div><div class="eyebrow">MECHANIC TOOLS</div><h3>Findings &amp; Parts Run</h3></div></div>
    <div class="jwt-card">
      <div class="jwt-title"><b>Technician Findings</b><span data-jwt-voice-state>${speechSupported()?'Tap the mic and talk. Your words go into Findings.':'Voice dictation is unavailable in this browser.'}</span></div>
      <textarea data-jwt-findings rows="4" placeholder="Example: Front pads worn to 2 mm, rotors have heavy runout, right-front caliper is sticking.">${esc(findings)}</textarea>
      <div class="jwt-interim" data-jwt-interim></div>
      <div class="jwt-actions"><button type="button" class="btn btn-primary" data-jwt-voice ${speechSupported()?'':'disabled'}>🎤 Speak Findings</button><button type="button" class="btn btn-soft" data-jwt-save>Save Findings</button><button type="button" class="btn btn-soft" data-jwt-add-work>Add Findings as Work Item</button></div>
    </div>
    <div class="jwt-card">
      <div class="jwt-title"><b>Nearby Parts Suppliers</b><span>${where?`Searching around ${esc(where)}`:'Uses Google Maps near your current area.'}</span></div>
      ${supplierMarkup(where)}
      <p class="jwt-note">These buttons open Google Maps so you can see the closest store, hours, phone number, and navigation. Live inventory/pricing still requires a supplier integration, so the app does not fake stock or prices.</p>
    </div>`;
  const complaint=workOrder.querySelector('.jwo-complaint');
  if(complaint)complaint.insertAdjacentElement('afterend',sec);else workOrder.appendChild(sec);
}
function injectCss(){if(document.getElementById('job-workflow-tools-style'))return;const s=document.createElement('style');s.id='job-workflow-tools-style';s.textContent=`
.jwt{margin:10px 0}.jwt-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.jwt-head h3{margin:2px 0 0;font-size:14px}.jwt-card{background:#0a0e13;border:1px solid #303841;border-radius:10px;padding:11px;margin-top:8px}.jwt-title{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}.jwt-title b{font-size:12px}.jwt-title span{font-size:10px;color:#8e99a5}.jwt textarea{width:100%;margin-top:8px;background:#111820;color:#f4f6f8;border:1px solid #39434d;border-radius:9px;padding:9px;resize:vertical;min-height:96px}.jwt-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.jwt-actions .live{background:#7b1117!important;border-color:#ff4b50!important;box-shadow:0 0 0 2px rgba(239,42,49,.18)}.jwt-interim{font-size:10px;color:#8e99a5;min-height:14px;margin-top:4px;font-style:italic}.jwt-supplier-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.jwt-supplier{display:block;text-decoration:none;background:#111820;border:1px solid #39434d;border-radius:9px;padding:9px;color:#fff}.jwt-supplier b,.jwt-supplier span{display:block}.jwt-supplier b{font-size:12px}.jwt-supplier span{font-size:9px;color:#9aa4b0;margin-top:3px}.jwt-note{margin:9px 0 0;font-size:9px;color:#8e99a5;line-height:1.4}@media(max-width:620px){.jwt-supplier-grid{grid-template-columns:1fr}.jwt-actions .btn{flex:1;min-width:130px}}
`;document.head.appendChild(s);}

document.addEventListener('click',e=>{
  const voice=e.target.closest?.('[data-jwt-voice]');if(voice){e.preventDefault();startVoice();return;}
  const save=e.target.closest?.('[data-jwt-save]');if(save){e.preventDefault();saveFindings(textarea()?.value||'');return;}
  const add=e.target.closest?.('[data-jwt-add-work]');if(add){e.preventDefault();addFindingAsWork();return;}
},true);
document.addEventListener('input',e=>{if(e.target.matches?.('[data-jwt-findings]'))queueSave(e.target.value);},true);
new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{try{recognition?.stop();}catch{}setTimeout(mount,100);});
setTimeout(mount,1100);
})();
