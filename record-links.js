(() => {
'use strict';
const KEY='mobile_mechanic_ai_approved_v7';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phoneKey=value=>String(value||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const emailKey=value=>String(value||'').trim().toLowerCase();
function context(){
  if(location.pathname.startsWith('/intake/')||new URLSearchParams(location.search).has('intake')||new URLSearchParams(location.search).has('estimate')||document.querySelector('.customer-shell'))return null;
  try{const db=JSON.parse(localStorage.getItem(KEY));return db?.session?.role==='shop'?db.shops?.[db.session.shopId]:null;}catch{return null;}
}
function sameContact(a,b){return Boolean((phoneKey(a.phone)&&phoneKey(a.phone)===phoneKey(b.phone))||(emailKey(a.email)&&emailKey(a.email)===emailKey(b.email)));}
function customerForJob(s,j){
  return s.customers?.find(c=>String(c.id)===String(j.customerId))||{id:`job:${j.id}`,name:j.customerName,phone:j.phone,email:j.email,address:j.location||j.address,vehicles:[j.vehicle].filter(Boolean)};
}
function records(s){
  const rows=[...(s.customers||[])];
  for(const j of s.jobs||[])if(!rows.some(c=>String(c.id)===String(j.customerId)))rows.push(customerForJob(s,j));
  return rows;
}
function relatedJobs(s,c){
  const ids=new Set((s.customers||[]).filter(row=>String(row.id)===String(c.id)||sameContact(row,c)).map(row=>String(row.id)));
  return (s.jobs||[]).filter(j=>ids.has(String(j.customerId))||c.id===`job:${j.id}`||(!j.customerId&&sameContact(c,j))).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
const vehicle=v=>[v?.year,v?.make,v?.model,v?.engine].filter(Boolean).join(' ');
const INTAKE_FIELDS='id,customer_name,phone,email,address,current_location,availability,vehicle,customer_states,preferred_contact,status,created_at,converted_job_id';
function submitted(value){const date=new Date(value);return value&&!Number.isNaN(date.getTime())?date.toLocaleString(undefined,{dateStyle:'full',timeStyle:'long'}):'Submission date not recorded';}
function intakeMarkup(row){
  const phone=String(row.phone||'').replace(/[^+\d]/g,''),address=row.address||row.current_location?.raw||'',gps=row.current_location;
  const destination=address||(Number.isFinite(Number(gps?.latitude??gps?.lat))&&Number.isFinite(Number(gps?.longitude??gps?.lng))?`${gps.latitude??gps.lat},${gps.longitude??gps.lng}`:'');
  const line=(label,value)=>value===null||value===undefined||value===''?'':`<p><b>${esc(label)}:</b> ${esc(value)}</p>`;
  return `<article class="work-card"><h3>Customer’s Submitted Intake</h3><p><b>Submitted:</b> <time ${row.created_at?`datetime="${esc(row.created_at)}"`:''}>${esc(submitted(row.created_at))}</time></p>${line('Customer',row.customer_name)}${phone?`<p><b>Phone:</b> <a href="tel:${esc(phone)}">${esc(row.phone)}</a> · <a href="sms:${esc(phone)}">Text</a></p>`:''}${row.email?`<p><b>Email:</b> <a href="mailto:${esc(row.email)}">${esc(row.email)}</a></p>`:''}${destination?`<p><b>Service location:</b> <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}" target="_blank" rel="noopener">${esc(destination)}</a></p>`:''}${line('Preferred contact',row.preferred_contact)}${line('Requested date / availability',row.availability)}<h3>Vehicle</h3>${Object.entries(row.vehicle||{}).map(([key,value])=>line(key.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()),value)).join('')||'<p>No vehicle information submitted.</p>'}<h3>Customer states</h3><p style="white-space:pre-wrap">${esc(row.customer_states||'No complaint entered')}</p></article>`;
}
function showIntakes(host,rows){
  host.innerHTML=rows.length?`${rows.length>1?'<p>Intake submissions</p>':''}${rows.map((row,i)=>i===0?intakeMarkup(row):`<details><summary>Intake submitted ${esc(submitted(row.created_at))}</summary>${intakeMarkup(row)}</details>`).join('')}`:'<h3>Customer’s Submitted Intake</h3><p>No saved intake submission was found for this customer. Submission date is unavailable.</p>';
}
async function loadIntakes(panel,s,c,submissionId,preferredJobId){
  const host=panel.querySelector('[data-record-intake-content]'),sb=window.MobileMechanicSupabase;
  if(!sb){host.innerHTML='<h3>Customer’s Submitted Intake</h3><p>The original intake is unavailable while disconnected. Reconnect and open this name again to load it.</p>';return;}
  try{
    const rows=[];
    // Page through the shop's submissions so older intakes are not lost to a latest-150 cutoff.
    for(let offset=0;;offset+=500){
      let query=sb.from('intake_submissions').select(INTAKE_FIELDS).eq('shop_id',s.id).order('created_at',{ascending:false});
      if(submissionId)query=query.eq('id',submissionId);
      const {data,error}=await query.range(offset,offset+499);if(error)throw error;
      rows.push(...(data||[]));if(submissionId||(data||[]).length<500)break;
      if(!panel.isConnected||context()?.id!==s.id)return;
    }
    if(!panel.isConnected||context()?.id!==s.id)return;
    const jobIds=new Set(relatedJobs(s,c).map(j=>String(j.id)));
    const matches=submissionId?rows:rows.filter(row=>sameContact(c,row)||jobIds.has(String(row.converted_job_id)));
    if(preferredJobId)matches.sort((a,b)=>Number(String(b.converted_job_id)===preferredJobId)-Number(String(a.converted_job_id)===preferredJobId));
    showIntakes(host,matches);
  }catch{if(panel.isConnected&&context()?.id===s.id)host.innerHTML='<h3>Customer’s Submitted Intake</h3><p>The saved intake could not be loaded. Close and reopen this name to retry.</p>';}
}
async function openSubmission(id){
  const s=context(),sb=window.MobileMechanicSupabase;if(!s)return;
  close();const panel=document.createElement('div');panel.className='modal-backdrop';panel.dataset.recordProfile='1';returnFocus=document.activeElement;
  panel.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-label="Customer intake form"><div class="modal-head"><h2>Customer Intake</h2><button type="button" class="close-btn" data-record-close aria-label="Close">×</button></div><div data-record-intake-content aria-live="polite">Loading the submitted intake…</div></section>';
  document.body.appendChild(panel);panel.querySelector('button').focus();
  const host=panel.querySelector('[data-record-intake-content]');
  if(!sb){host.textContent='The original intake is unavailable while disconnected. Reconnect and open this name again.';return;}
  try{
    const {data,error}=await sb.from('intake_submissions').select(INTAKE_FIELDS).eq('shop_id',s.id).eq('id',id).maybeSingle();
    if(error)throw error;
    if(!panel.isConnected||context()?.id!==s.id)return;
    if(!data){host.textContent='This saved intake could not be found.';return;}
    const customer=records(s).find(c=>sameContact(c,data));
    if(customer)return show([customer.id],id);
    panel.querySelector('h2').textContent=data.customer_name||'Customer';host.innerHTML=intakeMarkup(data);
  }catch{if(panel.isConnected)host.textContent='The saved intake could not be loaded. Close and reopen this name to retry.';}
}
let returnFocus;
function close(){const panel=document.querySelector('[data-record-profile]');if(panel){panel.remove();if(returnFocus?.isConnected)returnFocus.focus();}}
function show(candidates,submissionId,preferredJobId){
  const s=context();if(!s)return;
  const rows=records(s),customers=candidates.map(id=>rows.find(c=>String(c.id)===String(id))).filter(Boolean);
  if(!customers.length)return;
  returnFocus=document.activeElement;
  document.querySelector('[data-record-profile]')?.remove();
  const panel=document.createElement('div');panel.className='modal-backdrop';panel.dataset.recordProfile='1';
  const c=customers[0],jobs=relatedJobs(s,c),vehicles=[...(c.vehicles||[]),...jobs.map(j=>j.vehicle).filter(Boolean)];
  const uniqueVehicles=[...new Map(vehicles.map(v=>[v.vin||vehicle(v),v])).values()];
  const contact=(value,kind,label)=>value?`<p><b>${label}:</b> <a class="record-link" href="${esc(kind==='phone'?`tel:${String(value).replace(/[^+\d]/g,'')}`:kind==='email'?`mailto:${value}`:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(value)}`)}" ${kind==='address'?'target="_blank" rel="noopener"':''}>${esc(value)}</a>${kind==='phone'?` <a class="record-link" href="sms:${esc(String(value).replace(/[^+\d]/g,''))}">Text</a>`:''}</p>`:'';
  panel.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-label="Customer intake form"><div class="modal-head"><h2>${customers.length>1?'Choose customer':esc(c.name||'Customer')}</h2><button type="button" class="close-btn" data-record-close aria-label="Close customer information">×</button></div>${customers.length>1?`<p>More than one customer has this name. Choose the correct record.</p>${customers.map(row=>`<button type="button" class="btn btn-soft btn-wide" data-record-customer="${esc(row.id)}">${esc(row.name)} · ${esc(row.phone||row.email||'No contact saved')}</button>`).join('')}`:`<section data-record-intake-content aria-live="polite"><p>Loading the submitted intake…</p></section><details><summary>Customer information, vehicles &amp; jobs (${jobs.length})</summary><div class="work-card">${contact(c.phone,'phone','Phone')}${contact(c.email,'email','Email')}${contact(c.address||jobs[0]?.location,'address','Address')}${!c.phone&&!c.email?'<p>No contact information saved.</p>':''}</div><h3>Vehicles</h3>${uniqueVehicles.map(v=>`<p>${esc(vehicle(v)||'Vehicle details pending')}${v.vin?` · VIN ${esc(v.vin)}`:''}</p>`).join('')||'<p>No vehicles saved.</p>'}<h3>Jobs (${jobs.length})</h3><div class="list">${jobs.map(j=>`<button type="button" class="list-item record-job" data-record-job="${esc(j.id)}"><div class="list-main"><b>${esc(vehicle(j.vehicle)||'Job')}</b><p>${esc(j.status||'Status not set')} · ${esc(j.createdAt?new Date(j.createdAt).toLocaleDateString():'Date not set')}<br>${esc(j.complaint||'No complaint saved')}</p></div></button>`).join('')||'<p>No jobs yet.</p>'}</div></details>`}</section>`;
  document.body.appendChild(panel);panel.querySelector('[data-record-close]').focus();
  if(customers.length===1)loadIntakes(panel,s,c,submissionId,preferredJobId);
}
function openJob(id){
  if(!context()?.jobs?.some(j=>String(j.id)===String(id)))return;
  close();
  // The app delegates job navigation; bypass only the tile preview interceptor.
  const trigger=document.createElement('button');trigger.hidden=true;trigger.dataset.openJob=id;trigger.dataset.mmaNativeOpen='1';
  document.body.appendChild(trigger);trigger.click();trigger.remove();
}
function decorate(){
  const s=context();if(!s)return;
  const customers=records(s),values=new Map();
  function add(value,kind,id){value=String(value||'').trim();if(!value)return;const entry=values.get(value)||{kind,ids:[]};if(id&&!entry.ids.includes(String(id)))entry.ids.push(String(id));values.set(value,entry);}
  for(const c of customers){add(c.name,'customer',c.id);add(c.phone,'phone');add(c.email,'email');add(c.address,'address');}
  for(const j of s.jobs||[]){add(j.phone,'phone');add(j.email,'email');add(j.location||j.address,'address');}
  const root=document.getElementById('app');
  const roots=[root,...document.querySelectorAll('.modal,.nxe-history-card')].filter(Boolean);
  const names=[...values.keys()].sort((a,b)=>b.length-a.length);
  if(!names.length)return;
  const expression=new RegExp(names.map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  for(const host of roots){
    if(host.closest('[data-record-profile]'))continue;
    const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),nodes=[];let node;
    while((node=walker.nextNode()))nodes.push(node);
    for(const text of nodes){
      const parent=text.parentElement;
      if(!parent||parent.closest('a,input,textarea,select,option,label,script,style,[contenteditable],[data-record-link],[data-record-submission],[data-record-profile],.customer-shell'))continue;
      const button=parent.closest('button');
      if(button&&!button.matches('[data-open-job],[data-cal-edit],[data-cal-month-day],[data-cal-open-job],[data-mma-completed-open],.mmp-job-row,.mma-day-row'))continue;
      const value=text.textContent;expression.lastIndex=0;const matches=[...value.matchAll(expression)].filter(m=>!/[\p{L}\p{N}_]/u.test(value[m.index-1]||'')&&!/[\p{L}\p{N}_]/u.test(value[m.index+m[0].length]||''));
      if(!matches.length)continue;
      const fragment=document.createDocumentFragment();let start=0;
      for(const match of matches){
        const entry=values.get(match[0]),link=document.createElement('span');
        fragment.append(value.slice(start,match.index));link.className='record-link';link.dataset.recordLink=entry.kind;link.dataset.recordValue=match[0];link.tabIndex=0;link.setAttribute('role','link');
        if(entry.kind==='customer'){
          const tile=parent.closest('[data-open-job],[data-cal-open-job],[data-cal-edit],[data-mma-completed-open],[data-job]');
          const id=tile&&(tile.dataset.openJob||tile.dataset.calOpenJob||tile.dataset.calEdit||tile.dataset.mmaCompletedOpen||tile.dataset.job),job=s.jobs?.find(j=>String(j.id)===String(id));
          if(job)link.dataset.recordJobContext=String(job.id);
          link.dataset.recordCustomers=JSON.stringify(job?[String(customerForJob(s,job).id)]:entry.ids);
        }
        link.setAttribute('aria-label',`${entry.kind==='customer'?'Open customer':entry.kind==='phone'?'Call or text':entry.kind==='email'?'Email':'Navigate to'} ${match[0]}`);
        link.textContent=match[0];fragment.appendChild(link);start=match.index+match[0].length;
      }
      fragment.append(value.slice(start));text.replaceWith(fragment);
    }
  }
}
function activate(e){
  if(!context())return;
  const target=e.target.closest?.('[data-record-link],[data-record-customer],[data-record-job],[data-record-close],[data-record-submission],[data-open-customer-intake]');
  if(!target)return;
  if(target.matches('[data-open-customer-intake]')&&e.target.closest('button,a,input,textarea,select'))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(target.hasAttribute('data-record-close'))return close();
  if(target.dataset.recordJob)return openJob(target.dataset.recordJob);
  if(target.dataset.recordSubmission)return openSubmission(target.dataset.recordSubmission);
  if(target.dataset.recordCustomer)return show([target.dataset.recordCustomer]);
  if(target.dataset.openCustomerIntake)return show([target.dataset.openCustomerIntake]);
  if(target.dataset.recordLink==='customer')return show(JSON.parse(target.dataset.recordCustomers),undefined,target.dataset.recordJobContext);
  const value=target.dataset.recordValue;
  if(target.dataset.recordLink==='phone'){
    document.querySelector('[data-record-profile]')?.remove();const panel=document.createElement('div');panel.className='modal-backdrop';panel.dataset.recordProfile='1';returnFocus=target;
    const number=String(value).replace(/[^+\d]/g,'');panel.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-label="Call or text"><div class="modal-head"><h2>${esc(value)}</h2><button class="close-btn" data-record-close aria-label="Close">×</button></div><div class="btn-row"><a class="btn btn-primary" href="tel:${esc(number)}">Call</a><a class="btn btn-soft" href="sms:${esc(number)}">Text</a></div></section>`;document.body.appendChild(panel);panel.querySelector('a').focus();return;
  }
  if(target.dataset.recordLink==='address')window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(value)}`,'_blank','noopener');
  else location.href=`mailto:${value}`;
}
window.addEventListener('click',e=>{if(e.target.matches?.('[data-record-profile]')){e.preventDefault();e.stopImmediatePropagation();close();return;}activate(e);},true);
window.addEventListener('keydown',e=>{
  const panel=document.querySelector('[data-record-profile]');
  if(e.key==='Escape'&&panel){e.preventDefault();e.stopImmediatePropagation();close();return;}
  if(e.key==='Tab'&&panel){const controls=[...panel.querySelectorAll('button,a[href],[tabindex="0"]')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
  if(e.key==='Enter'||e.key===' ')activate(e);
},true);
const style=document.createElement('style');style.textContent='.record-link{cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:#ef2a31;text-underline-offset:3px}.record-link:focus-visible{outline:2px solid #ef2a31;outline-offset:3px}.record-job{width:100%;text-align:left;color:inherit}[data-record-profile]{z-index:10050}[data-record-profile] .modal{background:#101319;color:#f7f7f8;border:1px solid #ef2a31;max-height:90vh;overflow:auto}';document.head.appendChild(style);
let pending=false;
function schedule(){if(pending)return;pending=true;setTimeout(()=>{pending=false;decorate();},40);}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{close();schedule();});window.addEventListener('storage',schedule);schedule();
})();
