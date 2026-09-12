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
async function completeJobSync(jobId){const {s,j}=shopAndJob(jobId),st=await statuses();if(!j)return;const text=jobExportText(s,j),name=`${[j.customerName,j.vehicle?.year,j.vehicle?.make,j.vehicle?.model,'service-record'].filter(Boolean).join('-').replace(/[^a-z0-9_-]+/gi,'-')}.txt`;try{if(st.google_drive?.status==='connected')await action('google_drive.upload_text',{name,text});else if(st.onedrive?.status==='connected')await action('onedrive.upload_text',{name,text});}catch(e){console.warn('Service record backup failed',e);}try{if(j.customerId&&st.quickbooks?.status==='connected')await action('quickbooks.sync_customer',{customer_id:j.customerId});}catch(e){console.warn('QuickBooks customer sync failed',e);}try{if(j.customerId&&st.xero?.status==='connected')await action('xero.sync_contact',{customer_id:j.customerId});}catch(e){console.warn('Xero contact sync failed',e);}try{await action('zapier.emit',{event:'job_completed',payload:{job_id:jobId,customer_id:j.customerId||null}});}catch{}}
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

// Microsoft 365 UI bridge. The production OAuth/actions already support Outlook
// Calendar, Microsoft email and OneDrive. This keeps the integrations screen in
// sync with the real backend state and replaces the old OneDrive request button
// with real account authorization controls.
(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
if(!sb)return;
let busy=false,timer=null;
const labels={
  microsoft_calendar:'Microsoft 365 / Outlook Calendar',
  microsoft_email:'Microsoft 365 / Outlook Email',
  onedrive:'Microsoft OneDrive'
};
function panel(){return document.querySelector('[data-business-integrations-panel]');}
function needsPatch(p){
  if(!p)return false;
  if(p.querySelector('[data-onedrive-learn-more]'))return true;
  return Object.entries(labels).some(([provider,label])=>{
    const item=p.querySelector(`[data-business-details="${provider}"]`)?.closest('.list-item');
    const title=item?.querySelector('.list-main > b');
    return !!title&&!title.textContent.includes(label);
  });
}
function setTitle(item,label){
  const title=item?.querySelector('.list-main > b');if(!title)return;
  const badge=title.querySelector('.badge')?.outerHTML||'';
  title.innerHTML=`${label} ${badge}`;
}
function setBadge(item,row){
  const badge=item?.querySelector('.badge');if(!badge)return;
  let status=row?.status||'not_connected';if(status==='not_connected'&&!row?.configured)status='needs_keys';
  const text={connected:'Connected',connecting:'Connecting',needs_keys:'Needs setup',needs_attention:'Needs attention',disabled:'Disabled',not_connected:'Not connected'}[status]||status;
  badge.textContent=text;
  badge.classList.remove('green','orange','red');
  badge.classList.add(status==='connected'?'green':status==='needs_attention'?'orange':'red');
}
function patchProvider(p,provider,row,itemOverride=null){
  const details=p.querySelector(`[data-business-details="${provider}"]`);const item=itemOverride||details?.closest('.list-item');if(!item)return;
  setTitle(item,labels[provider]||row?.name||provider);setBadge(item,row);
  if(provider==='microsoft_email'){
    const note=item.querySelector('.list-main > p');if(note)note.textContent='Send estimates, invoices and follow-ups from the shop\'s Outlook / Microsoft 365 mailbox.';
  }
  if(provider==='microsoft_calendar'){
    const note=item.querySelector('.list-main > p');if(note)note.textContent='Sync scheduled jobs to the shop\'s Outlook / Microsoft 365 calendar.';
  }
  if(provider!=='onedrive')return;
  const old=item.querySelector('[data-onedrive-learn-more]');
  if(old){old.removeAttribute('data-onedrive-learn-more');old.classList.remove('btn-primary');old.classList.add('btn-soft');}
  const button=old||item.querySelector('[data-business-connect="onedrive"],[data-business-disconnect="onedrive"]');if(!button)return;
  const detail=item.querySelector('[data-business-details]');if(detail)detail.dataset.businessDetails='onedrive';
  button.removeAttribute('data-business-connect');button.removeAttribute('data-business-disconnect');
  if(row?.status==='connected'){
    button.dataset.businessDisconnect='onedrive';button.textContent='Disconnect';button.classList.remove('btn-primary');button.classList.add('btn-soft');
  }else{
    button.dataset.businessConnect='onedrive';button.textContent=row?.configured?'Connect OneDrive':'Setup Required';
    button.classList.toggle('btn-primary',!!row?.configured);button.classList.toggle('btn-soft',!row?.configured);
  }
  const note=item.querySelector('.list-main > p');if(note)note.textContent='Back up completed service records, invoices, receipts and reports to the shop\'s Microsoft OneDrive.';
}
async function patchMicrosoft(){
  const p=panel();if(!p||busy||!needsPatch(p))return;busy=true;
  try{
    const {data,error}=await sb.functions.invoke('business-integrations',{body:{action:'status'}});if(error||data?.error)return;
    const rows=Object.fromEntries((data?.integrations||[]).map(row=>[row.provider,row]));
    ['microsoft_calendar','microsoft_email'].forEach(provider=>patchProvider(p,provider,rows[provider]||{}));
    const legacyOneDrive=p.querySelector('[data-onedrive-learn-more]')?.closest('.list-item');
    patchProvider(p,'onedrive',rows.onedrive||{},legacyOneDrive);
    const body=p.querySelector('[data-business-integrations-body]');
    if(body&&!body.querySelector('[data-microsoft365-note]')){
      const note=document.createElement('div');note.dataset.microsoft365Note='1';note.className='section-note';note.style.margin='8px 0 12px';note.textContent='Microsoft 365 can connect Outlook Calendar, Outlook email and OneDrive separately so each shop grants only the permissions it wants.';body.prepend(note);
    }
  }catch(err){console.warn('Microsoft 365 integration status could not be refreshed.',err);}finally{busy=false;}
}
function schedule(){clearTimeout(timer);timer=setTimeout(patchMicrosoft,120);}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);
setTimeout(schedule,900);
})();

