(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
if(!sb)return;
let intakeChannel=null;
let alertAudioArmed=false;
let queueInjecting=false;
let queuePollTimer=null;

function esc(v=''){return String(v).replace(/[&<>'\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[m]));}
function cache(){try{return JSON.parse(localStorage.getItem(DBKEY))||{};}catch{return {};}}
function shopId(){return cache().session?.shopId||null;}
function vehicleText(v={}){return [v.year,v.make,v.model,v.submodel].filter(Boolean).join(' ')||'Vehicle details pending';}
function notice(message,type=''){
  document.querySelector('.intake-queue-notice')?.remove();
  const d=document.createElement('div');d.className=`toast intake-queue-notice ${type}`;d.textContent=message;document.body.appendChild(d);setTimeout(()=>d.remove(),5200);
}
function armAudibleAlerts(){
  alertAudioArmed=true;
  try{
    if('speechSynthesis' in window){
      const u=new SpeechSynthesisUtterance('');u.volume=0;window.speechSynthesis.speak(u);
    }
  }catch{}
}
function speakNewCustomer(){
  try{navigator.vibrate?.([180,80,180]);}catch{}
  if(!('speechSynthesis' in window))return;
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance('New customer');
    u.rate=0.92;u.pitch=1;u.volume=1;u.lang='en-US';
    window.speechSynthesis.speak(u);
  }catch(err){console.warn('Spoken intake alert unavailable',err);}
}

async function pendingIntakes(){
  const sid=shopId();if(!sid)return [];
  const {data,error}=await sb.from('intake_submissions').select('*').eq('shop_id',sid).eq('status','new').order('created_at',{ascending:false});
  if(error)throw error;return data||[];
}

async function pendingIntakeCount(){
  const sid=shopId();if(!sid)return 0;
  const {count,error}=await sb.from('intake_submissions').select('id',{count:'exact',head:true}).eq('shop_id',sid).eq('status','new');
  if(error)throw error;return Number(count||0);
}

function renderQueueButton(count){
  if(!document.querySelector('.dash-head'))return;
  const existing=[...document.querySelectorAll('[data-production-intake-queue]')];
  existing.slice(1).forEach(el=>el.remove());
  let wrap=existing[0]||null;
  if(!wrap){
    wrap=document.createElement('button');
    wrap.type='button';wrap.dataset.productionIntakeQueue='1';
    wrap.className='priority-strip';
    wrap.style.width='100%';wrap.style.border='0';wrap.style.textAlign='left';wrap.style.cursor='pointer';
    const target=document.querySelector('.dash-status')||document.querySelector('.dashboard-grid');
    target?.insertAdjacentElement('afterend',wrap);
  }
  if(!wrap)return;
  wrap.innerHTML=`<span style="font-size:20px">📥</span><b>${count} Customer Intake${count===1?'':'s'} Waiting</b><span>Open intake queue ›</span>`;
  wrap.dataset.intakeCount=String(count);
}

async function injectDashboardQueue(force=false){
  const sid=shopId();
  if(!sid||!document.querySelector('.dash-head')||document.hidden)return;
  if(queueInjecting)return;
  queueInjecting=true;
  try{
    const count=await pendingIntakeCount();
    renderQueueButton(count);
  }catch(err){console.error('Could not load intake queue count',err);}
  finally{queueInjecting=false;}
}

async function refreshQueueOnResume(){
  if(document.hidden)return;
  await injectDashboardQueue(true);
  startRealtimeIntakeAlerts();
}

function startVisiblePolling(){
  if(queuePollTimer)return;
  queuePollTimer=setInterval(()=>{
    if(!document.hidden&&document.hasFocus()&&document.querySelector('.dash-head'))injectDashboardQueue(true);
  },60000);
}
function stopVisiblePolling(){
  if(queuePollTimer){clearInterval(queuePollTimer);queuePollTimer=null;}
}

function aiList(items=[]){return Array.isArray(items)&&items.length?`<ul style="margin:6px 0 0;padding-left:18px">${items.slice(0,6).map(x=>`<li style="margin:3px 0">${esc(typeof x==='string'?x:(x?.cause||x?.test||''))}</li>`).join('')}</ul>`:'';}
function aiWorkupMarkup(i){
  const status=String(i.ai_status||'pending');
  const w=i.ai_workup||null;
  if(status==='complete'&&w){
    const causes=Array.isArray(w.likely_causes)?w.likely_causes.slice(0,5):[];
    const tests=Array.isArray(w.diagnostic_tests)?w.diagnostic_tests.slice(0,5):[];
    const safety=w.safety||{};
    return `<div style="margin-top:10px;border:1px solid #5c2227;background:#11161c;border-radius:10px;padding:10px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><b style="color:#ff6b70">🤖 AI PRE-WORKUP</b><span class="badge red">PRELIMINARY</span></div>
      <p style="margin:7px 0 0"><b>Assessment:</b> ${esc(w.summary||'Preliminary assessment ready.')}</p>
      ${causes.length?`<div style="margin-top:7px"><b>Likely causes</b><ul style="margin:5px 0 0;padding-left:18px">${causes.map(c=>`<li style="margin:4px 0"><b>${esc(c.cause||'Possible cause')}</b>${c.likelihood?` <span class="muted">(${esc(c.likelihood)})</span>`:''}${c.why?` — ${esc(c.why)}`:''}</li>`).join('')}</ul></div>`:''}
      ${Array.isArray(w.first_checks)&&w.first_checks.length?`<div style="margin-top:7px"><b>First checks</b>${aiList(w.first_checks)}</div>`:''}
      ${tests.length?`<div style="margin-top:7px"><b>Confirmation tests</b><ul style="margin:5px 0 0;padding-left:18px">${tests.map(t=>`<li style="margin:4px 0"><b>${esc(t.test||'Test')}</b>${t.what_to_watch?` — watch for ${esc(t.what_to_watch)}`:''}${t.meaning?` <span class="muted">(${esc(t.meaning)})</span>`:''}</li>`).join('')}</ul></div>`:''}
      ${Array.isArray(w.do_not_overlook)&&w.do_not_overlook.length?`<div style="margin-top:7px"><b>Do not overlook</b>${aiList(w.do_not_overlook)}</div>`:''}
      ${safety.note?`<div style="margin-top:8px;padding:7px 8px;border-left:3px solid #ef2a31;background:#1a1012;border-radius:6px"><b>Safety — ${esc(safety.level||'check')}:</b> ${esc(safety.note)}</div>`:''}
      <p class="small muted" style="margin:8px 0 0">AI pre-workup only. Mechanic must verify the diagnosis before repair or estimate.</p>
    </div>`;
  }
  if(status==='processing')return `<div style="margin-top:9px;padding:9px;border:1px solid #303945;border-radius:9px"><b>🤖 AI pre-workup:</b> analyzing customer concern…</div>`;
  if(status==='error')return `<div style="margin-top:9px;padding:9px;border:1px solid #7a282d;background:#1a1012;border-radius:9px"><b>🤖 AI pre-workup could not finish.</b><div class="small muted" style="margin-top:4px">${esc(i.ai_error||'AI service error.')}</div><button class="btn btn-soft" style="margin-top:8px" data-retry-intake-ai="${esc(i.id)}">Retry AI Workup</button></div>`;
  return `<div style="margin-top:9px;padding:9px;border:1px solid #303945;border-radius:9px"><b>🤖 AI pre-workup:</b> queued for analysis… <button class="btn btn-soft" style="margin-left:6px" data-retry-intake-ai="${esc(i.id)}">Run Now</button></div>`;
}

function intakeCard(i){
  const v=i.vehicle||{};
  const when=i.created_at?new Date(i.created_at).toLocaleString():'';
  return `<div class="list-item" style="align-items:flex-start">
    <div class="list-icon">📥</div>
    <div class="list-main">
      <b>${esc(i.customer_name)} — ${esc(vehicleText(v))}</b>
      <p>${esc(i.phone||'No phone')} ${i.email?`• ${esc(i.email)}`:''}<br><b>Customer states:</b> ${esc(i.customer_states||'No complaint entered')}<br><span class="muted">${esc(i.address||i.current_location?.raw||'No service location')} ${i.availability?`• Preferred: ${esc(i.availability)}`:''} ${when?`• ${esc(when)}`:''}</span></p>
      ${aiWorkupMarkup(i)}
      <div class="list-actions" style="margin-top:10px"><button class="btn btn-primary" data-convert-intake="${esc(i.id)}">Convert to Job</button><button class="btn btn-soft" data-close-intake="${esc(i.id)}">Close Intake</button></div>
    </div>
  </div>`;
}

async function openQueue(){
  try{
    const items=await pendingIntakes();
    renderQueueButton(items.length);
    document.querySelector('.modal-backdrop')?.remove();
    const d=document.createElement('div');d.className='modal-backdrop';d.dataset.intakeQueueModal='1';
    d.innerHTML=`<div class="modal" style="max-width:880px"><div class="modal-head"><div><h2>Customer Intake Queue</h2><p class="small muted" style="margin:3px 0 0">Review the customer concern and AI preliminary workup before converting it to a job.</p></div><button class="close-btn" data-close-intake-modal>×</button></div><div class="list">${items.length?items.map(intakeCard).join(''):'<div class="customer-card" style="text-align:center"><h3>No waiting intakes</h3><p class="muted">New customer link submissions will appear here.</p></div>'}</div></div>`;
    document.body.appendChild(d);
  }catch(err){notice(err.message||'Could not open intake queue.','bad');}
}

async function retryAiWorkup(id,button){
  if(!id||button?.disabled)return;
  const original=button?.textContent||'Retry AI Workup';
  if(button){button.disabled=true;button.textContent='Analyzing…';}
  try{
    const {data,error}=await sb.functions.invoke('intake-ai-workup',{body:{intake_id:id}});
    if(error)throw new Error(error.message||'AI workup request failed.');
    if(data?.error)throw new Error(data.error);
    notice('AI pre-workup refreshed.','good');
    await openQueue();
  }catch(err){if(button){button.disabled=false;button.textContent=original;}notice(err.message||'AI workup failed.','bad');}
}

async function convertIntake(id,button){
  button.disabled=true;button.textContent='Converting…';
  try{
    const {data,error}=await sb.rpc('convert_intake_to_job',{p_intake_id:id});
    if(error)throw error;
    notice('Customer, vehicle, job, and AI workup carried forward.','good');
    document.querySelector('.modal-backdrop')?.remove();
    const c=cache();
    if(c.session){c.session.activeJobId=data;localStorage.setItem(DBKEY,JSON.stringify(c));}
    location.hash='#jobs';location.reload();
  }catch(err){button.disabled=false;button.textContent='Convert to Job';notice(err.message||'Could not convert intake.','bad');}
}

async function closeIntake(id,button){
  button.disabled=true;
  try{
    const {error}=await sb.from('intake_submissions').update({status:'closed',updated_at:new Date().toISOString()}).eq('id',id).eq('shop_id',shopId());
    if(error)throw error;
    notice('Intake closed.','good');await openQueue();await injectDashboardQueue(true);
  }catch(err){button.disabled=false;notice(err.message||'Could not close intake.','bad');}
}

function startRealtimeIntakeAlerts(){
  const sid=shopId();
  if(!sid||intakeChannel)return;
  intakeChannel=sb.channel(`shop-intakes-${sid}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'intake_submissions',filter:`shop_id=eq.${sid}`},payload=>{
      const i=payload.new||{};
      notice(`📥 New customer intake: ${i.customer_name||'Customer'} — ${vehicleText(i.vehicle||{})}`,'good');
      speakNewCustomer();
      injectDashboardQueue(true);
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'intake_submissions',filter:`shop_id=eq.${sid}`},()=>{
      injectDashboardQueue(true);
      if(document.querySelector('[data-intake-queue-modal]'))openQueue();
    })
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('Intake realtime notification unavailable:',status);
    });
}

function stopRealtimeIntakeAlerts(){
  if(intakeChannel){sb.removeChannel(intakeChannel);intakeChannel=null;}
}

document.addEventListener('pointerdown',armAudibleAlerts,{once:true,capture:true});
document.addEventListener('keydown',armAudibleAlerts,{once:true,capture:true});
document.addEventListener('click',e=>{
  const q=e.target.closest('[data-production-intake-queue]');if(q){e.preventDefault();openQueue();return;}
  const close=e.target.closest('[data-close-intake-modal]');if(close){document.querySelector('.modal-backdrop')?.remove();return;}
  const retry=e.target.closest('[data-retry-intake-ai]');if(retry){e.preventDefault();retryAiWorkup(retry.dataset.retryIntakeAi,retry);return;}
  const convert=e.target.closest('[data-convert-intake]');if(convert){e.preventDefault();convertIntake(convert.dataset.convertIntake,convert);return;}
  const closeItem=e.target.closest('[data-close-intake]');if(closeItem){e.preventDefault();closeIntake(closeItem.dataset.closeIntake,closeItem);return;}
},true);

let scheduled=false;
new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;
  setTimeout(()=>{scheduled=false;if(!document.hidden){injectDashboardQueue();startRealtimeIntakeAlerts();}},100);
}).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('hashchange',()=>setTimeout(refreshQueueOnResume,150));
window.addEventListener('focus',refreshQueueOnResume);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVisiblePolling();}else{refreshQueueOnResume();startVisiblePolling();}});
window.addEventListener('beforeunload',()=>{stopVisiblePolling();stopRealtimeIntakeAlerts();});
setTimeout(()=>{refreshQueueOnResume();startVisiblePolling();},250);

})();

(() => {
  if (window.__MMAIntakeRepairLoaded) return;
  window.__MMAIntakeRepairLoaded = true;
  const s=document.createElement('script');
  s.src='intake-repair.js?v=20260828-2355';
  document.head.appendChild(s);
})();
