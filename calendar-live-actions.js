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
let week=startWeek(new Date()),selected=new Date(),view=window.innerWidth<700?'day':'week';

function shop(){const db=read(),sid=db.session?.shopId;return sid?db.shops?.[sid]:null;}
function activeJobs(){return (shop()?.jobs||[]).filter(j=>!j.completedAt&&!['Completed','Cancelled'].includes(j.status)&&!String(j.status||'').toLowerCase().includes('declined'));}
function scheduled(){return activeJobs().filter(j=>j.scheduledStart).sort((a,b)=>new Date(a.scheduledStart)-new Date(b.scheduledStart));}
function unscheduled(){return activeJobs().filter(j=>!j.scheduledStart);}
function notify(msg,type='good'){if(typeof window.toast==='function')return window.toast(msg,type);document.querySelector('.toast')?.remove();const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3000);}
function openJob(id){const trigger=document.createElement('div');trigger.setAttribute('data-open-job',String(id));trigger.setAttribute('role','button');trigger.hidden=true;document.body.appendChild(trigger);trigger.click();setTimeout(()=>trigger.remove(),0);}
function openSchedule(id,start=''){const b=$(`[data-cal-schedule-triggers] [data-action="schedule-job"][data-job="${CSS.escape(String(id))}"]`);if(!b)return notify('That job could not be opened for scheduling.','bad');b.click();if(start)setTimeout(()=>{const input=$('#scheduleStart');if(input){input.value=start;window.MobileMechanicSchedulePicker?.setStart(start);}},80);}
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
function styles(){if($('#mma-slot-calendar-style'))return;const style=document.createElement('style');style.id='mma-slot-calendar-style';style.textContent=`
.mma-calendar-scroll{max-height:60vh;overflow:auto;border:1px solid #34404c;border-radius:10px;margin:12px 0}.mma-slot-calendar{display:grid;grid-template-columns:60px repeat(var(--days),minmax(110px,1fr));min-width:var(--grid-width);background:#10161d}.mma-slot-head{position:sticky;top:0;z-index:2;background:#1d2732;padding:10px 5px;text-align:center;border-bottom:1px solid #46515d;font-weight:bold}.mma-slot-time{padding:8px 4px;font-size:11px;color:#aab5c2;border-bottom:1px solid #34404c}.mma-calendar-slot{min-height:44px;background:#111820;color:#dce5ee;border:0;border-left:1px solid #34404c;border-bottom:1px solid #34404c;text-align:left;padding:6px;cursor:pointer;font-size:11px}.mma-calendar-slot:hover,.mma-calendar-slot:focus-visible{background:#303c48;outline:2px solid #ef2a31;outline-offset:-2px}.mma-calendar-slot.busy{background:#54282b;color:#fff}.mma-calendar-slot b,.mma-calendar-slot small{display:block}.mma-month-grid-live{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;margin:12px 0}.mma-month-date{min-height:78px;background:#111820;color:#eef3f8;border:1px solid #34404c;border-radius:7px;text-align:left;padding:7px}.mma-month-date.today{border-color:#ef2a31}.mma-month-date.outside{opacity:.5}.mma-month-date small{display:block;font-size:10px;margin-top:5px}.mma-month-date.active{background:#54282b}.mma-calendar-pick{position:fixed;inset:0;z-index:10000;background:#000b;display:flex;align-items:center;justify-content:center;padding:14px}.mma-calendar-pick>section{width:min(520px,100%);max-height:85vh;overflow:auto;background:#111820;color:#fff;border:1px solid #46515d;border-radius:14px;padding:18px}.mma-calendar-pick .btn{margin:5px 0}
`;document.head.appendChild(style);}
function chooseSlot(start){const d=new Date(start);if(Number.isNaN(d.getTime()))return;const pending=unscheduled();document.querySelector('[data-cal-slot-picker]')?.remove();const wrap=document.createElement('div');wrap.className='mma-calendar-pick';wrap.dataset.calSlotPicker='1';wrap.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Schedule a job"><div class="modal-head"><h2>${esc(dateLabel(d))} · ${esc(time(d))}</h2><button class="close-btn" type="button" data-cal-slot-close>×</button></div><p>Choose a job for this calendar spot.</p>${pending.map(j=>`<button class="btn btn-soft btn-wide" type="button" data-cal-slot-job="${esc(j.id)}" data-cal-slot-start="${esc(start)}">${esc(j.customerName||'Customer')} · ${esc(vehicle(j.vehicle))}</button>`).join('')||'<p>No jobs are waiting for a time.</p>'}<button class="btn btn-primary btn-wide" type="button" data-cal-slot-new="${esc(start)}">+ New Job at This Time</button></section>`;document.body.appendChild(wrap);}
function renderSlots(){const host=$('[data-cal-slot-grid]');if(!host)return;styles();const all=scheduled();
 if(view==='month'){const first=new Date(selected.getFullYear(),selected.getMonth(),1),start=addDays(first,-first.getDay());host.innerHTML=`<div class="mma-month-grid-live">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<b style="text-align:center">${d}</b>`).join('')}${Array.from({length:42},(_,i)=>{const d=addDays(start,i),jobs=all.filter(j=>sameDay(j.scheduledStart,d));return `<button type="button" class="mma-month-date ${d.getMonth()!==first.getMonth()?'outside':''} ${sameDay(d,new Date())?'today':''} ${sameDay(d,selected)?'active':''}" data-cal-month-day="${dayKey(d)}" aria-label="${esc(dateLabel(d))}"><b>${d.getDate()}</b>${jobs.slice(0,2).map(j=>`<small>${esc(time(j.scheduledStart))} ${esc(j.customerName||'Customer')}</small>`).join('')}${jobs.length>2?`<small>+${jobs.length-2} more</small>`:''}</button>`;}).join('')}</div>`;return;}
 const days=view==='week'?Array.from({length:7},(_,i)=>addDays(week,i)):[new Date(selected)];
 let cells=`<div class="mma-slot-head"></div>${days.map(d=>`<div class="mma-slot-head">${esc(d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}))}</div>`).join('')}`;
 for(let n=0;n<48;n++){const clock=new Date(selected);clock.setHours(Math.floor(n/2),n%2*30,0,0);cells+=`<div class="mma-slot-time">${esc(time(clock))}</div>`;for(const day of days){const start=new Date(day);start.setHours(Math.floor(n/2),n%2*30,0,0);const end=start.getTime()+30*60000,job=all.find(j=>new Date(j.scheduledStart).getTime()<end&&new Date(j.scheduledEnd||new Date(new Date(j.scheduledStart).getTime()+60*60000)).getTime()>start.getTime());cells+=`<button type="button" class="mma-calendar-slot ${job?'busy':''}" ${job?`data-cal-edit="${esc(job.id)}"`:`data-cal-slot="${start.toISOString()}"`} aria-label="${esc(dateLabel(start)+' '+time(start)+(job?' - edit '+job.customerName:' - schedule a job'))}">${job?`<b>${esc(job.customerName||'Customer')}</b><small>${esc(time(job.scheduledStart))} · ${esc(vehicle(job.vehicle))}</small>`:'<span aria-hidden="true">+</span>'}</button>`;}}
 host.innerHTML=`<div class="mma-calendar-scroll"><div class="mma-slot-calendar" style="--days:${days.length};--grid-width:${view==='week'?'840px':'0'}">${cells}</div></div>`;host.querySelector('.mma-calendar-scroll').scrollTop=16*44;
}
function render(){
  if(location.hash.split('?')[0]!=='#calendar')return;
  const root=$('[data-mma-calendar]');if(!root)return;
  const signature=JSON.stringify({view,week:dayKey(week),selected:dayKey(selected),jobs:shop()?.jobs});if(root.dataset.calRenderKey===signature)return;root.dataset.calRenderKey=signature;
  const strip=$('[data-cal-week-strip]'),agenda=$('[data-cal-agenda]'),needs=$('[data-cal-unscheduled]'),title=$('[data-cal-week-title]'),dayTitle=$('[data-cal-day-title]');
  const end=addDays(week,6);title.textContent=`${week.toLocaleDateString([],{month:'short',day:'numeric'})} – ${end.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`;
  strip.innerHTML=Array.from({length:7},(_,i)=>{const d=addDays(week,i),count=scheduled().filter(j=>sameDay(j.scheduledStart,d)).length;return `<button type="button" class="ops-cal-day ${sameDay(d,new Date())?'today':''} ${sameDay(d,selected)?'active':''}" data-cal-day="${dayKey(d)}"><small>${esc(d.toLocaleDateString([],{weekday:'short'}))}</small><b>${d.getDate()}</b><small>${count?count+' job'+(count===1?'':'s'):''}</small></button>`;}).join('');
  if(view==='month')title.textContent=selected.toLocaleDateString([],{month:'long',year:'numeric'});
  $$('[data-cal-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.calView===view));b.classList.toggle('btn-primary',b.dataset.calView===view);});
  dayTitle.textContent=dateLabel(selected);renderSlots();
  const rows=scheduled().filter(j=>sameDay(j.scheduledStart,selected));
  agenda.innerHTML=rows.length?rows.map(j=>`<div class="ops-agenda-row" role="button" tabindex="0" data-cal-open-job="${esc(j.id)}"><time>${esc(time(j.scheduledStart))}</time><div><b>${esc(j.customerName||'Customer')}</b><span>${esc(vehicle(j.vehicle))}</span><small>${esc(j.location||'No service location')}</small><div class="ops-agenda-actions"><button type="button" class="btn btn-soft" data-cal-edit="${esc(j.id)}">Edit Time</button><button type="button" class="btn btn-soft" data-cal-maps="${esc(j.location||'')}">Maps</button><button type="button" class="btn btn-soft" data-cal-remove="${esc(j.id)}">Remove</button></div></div><em>${esc(j.status||'Job')}</em></div>`).join(''):'<div class="mmp-empty">No jobs on this day.</div>';
  const pending=unscheduled();
  needs.innerHTML=pending.length?pending.map(j=>`<div class="ops-need-card"><b>${esc(j.customerName||'Customer')} · ${esc(vehicle(j.vehicle))}</b><span>${esc(j.availability||'No requested time')}</span><small>${esc(j.complaint||'')}</small><div class="list-actions"><button class="btn btn-primary" type="button" data-cal-edit="${esc(j.id)}">Schedule</button><button class="btn btn-soft" type="button" data-cal-open-job="${esc(j.id)}">Open Job</button></div></div>`).join(''):'<div class="mmp-empty">Everything active is scheduled.</div>';
}
document.addEventListener('click',e=>{
  if(location.hash.split('?')[0]!=='#calendar')return;
  if(e.target.closest?.('[data-cal-slot-close]')){$('[data-cal-slot-picker]')?.remove();return;}
  const pickedJob=e.target.closest?.('[data-cal-slot-job]');if(pickedJob){e.preventDefault();const {calSlotJob:id,calSlotStart:start}=pickedJob.dataset;$('[data-cal-slot-picker]')?.remove();openSchedule(id,start);return;}
  const newJob=e.target.closest?.('[data-cal-slot-new]');if(newJob){e.preventDefault();const db=read();localStorage.setItem('mobile_mechanic_new_job_calendar_slot',JSON.stringify({start:newJob.dataset.calSlotNew,shopId:db.session?.shopId,createdAt:Date.now()}));$('[data-cal-slot-picker]')?.remove();location.hash='#new-intake';return;}
  const slot=e.target.closest?.('[data-cal-slot]');if(slot){e.preventDefault();chooseSlot(slot.dataset.calSlot);return;}
  const mode=e.target.closest?.('[data-cal-view]');if(mode){view=mode.dataset.calView;render();return;}
  const monthDay=e.target.closest?.('[data-cal-month-day]');if(monthDay){selected=new Date(`${monthDay.dataset.calMonthDay}T12:00:00`);week=startWeek(selected);view='day';render();return;}
  const day=e.target.closest?.('[data-cal-day]');if(day){selected=new Date(`${day.dataset.calDay}T12:00:00`);render();return;}
  if(e.target.closest?.('[data-cal-week-prev]')){if(view==='month'){selected=new Date(selected.getFullYear(),selected.getMonth()-1,1);week=startWeek(selected);}else{week=addDays(week,-7);selected=week;}render();return;}
  if(e.target.closest?.('[data-cal-week-next]')){if(view==='month'){selected=new Date(selected.getFullYear(),selected.getMonth()+1,1);week=startWeek(selected);}else{week=addDays(week,7);selected=week;}render();return;}
  if(e.target.closest?.('[data-cal-today]')){selected=new Date();week=startWeek(selected);render();return;}
  const edit=e.target.closest?.('[data-cal-edit]');if(edit){e.preventDefault();e.stopPropagation();const job=scheduled().find(j=>String(j.id)===String(edit.dataset.calEdit));const start=job?.scheduledStart||`${dayKey(selected)}T09:00`;openSchedule(edit.dataset.calEdit,start);return;}
  const map=e.target.closest?.('[data-cal-maps]');if(map){e.preventDefault();e.stopPropagation();maps(map.dataset.calMaps);return;}
  const rem=e.target.closest?.('[data-cal-remove]');if(rem){e.preventDefault();e.stopPropagation();removeSchedule(rem.dataset.calRemove);return;}
  const job=e.target.closest?.('[data-cal-open-job]');if(job){e.preventDefault();openJob(job.dataset.calOpenJob);}
},true);
document.addEventListener('keydown',e=>{const job=e.target.closest?.('[data-cal-open-job]');if(job&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openJob(job.dataset.calOpenJob);}});
new MutationObserver(()=>setTimeout(render,40)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(()=>{render();openPendingIntakeSchedule();},80));setTimeout(()=>{render();openPendingIntakeSchedule();},120);
})();
