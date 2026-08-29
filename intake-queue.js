(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
if(!sb)return;
let intakeChannel=null;
let alertAudioArmed=false;

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

async function injectDashboardQueue(force=false){
  const sid=shopId();
  if(!sid||!document.querySelector('.dash-head'))return;
  if(force)document.querySelector('[data-production-intake-queue]')?.remove();
  if(document.querySelector('[data-production-intake-queue]'))return;
  try{
    const items=await pendingIntakes();
    const wrap=document.createElement('button');
    wrap.type='button';wrap.dataset.productionIntakeQueue='1';
    wrap.className='priority-strip';
    wrap.style.width='100%';wrap.style.border='0';wrap.style.textAlign='left';wrap.style.cursor='pointer';
    wrap.innerHTML=`<span style="font-size:20px">📥</span><b>${items.length} Customer Intake${items.length===1?'':'s'} Waiting</b><span>Open secure intake queue ›</span>`;
    const target=document.querySelector('.dash-status')||document.querySelector('.dashboard-grid');
    target?.insertAdjacentElement('afterend',wrap);
  }catch(err){console.error('Could not load intake queue count',err);}
}

function intakeCard(i){
  const v=i.vehicle||{};
  const when=i.created_at?new Date(i.created_at).toLocaleString():'';
  return `<div class="list-item" style="align-items:flex-start">
    <div class="list-icon">📥</div>
    <div class="list-main">
      <b>${esc(i.customer_name)} — ${esc(vehicleText(v))}</b>
      <p>${esc(i.phone||'No phone')} ${i.email?`• ${esc(i.email)}`:''}<br>${esc(i.customer_states||'No complaint entered')}<br><span class="muted">${esc(i.address||i.current_location?.raw||'No service location')} ${when?`• ${esc(when)}`:''}</span></p>
      <div class="list-actions"><button class="btn btn-primary" data-convert-intake="${esc(i.id)}">Convert to Job</button><button class="btn btn-soft" data-close-intake="${esc(i.id)}">Close Intake</button></div>
    </div>
  </div>`;
}

async function openQueue(){
  try{
    const items=await pendingIntakes();
    document.querySelector('.modal-backdrop')?.remove();
    const d=document.createElement('div');d.className='modal-backdrop';
    d.innerHTML=`<div class="modal" style="max-width:880px"><div class="modal-head"><div><h2>Customer Intake Queue</h2><p class="small muted" style="margin:3px 0 0">These submissions are stored in Supabase and isolated to this shop.</p></div><button class="close-btn" data-close-intake-modal>×</button></div><div class="list">${items.length?items.map(intakeCard).join(''):'<div class="customer-card" style="text-align:center"><h3>No waiting intakes</h3><p class="muted">New customer link submissions will appear here.</p></div>'}</div></div>`;
    document.body.appendChild(d);
  }catch(err){notice(err.message||'Could not open intake queue.','bad');}
}

async function convertIntake(id,button){
  button.disabled=true;button.textContent='Converting…';
  try{
    const {data,error}=await sb.rpc('convert_intake_to_job',{p_intake_id:id});
    if(error)throw error;
    notice('Customer, vehicle, and job created in Supabase.','good');
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
    notice('Intake closed.','good');await openQueue();
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
  const convert=e.target.closest('[data-convert-intake]');if(convert){e.preventDefault();convertIntake(convert.dataset.convertIntake,convert);return;}
  const closeItem=e.target.closest('[data-close-intake]');if(closeItem){e.preventDefault();closeIntake(closeItem.dataset.closeIntake,closeItem);return;}
},true);

let scheduled=false;
new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;
  setTimeout(()=>{scheduled=false;injectDashboardQueue();startRealtimeIntakeAlerts();},80);
}).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('hashchange',()=>setTimeout(()=>{injectDashboardQueue(true);startRealtimeIntakeAlerts();},120));
window.addEventListener('beforeunload',stopRealtimeIntakeAlerts);
setTimeout(()=>{injectDashboardQueue();startRealtimeIntakeAlerts();},200);

})();

(() => {
  if (window.__MMAIntakeRepairLoaded) return;
  window.__MMAIntakeRepairLoaded = true;
  const s=document.createElement('script');
  s.src='intake-repair.js?v=20260828-2355';
  document.head.appendChild(s);
})();
