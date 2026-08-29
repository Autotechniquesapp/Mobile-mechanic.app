(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
if(!sb)return;
function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function notify(msg,type=''){document.querySelector('.integration-toast')?.remove();const d=document.createElement('div');d.className=`toast integration-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4500);}
async function invoke(fn,body){const {data,error}=await sb.functions.invoke(fn,{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data;}
async function statuses(){try{const d=await invoke('business-integrations',{action:'status'});return Object.fromEntries((d.integrations||[]).map(x=>[x.provider,x]));}catch{return {};}}
async function action(name,payload={}){return invoke('integration-actions',{action:name,...payload});}
function shopAndJob(jobId){const c=cache(),sid=c.session?.shopId,s=c.shops?.[sid],j=s?.jobs?.find(x=>String(x.id)===String(jobId));return {c,s,j};}
async function syncSchedule(jobId){const result=await invoke('calendar-sync',{action:'sync_job',job_id:jobId});try{await action('zapier.emit',{event:'job_scheduled',payload:{job_id:jobId}});}catch{}return result;}
async function saveScheduleAndSync(el){
  const jobId=el.dataset.job,sid=cache().session?.shopId;if(!jobId||!sid)return;
  const startVal=document.getElementById('scheduleStart')?.value;
  if(!startVal){notify('Pick a start time.','bad');return;}
  const hours=Math.max(.25,Number(document.getElementById('scheduleHours')?.value||1));
  const travel=Math.max(0,Number(document.getElementById('scheduleTravel')?.value||0));
  const buffer=Math.max(0,Number(document.getElementById('scheduleBuffer')?.value||15));
  const start=new Date(startVal);
  if(Number.isNaN(start.getTime())){notify('Pick a valid start time.','bad');return;}
  const end=new Date(start.getTime()+(hours*60+travel+buffer)*60000);
  const oldText=el.textContent;el.disabled=true;el.textContent='Saving…';
  try{
    const {error}=await sb.from('jobs').update({
      scheduled_start_at:start.toISOString(),scheduled_end_at:end.toISOString(),estimated_labor_hours:hours,
      travel_minutes:travel,buffer_minutes:buffer,schedule_notes:document.getElementById('scheduleNotes')?.value||''
    }).eq('id',jobId).eq('shop_id',sid);
    if(error)throw error;
    try{
      const sync=await syncSchedule(jobId);
      if(sync?.skipped)notify('Schedule saved. No external calendar is connected.','good');
      else notify('Schedule saved and calendar updated.','good');
    }catch(err){console.warn('Calendar sync failed',err);notify('Schedule saved. Calendar sync needs attention.','bad');}
    setTimeout(()=>{location.hash='#calendar';location.reload();},650);
  }catch(err){console.warn('Schedule save failed',err);notify(err?.message||'Could not save schedule.','bad');el.disabled=false;el.textContent=oldText;}
}
async function deliverQueuedMessages(){try{await invoke('message-delivery',{action:'deliver_queued',limit:10});}catch(e){console.warn('Queued message delivery is waiting for a connected email/SMS provider.',e);}}
function jobExportText(s,j){if(!j)return '';const v=j.vehicle||{};return [`${s?.name||'Shop'} - Service Record`,`Job: ${j.id||''}`,`Customer: ${j.customerName||''}`,`Vehicle: ${[v.year,v.make,v.model,v.trim].filter(Boolean).join(' ')}`,`VIN: ${v.vin||''}`,`Mileage: ${v.mileage||''}`,`Customer States: ${j.complaint||''}`,`Findings: ${j.findings||''}`,`Codes: ${j.codes||''}`,`Status: ${j.status||''}`,`Completed: ${j.completedAt||new Date().toISOString()}`].join('\n');}
async function completeJobSync(jobId){const {s,j}=shopAndJob(jobId),st=await statuses();if(!j)return;const text=jobExportText(s,j),name=`${[j.customerName,j.vehicle?.year,j.vehicle?.make,j.vehicle?.model,'service-record'].filter(Boolean).join('-').replace(/[^a-z0-9_-]+/gi,'-')}.txt`;try{if(st.google_drive?.status==='connected')await action('google_drive.upload_text',{name,text});else if(st.onedrive?.status==='connected')await action('onedrive.upload_text',{name,text});else if(st.dropbox?.status==='connected')await action('dropbox.upload_text',{name,text});}catch(e){console.warn('Service record backup failed',e);}try{if(j.customerId&&st.quickbooks?.status==='connected')await action('quickbooks.sync_customer',{customer_id:j.customerId});}catch(e){console.warn('QuickBooks customer sync failed',e);}try{if(j.customerId&&st.xero?.status==='connected')await action('xero.sync_contact',{customer_id:j.customerId});}catch(e){console.warn('Xero contact sync failed',e);}try{await action('zapier.emit',{event:'job_completed',payload:{job_id:jobId,customer_id:j.customerId||null}});}catch{}}
window.addEventListener('click',e=>{const el=e.target.closest?.('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='save-schedule'){e.preventDefault();e.stopImmediatePropagation();saveScheduleAndSync(el);return;}if(a==='complete-job'){const jobId=el.dataset.job||cache().session?.activeJobId;if(jobId)setTimeout(()=>completeJobSync(jobId),2200);}if(a==='save-estimate'){const jobId=el.dataset.job||cache().session?.activeJobId;if(jobId)setTimeout(()=>action('zapier.emit',{event:'estimate_saved',payload:{job_id:jobId}}).catch(()=>{}),1200);}},true);
window.addEventListener('submit',e=>{const form=e.target;if(form?.id!=='teamForm')return;const d=Object.fromEntries(new FormData(form));setTimeout(async()=>{await deliverQueuedMessages();try{await action('zapier.emit',{event:'staff_invited',payload:{email:String(d.email||'').trim()||null,role:String(d.role||'')||null}});}catch{}},1800);},true);
})();

// Free/open-source map loader. Kept separate so the core app remains provider-agnostic.
(() => {
  if (window.__MMAOpenMapLoader) return;
  window.__MMAOpenMapLoader = true;
  const addCss = href => {
    if ([...document.styleSheets].some(s => s.href && s.href.includes(href.split('/').pop()))) return;
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link);
  };
  const addScript = (src, done) => {
    const existing=[...document.scripts].find(s=>s.src===new URL(src,location.href).href);
    if(existing){if(done){if(src.includes('leaflet')&&window.L)done();else existing.addEventListener('load',done,{once:true});}return;}
    const script=document.createElement('script');script.src=src;script.onload=()=>done?.();document.head.appendChild(script);
  };
  addCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  addCss('open-map.css?v=20260828-2215');
  const start=()=>addScript('open-map.js?v=20260828-2215');
  if(window.L) start(); else addScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',start);
})();