// Square context bridge. Square remains the source of truth for the payment,
// while Mobile Mechanic AI surfaces that payment beside the matching customer
// and job. Payment never auto-completes a repair because deposits can be paid
// before the work itself is finished.
(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
if(!sb)return;
const DBKEY='mobile_mechanic_ai_approved_v7';
let busy=false,timer=null,lastLoaded=0,state=null;
function local(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=local(),sid=db.session?.shopId||null,shop=sid?db.shops?.[sid]:null,user=shop?.users?.find?.(u=>String(u.id)===String(db.session?.userId));return {db,sid,shop,user};}
function canView(){const {db,user}=context();return db.session?.role==='platform_owner'||['owner','manager','service_writer'].includes(String(user?.role||''));}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function ensureStyles(){if(document.getElementById('mmaSquareContextStyles'))return;const style=document.createElement('style');style.id='mmaSquareContextStyles';style.textContent=`.mma-square-context{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:7px}.mma-square-pill{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(34,163,90,.55);background:rgba(22,122,61,.13);color:#baf1cd;border-radius:999px;padding:4px 8px;font-size:.78rem;font-weight:800}.mma-square-pill.due{border-color:rgba(239,157,42,.55);background:rgba(239,157,42,.11);color:#ffd89a}.mma-square-payment-card{margin-top:10px!important;border-color:rgba(34,163,90,.5)!important}.mma-square-payment-card h3{display:flex;justify-content:space-between;gap:10px;align-items:center}`;document.head.appendChild(style);}
async function load(force=false){
  if(!canView())return null;
  const {sid}=context();if(!sid)return null;
  if(state&&!force&&Date.now()-lastLoaded<5000)return state;
  if(busy)return state;busy=true;
  try{
    const [paymentsResult,invoicesResult]=await Promise.all([
      sb.from('payment_transactions').select('local_customer_id,local_invoice_id,status,amount,refunded,paid_at').eq('shop_id',sid).eq('provider','square').eq('status','COMPLETED').order('paid_at',{ascending:false}),
      sb.from('invoices').select('id,job_id,status,total,paid_at,processor_status,processor_metadata').eq('shop_id',sid).eq('payment_processor','square').order('updated_at',{ascending:false})
    ]);
    if(paymentsResult.error)throw paymentsResult.error;if(invoicesResult.error)throw invoicesResult.error;
    const customer=new Map(),job=new Map(),invoiceById=new Map((invoicesResult.data||[]).map(row=>[String(row.id),row]));
    for(const payment of paymentsResult.data||[]){
      if(!payment.local_customer_id)continue;const key=String(payment.local_customer_id),cur=customer.get(key)||{count:0,net:0,last:null};cur.count++;cur.net+=Math.max(0,Number(payment.amount||0)-Number(payment.refunded||0));if(!cur.last&&payment.paid_at)cur.last=payment.paid_at;customer.set(key,cur);
    }
    for(const invoice of invoicesResult.data||[]){
      if(!invoice.job_id)continue;const key=String(invoice.job_id),paid=Number(invoice.processor_metadata?.total_paid||0),remaining=Math.max(0,Number(invoice.processor_metadata?.remaining_calculated??(Number(invoice.total||0)-paid))),status=String(invoice.processor_status||invoice.status||'').toUpperCase();const current=job.get(key)||{total:0,paid:0,due:0,paidAt:null,statuses:[]};current.total+=Number(invoice.total||0);current.paid+=status==='PAID'&&paid<=0?Number(invoice.total||0):paid;current.due+=remaining;current.statuses.push(status);if(invoice.paid_at&&(!current.paidAt||new Date(invoice.paid_at)>new Date(current.paidAt)))current.paidAt=invoice.paid_at;job.set(key,current);
    }
    for(const payment of paymentsResult.data||[]){
      const invoice=payment.local_invoice_id?invoiceById.get(String(payment.local_invoice_id)):null;if(!invoice?.job_id)continue;const current=job.get(String(invoice.job_id));if(current&&current.paid<=0)current.paid+=Math.max(0,Number(payment.amount||0)-Number(payment.refunded||0));
    }
    state={customer,job};lastLoaded=Date.now();return state;
  }catch(err){console.warn('Square customer/job payment context unavailable.',err);return null;}finally{busy=false;}
}
function setContext(host,text,due=false){
  if(!host)return;let box=host.querySelector(':scope > .mma-square-context');if(!box){box=document.createElement('div');box.className='mma-square-context';host.appendChild(box);}box.innerHTML=`<span class="mma-square-pill${due?' due':''}">${text}</span>`;
}
function clearContext(){document.querySelectorAll('.mma-square-context,.mma-square-payment-card').forEach(node=>node.remove());}
async function render(force=false){
  if(!canView()){clearContext();return;}ensureStyles();const data=await load(force);if(!data)return;
  document.querySelectorAll('[data-open-customer-intake]').forEach(tile=>{
    const row=data.customer.get(String(tile.dataset.openCustomerIntake||''));const host=tile.querySelector('.list-main')||tile;if(!row){host.querySelector(':scope > .mma-square-context')?.remove();return;}const when=row.last?` · last ${new Date(row.last).toLocaleDateString()}`:'';setContext(host,`Square collected ${money(row.net)} · ${row.count} payment${row.count===1?'':'s'}${when}`);
  });
  const jobNodes=[...document.querySelectorAll('[data-open-job],.mmp-job-row[data-job],[data-mma-completed-open]')];
  jobNodes.forEach(tile=>{
    const id=tile.dataset.openJob||tile.dataset.job||tile.dataset.mmaCompletedOpen,row=data.job.get(String(id||''));const host=tile.querySelector('.list-main')||tile;if(!row){host.querySelector(':scope > .mma-square-context')?.remove();return;}const paid=row.statuses.some(x=>x==='PAID')&&row.due<=0;setContext(host,paid?`Square paid ${money(row.paid||row.total)}`:`Square ${money(row.paid)} paid · ${money(row.due)} due`,!paid);
  });
  const modal=document.querySelector('[data-job-tile-actions-modal] .modal');const active=context().db.session?.activeJobId,row=active?data.job.get(String(active)):null;
  if(modal){modal.querySelector('.mma-square-payment-card')?.remove();if(row){const paid=row.statuses.some(x=>x==='PAID')&&row.due<=0,card=document.createElement('div');card.className='work-card mma-square-payment-card';card.innerHTML=`<h3>Square Payment <span class="badge ${paid?'green':'orange'}">${paid?'Paid':'Balance'}</span></h3><p>${paid?`${money(row.paid||row.total)} collected in Square.`:`${money(row.paid)} collected · ${money(row.due)} remaining.`}${row.paidAt?`<br>Last paid ${new Date(row.paidAt).toLocaleString()}`:''}</p>`;const vehicle=modal.querySelector('.mma-vehicle-card');if(vehicle)vehicle.insertAdjacentElement('afterend',card);else modal.querySelector('.job-banner')?.insertAdjacentElement('afterend',card);}}
}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>render(force),180);}
new MutationObserver(()=>schedule(false)).observe(document.getElementById('app')||document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>schedule(true));
document.addEventListener('click',event=>{if(event.target.closest?.('[data-square-sync-now]'))setTimeout(()=>{state=null;schedule(true);},1800);},true);
window.MobileMechanicSquareContextRefresh=()=>{state=null;return render(true);};
setTimeout(()=>schedule(true),1100);
})();
