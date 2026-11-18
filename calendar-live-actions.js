(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7',sb=window.MobileMechanicSupabase;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const read=()=>{try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}};
const write=db=>localStorage.setItem(DBKEY,JSON.stringify(db));
const clock=window.MobileMechanicScheduleTime;
const wallDate=value=>new Date(clock.wallValue(value)+'Z');
const dayKey=d=>d.toISOString().slice(0,10);
const startWeek=d=>{const x=new Date(d);x.setUTCHours(0,0,0,0);x.setUTCDate(x.getUTCDate()-x.getUTCDay());return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x;};
const today=()=>wallDate(new Date());
const vehicle=v=>[v?.year,v?.make,v?.model,v?.trim||v?.submodel].filter(Boolean).join(' ')||'Vehicle details pending';
const time=v=>new Date(v).toLocaleTimeString([],{timeZone:clock.zone(),hour:'numeric',minute:'2-digit'});
const dateLabel=d=>new Date(d).toLocaleDateString([],{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'});
let week=startWeek(today()),selected=today(),view=window.innerWidth<700?'day':'week',highlight=null;

function shop(){const db=read(),sid=db.session?.shopId;return sid?db.shops?.[sid]:null;}
function canManageInvoices(){const db=read(),user=shop()?.users?.find(u=>String(u.id)===String(db.session?.userId));return ['owner','shop_owner','manager','service_writer'].includes(user?.role);}
function finishActions(j){return `<button type="button" class="btn btn-green" data-action="complete-job" data-job="${esc(j.id)}">Complete Job</button>${canManageInvoices()?`<button type="button" class="btn btn-primary" data-cal-invoice="${esc(j.id)}">Invoice / Record Payment</button>`:''}`;}
function activeJobs(){return (shop()?.jobs||[]).filter(j=>!j.completedAt&&!['Completed','Cancelled'].includes(j.status)&&!String(j.status||'').toLowerCase().includes('declined'));}
function scheduled(){return activeJobs().filter(j=>j.scheduledStart).sort((a,b)=>new Date(a.scheduledStart)-new Date(b.scheduledStart));}
function unscheduled(){return (shop()?.jobs||[]).filter(j=>!j.scheduledStart);}
function notify(msg,type='good'){if(typeof window.toast==='function')return window.toast(msg,type);document.querySelector('.toast')?.remove();const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3000);}
function openJob(id){
  const trigger=document.createElement('button');
  trigger.hidden=true;trigger.dataset.openJob=id;trigger.dataset.mmaNativeOpen='1';
  document.body.appendChild(trigger);trigger.click();trigger.remove();
}
function openSchedule(id,start=''){
  const job=shop()?.jobs?.find(j=>String(j.id)===String(id));
  if(!job)return notify('That job could not be opened for scheduling.','bad');
  const panel=window.MobileMechanicOpenSchedule?.(job,{initialStart:start});
  if(job.scheduledStart&&panel){
    $('[data-action="save-schedule"]',panel)?.insertAdjacentHTML('afterend',
      `<div class="btn-row" data-cal-finish-actions>${finishActions(job)}</div>`);
  }
}
function openInvoice(id){
  if(!canManageInvoices())return;
  const db=read(),job=shop()?.jobs?.find(j=>String(j.id)===String(id));if(!job)return notify('This job is no longer available.','bad');
  db.session.activeJobId=job.id;write(db);document.querySelector('.modal-backdrop')?.remove();
  let timer;const observer=new MutationObserver(()=>focusInvoice());
  function focusInvoice(){const invoice=$('[data-next-invoice]');if(!invoice||String(read().session?.activeJobId)!==String(id))return;observer.disconnect();clearTimeout(timer);invoice.scrollIntoView?.({block:'start',behavior:'smooth'});}
  observer.observe(document.documentElement,{childList:true,subtree:true});timer=setTimeout(()=>observer.disconnect(),10000);
  const trigger=document.createElement('button');trigger.hidden=true;trigger.dataset.openJob=String(id);trigger.dataset.mmaNativeOpen='1';document.body.appendChild(trigger);trigger.click();trigger.remove();focusInvoice();
}
window.MobileMechanicCalendar={
  showJob(id,start){
    const d=wallDate(start);
    if(!Number.isFinite(d.getTime()))return;
    selected=d;week=startWeek(d);highlight=String(id);
    if(view==='month')view='day';
    const route=`#calendar?day=${dayKey(d)}`;
    if(location.hash!==route)location.hash=route;
    render();
  },
  showNeedsTime(){
    if(location.hash.split('?')[0]!=='#calendar')location.hash='#calendar';
    setTimeout(()=>$('[data-cal-unscheduled]')?.scrollIntoView?.({block:'start'}),100);
  }
};
async function removeSchedule(id){
  if(!confirm('Remove this appointment from the calendar? The job stays saved.'))return;
  const db=read(),sid=db.session?.shopId,j=db.shops?.[sid]?.jobs?.find(x=>String(x.id)===String(id));if(!sid||!j)return;
  try{
    if(!sb)throw new Error('Live database is unavailable.');
    const {error}=await sb.from('jobs').update({scheduled_start_at:null,scheduled_end_at:null}).eq('id',id).eq('shop_id',sid);if(error)throw error;
    j.scheduledStart=null;j.scheduledEnd=null;write(db);
    try{await sb.functions.invoke('calendar-sync',{body:{action:'sync_job',job_id:id,shop_id:sid}});}catch(err){console.warn('External calendar remove failed',err);}
    notify('Appointment removed.');render();
  }catch(err){notify(err?.message||'Could not remove appointment.','bad');}
}
function maps(loc){if(!loc)return notify('No service location saved.','bad');window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc)}`,'_blank','noopener');}
function styles(){if($('#mma-slot-calendar-style'))return;const style=document.createElement('style');style.id='mma-slot-calendar-style';style.textContent=`
.ops-saved-appointment{outline:2px solid #41b866;outline-offset:-2px}.mma-calendar-scroll{max-height:60vh;overflow:auto;border:1px solid #34404c;border-radius:10px;margin:12px 0}.mma-slot-calendar{display:grid;grid-template-columns:60px repeat(var(--days),minmax(110px,1fr));min-width:var(--grid-width);background:#10161d}.mma-slot-head{position:sticky;top:0;z-index:2;background:#1d2732;padding:10px 5px;text-align:center;border-bottom:1px solid #46515d;font-weight:bold}.mma-slot-time{padding:8px 4px;font-size:11px;color:#aab5c2;border-bottom:1px solid #34404c}.mma-calendar-slot{min-height:44px;background:#111820;color:#dce5ee;border:0;border-left:1px solid #34404c;border-bottom:1px solid #34404c;text-align:left;padding:6px;cursor:pointer;font-size:11px}.mma-calendar-slot:hover,.mma-calendar-slot:focus-visible{background:#303c48;outline:2px solid #ef2a31;outline-offset:-2px}.mma-calendar-slot.busy{background:#54282b;color:#fff}.mma-calendar-slot b,.mma-calendar-slot small{display:block}.mma-month-grid-live{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;margin:12px 0}.mma-month-date{min-height:78px;background:#111820;color:#eef3f8;border:1px solid #34404c;border-radius:7px;text-align:left;padding:7px}.mma-month-date.today{border-color:#ef2a31}.mma-month-date.outside{opacity:.5}.mma-month-date small{display:block;font-size:10px;margin-top:5px}.mma-month-date.active{background:#54282b}.mma-calendar-pick{position:fixed;inset:0;z-index:10000;background:#000b;display:flex;align-items:center;justify-content:center;padding:14px}.mma-calendar-pick>section{width:min(520px,100%);max-height:85vh;overflow:auto;background:#111820;color:#fff;border:1px solid #46515d;border-radius:14px;padding:18px}.mma-calendar-pick .btn{margin:5px 0}
`;document.head.appendChild(style);}
function chooseSlot(start){const d=new Date(start);if(Number.isNaN(d.getTime()))return;const pending=unscheduled();document.querySelector('[data-cal-slot-picker]')?.remove();const wrap=document.createElement('div');wrap.className='mma-calendar-pick';wrap.dataset.calSlotPicker='1';wrap.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Schedule a job"><div class="modal-head"><h2>${esc(dateLabel(wallDate(d)))} · ${esc(time(d))}</h2><button class="close-btn" type="button" data-cal-slot-close>×</button></div><p>Choose a job for this calendar spot.</p>${pending.map(j=>`<div class="list-actions"><button type="button" class="record-link" data-cal-open-job="${esc(j.id)}">${esc(j.customerName||'Customer')}</button><span>${esc(vehicle(j.vehicle))}</span><button class="btn btn-soft" type="button" data-cal-slot-job="${esc(j.id)}" data-cal-slot-start="${esc(start)}">Select</button></div>`).join('')||'<p>No jobs are waiting for a time.</p>'}<button class="btn btn-primary btn-wide" type="button" data-cal-slot-new="${esc(start)}">+ New Job at This Time</button></section>`;document.body.appendChild(wrap);}
function renderSlots(){const host=$('[data-cal-slot-grid]');if(!host)return;styles();const all=scheduled();
 if(view==='month'){const first=new Date(Date.UTC(selected.getUTCFullYear(),selected.getUTCMonth(),1)),start=addDays(first,-first.getUTCDay());host.innerHTML=`<div class="mma-month-grid-live">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<b style="text-align:center">${d}</b>`).join('')}${Array.from({length:42},(_,i)=>{const d=addDays(start,i),jobs=all.filter(j=>clock.wallValue(j.scheduledStart).slice(0,10)===dayKey(d));return `<button type="button" class="mma-month-date ${d.getUTCMonth()!==first.getUTCMonth()?'outside':''} ${dayKey(d)===dayKey(today())?'today':''} ${dayKey(d)===dayKey(selected)?'active':''}" data-cal-month-day="${dayKey(d)}" aria-label="${esc(dateLabel(d))}"><b>${d.getUTCDate()}</b>${jobs.slice(0,2).map(j=>`<small>${esc(time(j.scheduledStart))} ${esc(j.customerName||'Customer')}</small>`).join('')}${jobs.length>2?`<small>+${jobs.length-2} more</small>`:''}</button>`;}).join('')}</div>`;return;}
 const days=view==='week'?Array.from({length:7},(_,i)=>addDays(week,i)):[new Date(selected)];
 let cells=`<div class="mma-slot-head"></div>${days.map(d=>`<div class="mma-slot-head">${esc(d.toLocaleDateString([],{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}))}</div>`).join('')}`;
 for(let n=0;n<48;n++){const labelTime=new Date(selected);labelTime.setUTCHours(Math.floor(n/2),n%2*30,0,0);cells+=`<div class="mma-slot-time">${esc(labelTime.toLocaleTimeString([],{timeZone:'UTC',hour:'numeric',minute:'2-digit'}))}</div>`;for(const day of days){const start=new Date(day);start.setUTCHours(Math.floor(n/2),n%2*30,0,0);const instant=clock.toInstant(start.toISOString().slice(0,16));if(!instant){cells+='<span></span>';continue;}const end=instant.getTime()+30*60000,job=all.find(j=>new Date(j.scheduledStart).getTime()<end&&new Date(j.scheduledEnd||new Date(new Date(j.scheduledStart).getTime()+60*60000)).getTime()>instant.getTime());cells+=`<button type="button" class="mma-calendar-slot ${job?'busy':''}" ${job?`data-cal-edit="${esc(job.id)}"`:`data-cal-slot="${instant.toISOString()}"`} aria-label="${esc(dateLabel(start)+' '+time(instant)+(job?' - edit '+job.customerName:' - schedule a job'))}">${job?`<b>${esc(job.customerName||'Customer')}</b><small>${esc(time(job.scheduledStart))} · ${esc(vehicle(job.vehicle))}</small>`:'<span aria-hidden="true">+</span>'}</button>`;}}
 host.innerHTML=`<div class="mma-calendar-scroll"><div class="mma-slot-calendar" style="--days:${days.length};--grid-width:${view==='week'?'840px':'0'}">${cells}</div></div>`;host.querySelector('.mma-calendar-scroll').scrollTop=16*44;
}
function render(){
  if(location.hash.split('?')[0]!=='#calendar')return;
  const root=$('[data-mma-calendar]');if(!root)return;
  const signature=JSON.stringify({view,week:dayKey(week),selected:dayKey(selected),highlight,jobs:shop()?.jobs});if(root.dataset.calRenderKey===signature)return;root.dataset.calRenderKey=signature;
  const strip=$('[data-cal-week-strip]'),agenda=$('[data-cal-agenda]'),needs=$('[data-cal-unscheduled]'),title=$('[data-cal-week-title]'),dayTitle=$('[data-cal-day-title]');
  const end=addDays(week,6);title.textContent=`${week.toLocaleDateString([],{timeZone:'UTC',month:'short',day:'numeric'})} – ${end.toLocaleDateString([],{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})}`;
  strip.innerHTML=Array.from({length:7},(_,i)=>{const d=addDays(week,i),count=scheduled().filter(j=>clock.wallValue(j.scheduledStart).slice(0,10)===dayKey(d)).length;return `<button type="button" class="ops-cal-day ${dayKey(d)===dayKey(today())?'today':''} ${dayKey(d)===dayKey(selected)?'active':''}" data-cal-day="${dayKey(d)}"><small>${esc(d.toLocaleDateString([],{timeZone:'UTC',weekday:'short'}))}</small><b>${d.getUTCDate()}</b><small>${count?count+' job'+(count===1?'':'s'):''}</small></button>`;}).join('');
  if(view==='month')title.textContent=selected.toLocaleDateString([],{timeZone:'UTC',month:'long',year:'numeric'});
  $$('[data-cal-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.calView===view));b.classList.toggle('btn-primary',b.dataset.calView===view);});
  dayTitle.textContent=dateLabel(selected);renderSlots();
  const rows=scheduled().filter(j=>clock.wallValue(j.scheduledStart).slice(0,10)===dayKey(selected));
  agenda.innerHTML=rows.length?rows.map(j=>`<div class="ops-agenda-row ${String(j.id)===highlight?'ops-saved-appointment':''}" data-calendar-job="${esc(j.id)}"><time>${esc(time(j.scheduledStart))}</time><div><button type="button" class="record-link" data-cal-open-job="${esc(j.id)}">${esc(j.customerName||'Customer')}</button><span>${esc(vehicle(j.vehicle))}</span><small>${esc((window.MobileMechanicScheduleDetails?.destination(j)||j.location||'')||'No service location')}</small><div class="ops-agenda-actions">${finishActions(j)}<button type="button" class="btn btn-soft" data-cal-edit="${esc(j.id)}">Edit Time</button><button type="button" class="btn btn-soft" data-cal-maps="${esc((window.MobileMechanicScheduleDetails?.destination(j)||j.location||''))}">Navigate</button><button type="button" class="btn btn-soft" data-cal-remove="${esc(j.id)}">Remove</button></div></div><em>${esc(j.status||'Job')}</em></div>`).join(''):'<div class="mmp-empty">No jobs on this day.</div>';
  $('.ops-saved-appointment',agenda)?.scrollIntoView?.({block:'nearest'});
  const pending=unscheduled();
  needs.innerHTML=pending.length?pending.map(j=>`<div class="ops-need-card"><button type="button" class="record-link" data-cal-open-job="${esc(j.id)}">${esc(j.customerName||'Customer')}</button><b>${esc(vehicle(j.vehicle))}</b><span>${esc(j.availability||'No requested time')}</span><small>${esc(j.complaint||'')}</small><div class="list-actions"><button class="btn btn-primary" type="button" data-cal-edit="${esc(j.id)}">Schedule</button></div></div>`).join(''):'<div class="mmp-empty">No jobs need a time.</div>';
}
document.addEventListener('click',e=>{
  if(location.hash.split('?')[0]!=='#calendar')return;
  if(e.target.closest?.('[data-cal-slot-close]')){$('[data-cal-slot-picker]')?.remove();return;}
  const pickedJob=e.target.closest?.('[data-cal-slot-job]');if(pickedJob){e.preventDefault();const {calSlotJob:id,calSlotStart:start}=pickedJob.dataset;$('[data-cal-slot-picker]')?.remove();openSchedule(id,start);return;}
  const newJob=e.target.closest?.('[data-cal-slot-new]');if(newJob){e.preventDefault();const db=read();localStorage.setItem('mobile_mechanic_new_job_calendar_slot',JSON.stringify({start:newJob.dataset.calSlotNew,shopId:db.session?.shopId,createdAt:Date.now()}));$('[data-cal-slot-picker]')?.remove();location.hash='#new-intake';return;}
  const slot=e.target.closest?.('[data-cal-slot]');if(slot){e.preventDefault();chooseSlot(slot.dataset.calSlot);return;}
  const mode=e.target.closest?.('[data-cal-view]');if(mode){view=mode.dataset.calView;render();return;}
  const monthDay=e.target.closest?.('[data-cal-month-day]');if(monthDay){selected=new Date(`${monthDay.dataset.calMonthDay}T12:00:00Z`);week=startWeek(selected);view='day';render();return;}
  const day=e.target.closest?.('[data-cal-day]');if(day){selected=new Date(`${day.dataset.calDay}T12:00:00Z`);render();return;}
  if(e.target.closest?.('[data-cal-week-prev]')){if(view==='month'){selected=new Date(selected.getFullYear(),selected.getUTCMonth()-1,1);week=startWeek(selected);}else{week=addDays(week,-7);selected=week;}render();return;}
  if(e.target.closest?.('[data-cal-week-next]')){if(view==='month'){selected=new Date(selected.getFullYear(),selected.getUTCMonth()+1,1);week=startWeek(selected);}else{week=addDays(week,7);selected=week;}render();return;}
  if(e.target.closest?.('[data-cal-today]')){selected=today();week=startWeek(selected);render();return;}
  const invoice=e.target.closest?.('[data-cal-invoice]');if(invoice){e.preventDefault();e.stopImmediatePropagation();openInvoice(invoice.dataset.calInvoice);return;}
  const edit=e.target.closest?.('[data-cal-edit]');if(edit){e.preventDefault();e.stopPropagation();const job=scheduled().find(j=>String(j.id)===String(edit.dataset.calEdit));const start=job?.scheduledStart||clock.toInstant(`${dayKey(selected)}T09:00`)?.toISOString();openSchedule(edit.dataset.calEdit,start);return;}
  const map=e.target.closest?.('[data-cal-maps]');if(map){e.preventDefault();e.stopPropagation();maps(map.dataset.calMaps);return;}
  const rem=e.target.closest?.('[data-cal-remove]');if(rem){e.preventDefault();e.stopPropagation();removeSchedule(rem.dataset.calRemove);return;}
  const job=e.target.closest?.('[data-cal-open-job]');if(job){e.preventDefault();$('[data-cal-slot-picker]')?.remove();openJob(job.dataset.calOpenJob);}
},true);
function restoreCalendarDay(){
  if(location.hash.split('?')[0]!=='#calendar')return;
  const day=new URLSearchParams(location.hash.split('?')[1]).get('day');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return;
  const d=new Date(day+'T12:00:00Z');
  if(Number.isFinite(d.getTime())){selected=d;week=startWeek(d);}
}
restoreCalendarDay();
new MutationObserver(()=>setTimeout(()=>{render();},40)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{restoreCalendarDay();setTimeout(render,80);});setTimeout(()=>{render();},120);
})();

