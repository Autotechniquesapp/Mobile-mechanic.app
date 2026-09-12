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
function jobs(){return (shop()?.jobs||[]).filter(j=>j.status!=='Cancelled');}
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
function bind(){upgradeMetrics();}

document.addEventListener('click',e=>{
  const closeBtn=e.target.closest('[data-cal-live-close]');if(closeBtn||e.target.classList?.contains('calendar-live-modal')){close();return;}
  const metric=e.target.closest('.metric-grid .metric[data-cal-live-metric]');if(metric){e.preventDefault();handleMetric(metric);return;}
  const day=e.target.closest('[data-cal-open-day]');if(day){e.preventDefault();openDay(day.dataset.calOpenDay);return;}
  const slot=e.target.closest('[data-cal-live-slot]');if(slot){e.preventDefault();const id=$('#calLiveJob')?.value;if(id){close();openSchedule(id,`${slot.dataset.calLiveDate}T${slot.dataset.calLiveSlot}`);}return;}
  const edit=e.target.closest('[data-cal-live-edit]');if(edit){e.preventDefault();close();openSchedule(edit.dataset.calLiveEdit);return;}
  const job=e.target.closest('[data-cal-live-job]');if(job){e.preventDefault();openJob(job.dataset.calLiveJob);return;}
  const rem=e.target.closest('[data-cal-live-remove]');if(rem){e.preventDefault();removeSchedule(rem.dataset.calLiveRemove);return;}
  const needs=e.target.closest('[data-cal-live-need-time]');if(needs){e.preventDefault();openList('Jobs Needing Time',unscheduled(),'Everything has a scheduled time.');return;}
  const sched=e.target.closest('[data-cal-live-scheduled]');if(sched){e.preventDefault();openList('Scheduled Jobs',scheduled(),'No scheduled jobs yet.');}
},true);

document.addEventListener('keydown',e=>{const metric=e.target.closest?.('.metric-grid .metric[data-cal-live-metric]');if(metric&&(e.key==='Enter'||e.key===' ')){e.preventDefault();handleMetric(metric);}});
new MutationObserver(()=>setTimeout(bind,60)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(bind,120));
setTimeout(bind,300);
})();
