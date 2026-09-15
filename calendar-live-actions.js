(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function write(db){localStorage.setItem(DBKEY,JSON.stringify(db));}
function shop(){const d=read(),sid=d.session?.shopId;return sid?d.shops?.[sid]:null;}
function vehicle(v={}){return [v.year,v.make,v.model,v.trim||v.submodel].filter(Boolean).join(' ')||'Vehicle details pending';}
function pad(n){return String(n).padStart(2,'0');}
function dayKey(d){const x=new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;}
function sameDay(a,b){return dayKey(a)===dayKey(b);}
function fmtDate(d){return new Date(d).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});}
function fmtTime(v){return v?new Date(v).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Time not set';}
function slots(){const out=[];for(let m=8*60;m<=18*60;m+=30){const h=Math.floor(m/60),mm=m%60,d=new Date(2000,0,1,h,mm);out.push([`${pad(h)}:${pad(mm)}`,d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})]);}return out;}
function routeCalendar(){if(location.hash.split('?')[0]!=='#calendar')location.hash='#calendar';}
function modal(title,body){$('.calendar-live-modal')?.remove();const d=document.createElement('div');d.className='modal-backdrop calendar-live-modal';d.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${esc(title)}</h2><button class="close-btn" type="button" data-cal-live-close>×</button></div>${body}</div>`;document.body.appendChild(d);}
function close(){ $('.calendar-live-modal')?.remove(); }
function status(msg,type='good'){if(typeof window.toast==='function')window.toast(msg,type);}
function isClosedJob(j){const state=String(j?.status||'').trim().toLowerCase();return !!j?.completedAt||state==='completed'||state==='cancelled'||state.includes('declined');}
function customerStillExists(j,s=shop()){
  if(!j?.customerId)return true;
  return (s?.customers||[]).some(c=>String(c.id)===String(j.customerId));
}
function jobs(){const s=shop();return (s?.jobs||[]).filter(j=>!isClosedJob(j)&&customerStillExists(j,s));}
function scheduled(){return jobs().filter(j=>j.scheduledStart).sort((a,b)=>new Date(a.scheduledStart)-new Date(b.scheduledStart));}
function unscheduled(){return jobs().filter(j=>!j.scheduledStart);}
function openSchedule(jobId,start=''){
  routeCalendar();
  setTimeout(()=>{
    const btn=$(`[data-action="schedule-job"][data-job="${CSS.escape(jobId)}"]`);
    if(!btn){status('Could not find that job button on the calendar.','bad');return;}
    btn.click();
    if(start)setTimeout(()=>{const input=$('#scheduleStart');if(input)input.value=start;},80);
  },80);
}
async function removeSchedule(jobId){
  const db=read(),sid=db.session?.shopId,s=sid?db.shops?.[sid]:null;if(!s)return;
  const j=s.jobs?.find(x=>String(x.id)===String(jobId));if(!j)return;
  if(!confirm(`Remove ${j.customerName||'this job'} from the calendar? The job stays saved and can be rescheduled.`))return;
  try{
    if(!sb)throw new Error('The live database connection is not available.');
    const {error}=await sb.from('jobs').update({scheduled_start_at:null,scheduled_end_at:null}).eq('id',jobId).eq('shop_id',sid);
    if(error)throw error;
    j.scheduledStart=null;j.scheduledEnd=null;j.scheduleNotes=j.scheduleNotes||'';
    write(db);close();status('Removed from calendar. Job is still saved.','good');location.hash='#calendar';setTimeout(()=>location.reload(),250);
  }catch(err){status(err?.message||'Could not remove this job from the calendar.','bad');}
}
function openJob(jobId){
  const db=read();
  if(!db.session||!jobById(jobId))return status('That job could not be opened.','bad');
  db.session.activeJobId=jobId;
  write(db);
  close();
  location.hash='#findings';
}
function openJobPanel(jobId){
  const j=jobById(jobId);if(!j)return status('That customer/job is no longer active.','bad');
  const db=read();if(db.session){db.session.activeJobId=jobId;write(db);}
  const trigger=document.createElement('button');trigger.type='button';trigger.hidden=true;trigger.dataset.openJob=String(jobId);document.body.appendChild(trigger);trigger.click();
  setTimeout(()=>{trigger.remove();if(!$('[data-job-tile-actions-modal]'))openJob(jobId);},80);
}
function jobById(id){return jobs().find(j=>String(j.id)===String(id))||null;}
function openDay(date){
  const d=new Date(`${date}T12:00:00`),dayJobs=scheduled().filter(j=>sameDay(j.scheduledStart,d)),needs=unscheduled();
  const list=dayJobs.length?dayJobs.map(j=>`<div class="list-item"><div class="list-icon">📅</div><div class="list-main"><b>${esc(fmtTime(j.scheduledStart))} - ${esc(j.customerName||'Customer')}</b><p>${esc(vehicle(j.vehicle))}<br>${esc(j.location||'No location')}</p><div class="list-actions"><button class="btn btn-primary" data-cal-live-job="${esc(j.id)}">Open Job</button><button class="btn btn-soft" data-cal-live-edit="${esc(j.id)}">Edit Time</button><button class="btn btn-soft" data-action="open-maps" data-location="${esc(j.location||'')}">Google Maps</button><button class="btn btn-soft" data-cal-live-remove="${esc(j.id)}">Remove</button></div></div></div>`).join(''):'<button class="btn btn-soft btn-wide" data-cal-live-need-time>No jobs on this day. Pick a job and time below.</button>';
  const add=needs.length?`<div class="divider"></div><div class="field"><label>Add customer / job</label><select id="calLiveJob">${needs.map(j=>`<option value="${esc(j.id)}">${esc(j.customerName||'Customer')} - ${esc(vehicle(j.vehicle))}</option>`).join('')}</select></div><div class="calendar-slot-grid">${slots().map(([value,label])=>`<button class="btn btn-soft" data-cal-live-slot="${value}" data-cal-live-date="${date}">${label}</button>`).join('')}</div>`:'<div class="divider"></div><button class="btn btn-soft btn-wide" data-cal-live-scheduled>All jobs already have times. View scheduled jobs.</button>';
  modal(fmtDate(d),`<div class="list">${list}</div>${add}`);
}
function openList(title,items,empty){
  modal(title,items.length?`<div class="list">${items.map(j=>`<div class="list-item"><div class="list-icon">🔧</div><div class="list-main"><b>${esc(j.customerName||'Customer')} - ${esc(vehicle(j.vehicle))}</b><p>${esc(j.scheduledStart?`${fmtDate(j.scheduledStart)} ${fmtTime(j.scheduledStart)}`:(j.availability||'Customer availability not set'))}<br>${esc(j.location||j.complaint||'')}</p><div class="list-actions"><button class="btn btn-primary" data-cal-live-job="${esc(j.id)}">Open Job</button><button class="btn btn-soft" data-cal-live-edit="${esc(j.id)}">${j.scheduledStart?'Edit Time':'Schedule'}</button>${j.scheduledStart?`<button class="btn btn-soft" data-action="open-maps" data-location="${esc(j.location||'')}">Google Maps</button><button class="btn btn-soft" data-cal-live-remove="${esc(j.id)}">Remove</button>`:''}</div></div></div>`).join('')}</div>`:`<button class="btn btn-soft btn-wide">${esc(empty)}</button>`);
}
function handleMetric(metric){const label=metric.textContent.toLowerCase();if(label.includes('today'))return openDay(dayKey(new Date()));if(label.includes('need time'))return openList('Jobs Needing Time',unscheduled(),'Everything has a scheduled time.');if(label.includes('scheduled')||label.includes('hours booked'))return openList('Scheduled Jobs',scheduled(),'No scheduled jobs yet.');}
function upgradeMetrics(){if(location.hash.split('?')[0]!=='#calendar')return;$$('.metric-grid .metric').forEach(m=>{if(m.dataset.calLiveMetric)return;m.dataset.calLiveMetric='1';m.setAttribute('role','button');m.tabIndex=0;m.style.cursor='pointer';});}
function patchMetricCounts(){
  if(location.hash.split('?')[0]!=='#calendar')return;
  const list=scheduled(),needs=unscheduled(),today=dayKey(new Date());
  $$('.metric-grid .metric').forEach(m=>{const label=(m.querySelector('span')?.textContent||'').toLowerCase(),num=m.querySelector('b');if(!num)return;if(label==='today')num.textContent=String(list.filter(j=>dayKey(j.scheduledStart)===today).length);else if(label==='scheduled')num.textContent=String(list.length);else if(label.includes('need time'))num.textContent=String(needs.length);});
}
function patchCalendarCards(){
  if(location.hash.split('?')[0]!=='#calendar')return;
  const s=shop();
  $$('[data-action="schedule-job"][data-job]').forEach(btn=>{
    const id=btn.dataset.job,j=(s?.jobs||[]).find(x=>String(x.id)===String(id)),card=btn.closest('.list-item');if(!card||!j)return;
    if(isClosedJob(j)||!customerStillExists(j,s)){card.remove();return;}
    card.dataset.calCardJob=String(id);card.setAttribute('role','button');card.tabIndex=0;card.style.cursor='pointer';
    const name=card.querySelector('.list-main > b');if(name){name.style.cursor='pointer';name.title='Open customer intake / job';}
  });
}
function ensureDayStrip(){
  if(location.hash.split('?')[0]!=='#calendar'||$('[data-cal-live-days]'))return;
  const metrics=$('.metric-grid');if(!metrics)return;
  const start=new Date();start.setHours(12,0,0,0);
  const days=Array.from({length:14},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const key=dayKey(d),count=scheduled().filter(j=>sameDay(j.scheduledStart,d)).length;return `<button type="button" class="btn btn-soft" data-cal-open-day="${key}" aria-label="Open ${esc(fmtDate(d))}"><b style="display:block">${i===0?'Today':esc(d.toLocaleDateString([],{weekday:'short'}))}</b><span>${esc(d.toLocaleDateString([],{month:'short',day:'numeric'}))}</span><small style="display:block">${count} job${count===1?'':'s'}</small></button>`;}).join('');
  const section=document.createElement('section');section.className='card card-pad';section.dataset.calLiveDays='1';section.style.marginTop='10px';section.innerHTML=`<div class="card-title">OPEN A DAY</div><div class="section-note">Tap a day to see its jobs, edit times, or schedule an unscheduled job.</div><div class="divider"></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px">${days}</div>`;
  metrics.insertAdjacentElement('afterend',section);
}
function normalize(v){return String(v||'').trim().toLowerCase();}
function phoneKey(v){const d=String(v||'').replace(/\D/g,'');return d.length>10?d.slice(-10):d;}
function rowValue(modal,label){const row=$$('tr',modal).find(r=>normalize(r.querySelector('th')?.textContent)===normalize(label));return row?.querySelector('td')?.textContent?.trim()||'';}
function findModalJob(modal){
  const s=shop();if(!s)return null;const db=read(),active=(s.jobs||[]).find(j=>String(j.id)===String(db.session?.activeJobId||''));
  const name=normalize(rowValue(modal,'Customer')||modal.querySelector('.modal-head h2')?.textContent),phone=phoneKey(rowValue(modal,'Phone'));
  if(active&&(!name||normalize(active.customerName||active.name)===name)&&(!phone||phoneKey(active.phone)===phone))return active;
  return [...(s.jobs||[])].filter(j=>(!name||normalize(j.customerName||j.name)===name)&&(!phone||phoneKey(j.phone||j.intake?.phone)===phone)).sort((a,b)=>String(b.createdAt||b.updatedAt||'').localeCompare(String(a.createdAt||a.updatedAt||'')))[0]||null;
}
function upsertIntakeTimeRows(modal,requested,job){
  const table=$('.work-card table tbody',modal);if(!table)return;
  let preferred=$$('tr',table).find(r=>['preferred time','customer requested date & time'].includes(normalize(r.querySelector('th')?.textContent)));
  if(requested){
    if(!preferred){preferred=document.createElement('tr');preferred.innerHTML='<th>Customer Requested Date & Time</th><td></td>';table.appendChild(preferred);}
    preferred.querySelector('th').textContent='Customer Requested Date & Time';preferred.querySelector('td').textContent=requested;
  }else if(preferred&&job?.scheduledStart){preferred.querySelector('th').textContent='Scheduled Appointment';}
  if(job?.scheduledStart){
    let scheduledRow=$$('tr',table).find(r=>normalize(r.querySelector('th')?.textContent)==='scheduled appointment');
    const start=new Date(job.scheduledStart),end=job.scheduledEnd?new Date(job.scheduledEnd):null;
    const text=`${start.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'})} at ${start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}${end?` - ${end.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`:''}`;
    if(!scheduledRow){scheduledRow=document.createElement('tr');scheduledRow.innerHTML='<th>Scheduled Appointment</th><td></td>';table.appendChild(scheduledRow);}
    scheduledRow.querySelector('td').textContent=text;
  }
}
async function lookupRequestedTime(modal,job){
  if(!sb||modal.dataset.mmaRequestedLookup==='1')return;modal.dataset.mmaRequestedLookup='1';
  const s=shop();if(!s?.id)return;const name=rowValue(modal,'Customer')||job?.customerName||'',phone=rowValue(modal,'Phone')||job?.phone||'',email=rowValue(modal,'Email')||job?.email||'';
  try{
    const {data,error}=await sb.from('intake_submissions').select('customer_name,phone,email,availability,created_at').eq('shop_id',s.id).order('created_at',{ascending:false}).limit(100);if(error)throw error;
    const p=phoneKey(phone),e=normalize(email),n=normalize(name),row=(data||[]).find(r=>(p&&phoneKey(r.phone)===p)||(e&&normalize(r.email)===e)||(n&&normalize(r.customer_name)===n));
    if(row?.availability)upsertIntakeTimeRows(modal,row.availability,job);
  }catch(err){console.warn('Could not load customer requested time',err);}
}
function patchIntakeRequestedTime(){
  $$('[data-job-tile-actions-modal]').forEach(modal=>{
    const heading=$$('.work-card h3',modal).find(h=>normalize(h.textContent)==='customer intake form');if(!heading)return;
    const job=findModalJob(modal),requested=job?.availability||'';upsertIntakeTimeRows(modal,requested,job);if(!requested)lookupRequestedTime(modal,job);
  });
}
function bind(){upgradeMetrics();patchMetricCounts();patchCalendarCards();ensureDayStrip();patchIntakeRequestedTime();}

document.addEventListener('click',e=>{
  const closeBtn=e.target.closest('[data-cal-live-close]');if(closeBtn||e.target.classList?.contains('calendar-live-modal')){close();return;}
  const metric=e.target.closest('.metric-grid .metric[data-cal-live-metric]');if(metric){e.preventDefault();handleMetric(metric);return;}
  const day=e.target.closest('[data-cal-open-day]');if(day){e.preventDefault();openDay(day.dataset.calOpenDay);return;}
  const slot=e.target.closest('[data-cal-live-slot]');if(slot){e.preventDefault();const id=$('#calLiveJob')?.value;if(id){close();openSchedule(id,`${slot.dataset.calLiveDate}T${slot.dataset.calLiveSlot}`);}return;}
  const edit=e.target.closest('[data-cal-live-edit]');if(edit){e.preventDefault();close();openSchedule(edit.dataset.calLiveEdit);return;}
  const job=e.target.closest('[data-cal-live-job]');if(job){e.preventDefault();openJobPanel(job.dataset.calLiveJob);return;}
  const rem=e.target.closest('[data-cal-live-remove]');if(rem){e.preventDefault();removeSchedule(rem.dataset.calLiveRemove);return;}
  const needs=e.target.closest('[data-cal-live-need-time]');if(needs){e.preventDefault();openList('Jobs Needing Time',unscheduled(),'Everything has a scheduled time.');return;}
  const sched=e.target.closest('[data-cal-live-scheduled]');if(sched){e.preventDefault();openList('Scheduled Jobs',scheduled(),'No scheduled jobs yet.');return;}
  const card=e.target.closest('[data-cal-card-job]');if(card&&!e.target.closest('button,a,input,select,textarea')){e.preventDefault();e.stopPropagation();openJobPanel(card.dataset.calCardJob);}
},true);

document.addEventListener('keydown',e=>{
  const metric=e.target.closest?.('.metric-grid .metric[data-cal-live-metric]');if(metric&&(e.key==='Enter'||e.key===' ')){e.preventDefault();handleMetric(metric);return;}
  const card=e.target.closest?.('[data-cal-card-job]');if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openJobPanel(card.dataset.calCardJob);}
});
new MutationObserver(()=>setTimeout(bind,60)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(bind,120));
setTimeout(bind,300);
})();
