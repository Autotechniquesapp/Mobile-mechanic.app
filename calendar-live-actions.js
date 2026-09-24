(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7',sb=window.MobileMechanicSupabase;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const read=()=>{try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}};
const write=db=>localStorage.setItem(DBKEY,JSON.stringify(db));
const pad=n=>String(n).padStart(2,'0'),dayKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const startWeek=d=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const sameDay=(a,b)=>dayKey(new Date(a))===dayKey(new Date(b));
const vehicle=v=>[v?.year,v?.make,v?.model,v?.trim||v?.submodel].filter(Boolean).join(' ')||'Vehicle details pending';
const time=v=>new Date(v).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const dateLabel=d=>new Date(d).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
let week=startWeek(new Date()),selected=new Date();

function shop(){const db=read(),sid=db.session?.shopId;return sid?db.shops?.[sid]:null;}
function activeJobs(){return (shop()?.jobs||[]).filter(j=>!j.completedAt&&!['Completed','Cancelled'].includes(j.status)&&!String(j.status||'').toLowerCase().includes('declined'));}
function scheduled(){return activeJobs().filter(j=>j.scheduledStart).sort((a,b)=>new Date(a.scheduledStart)-new Date(b.scheduledStart));}
function unscheduled(){return activeJobs().filter(j=>!j.scheduledStart);}
function notify(msg,type='good'){if(typeof window.toast==='function')return window.toast(msg,type);document.querySelector('.toast')?.remove();const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3000);}
function openJob(id){if(typeof window.MobileMechanicOpenJob==='function')return window.MobileMechanicOpenJob(id);location.hash='#jobs';}
function openSchedule(id,start=''){const b=$(`[data-cal-schedule-triggers] [data-action="schedule-job"][data-job="${CSS.escape(String(id))}"]`);if(!b)return notify('That job could not be opened for scheduling.','bad');b.click();if(start)setTimeout(()=>{const input=$('#scheduleStart');if(input)input.value=start;},80);}
function openPendingIntakeSchedule(){let pending=null;try{pending=JSON.parse(localStorage.getItem('mobile_mechanic_pending_calendar_schedule')||'null');}catch{}if(!pending?.jobId)return;if(pending.createdAt&&Date.now()-Number(pending.createdAt)>10*60*1000){localStorage.removeItem('mobile_mechanic_pending_calendar_schedule');return;}localStorage.removeItem('mobile_mechanic_pending_calendar_schedule');if(pending.start){const d=new Date(pending.start);if(!Number.isNaN(d.getTime())){selected=d;week=startWeek(d);render();}}openSchedule(String(pending.jobId),String(pending.start||''));}
async function removeSchedule(id){
  if(!confirm('Remove this appointment from the calendar? The job stays saved.'))return;
  const db=read(),sid=db.session?.shopId,j=db.shops?.[sid]?.jobs?.find(x=>String(x.id)===String(id));if(!sid||!j)return;
  try{
    if(!sb)throw new Error('Live database is unavailable.');
    const {error}=await sb.from('jobs').update({scheduled_start_at:null,scheduled_end_at:null}).eq('id',id).eq('shop_id',sid);if(error)throw error;
    j.scheduledStart=null;j.scheduledEnd=null;write(db);
    try{await sb.functions.invoke('calendar-sync',{body:{action:'sync_job',job_id:id}});}catch(err){console.warn('External calendar remove failed',err);}
    notify('Appointment removed.');render();
  }catch(err){notify(err?.message||'Could not remove appointment.','bad');}
}
function maps(loc){if(!loc)return notify('No service location saved.','bad');window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`,'_blank','noopener');}
function render(){
  if(location.hash.split('?')[0]!=='#calendar')return;
  const root=$('[data-mma-calendar]');if(!root)return;
  const grid=$('[data-cal-week-grid]'),needs=$('[data-cal-unscheduled]'),title=$('[data-cal-week-title]');
  const end=addDays(week,6);title.textContent=`${week.toLocaleDateString([],{month:'short',day:'numeric'})} – ${end.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`;
  const all=scheduled();
  grid.innerHTML=Array.from({length:7},(_,i)=>{
    const d=addDays(week,i),rows=all.filter(j=>sameDay(j.scheduledStart,d));
    return `<section class="ops-week-day ${sameDay(d,new Date())?'today':''}"><header><span>${esc(d.toLocaleDateString([],{weekday:'short'}))}</span><b>${d.getDate()}</b><small>${rows.length} job${rows.length===1?'':'s'}</small></header><div class="ops-week-day-body">${rows.length?rows.map(j=>`<article class="ops-cal-job" role="button" tabindex="0" data-cal-open-job="${esc(j.id)}"><time>${esc(time(j.scheduledStart))}</time><b>${esc(j.customerName||'Customer')}</b><span>${esc(vehicle(j.vehicle))}</span><small>${esc(j.location||'No service location')}</small><div class="ops-cal-job-actions"><button type="button" data-cal-edit="${esc(j.id)}">Edit</button><button type="button" data-cal-maps="${esc(j.location||'')}">Map</button><button type="button" data-cal-remove="${esc(j.id)}">Remove</button></div></article>`).join(''):'<div class="ops-week-empty">Open</div>'}</div></section>`;
  }).join('');
  const pending=unscheduled();
  needs.innerHTML=pending.length?pending.map(j=>`<div class="ops-need-card" role="button" tabindex="0" data-cal-open-job="${esc(j.id)}"><b>${esc(j.customerName||'Customer')} · ${esc(vehicle(j.vehicle))}</b><span>${esc(j.availability||'No requested time')}</span><small>${esc(j.complaint||'')}</small><div class="list-actions"><button class="btn btn-primary" type="button" data-cal-edit="${esc(j.id)}">Schedule</button></div></div>`).join(''):'<div class="mmp-empty">Everything active is scheduled.</div>';
}
document.addEventListener('click',e=>{
  if(location.hash.split('?')[0]!=='#calendar')return;
  if(e.target.closest?.('[data-cal-week-prev]')){week=addDays(week,-7);render();return;}
  if(e.target.closest?.('[data-cal-week-next]')){week=addDays(week,7);render();return;}
  if(e.target.closest?.('[data-cal-today]')){week=startWeek(new Date());render();return;}
  const edit=e.target.closest?.('[data-cal-edit]');if(edit){e.preventDefault();e.stopPropagation();openSchedule(edit.dataset.calEdit);return;}
  const map=e.target.closest?.('[data-cal-maps]');if(map){e.preventDefault();e.stopPropagation();maps(map.dataset.calMaps);return;}
  const rem=e.target.closest?.('[data-cal-remove]');if(rem){e.preventDefault();e.stopPropagation();removeSchedule(rem.dataset.calRemove);return;}
  const job=e.target.closest?.('[data-cal-open-job]');if(job){e.preventDefault();openJob(job.dataset.calOpenJob);}
},true);
document.addEventListener('keydown',e=>{const job=e.target.closest?.('[data-cal-open-job]');if(job&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openJob(job.dataset.calOpenJob);}});
new MutationObserver(()=>setTimeout(render,40)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(()=>{render();openPendingIntakeSchedule();},80));setTimeout(()=>{render();openPendingIntakeSchedule();},120);
})();