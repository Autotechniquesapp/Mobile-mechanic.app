(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
let busy=false;
let calendarMode='week';
let calendarAnchor=new Date();

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function db(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function shop(){const d=db(),sid=d.session?.shopId;return sid?d.shops?.[sid]:null;}
function shopId(){return db().session?.shopId||null;}
function vehicle(v={}){return [v.year,v.make,v.model,v.trim||v.submodel].filter(Boolean).join(' ')||'Vehicle details pending';}
function dayStart(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function sameDay(a,b){return dayStart(a).getTime()===dayStart(b).getTime();}
function fmtDay(d){return d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});}
function fmtTime(v){if(!v)return 'Time not set';return new Date(v).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}
function currentRoute(){return (location.hash||'#dashboard').slice(1).split('?')[0];}
function jobs(){return (shop()?.jobs||[]).filter(j=>j.status!=='Cancelled');}
function scheduledJobs(){return jobs().filter(j=>j.scheduledStart).sort((a,b)=>new Date(a.scheduledStart)-new Date(b.scheduledStart));}

function injectCss(){if(document.getElementById('mma-workflow-css'))return;const s=document.createElement('style');s.id='mma-workflow-css';s.textContent=`
.mma-pending-section,.mma-customer-summary,.mma-two-day,.mma-calendar-panel{margin-top:10px}
.mma-pending-head,.mma-day-head,.mma-calendar-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.mma-pending-head b,.mma-day-head b{font-size:12px;letter-spacing:.5px}
.mma-pending-card{padding:12px;border:1px solid #5d2a2e;background:#140d10;border-radius:11px;margin-top:8px}
.mma-pending-card>div:first-child{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.mma-pending-card p{margin:5px 0 0;color:var(--muted);font-size:11px}
.mma-pending-card .btn-row{margin-top:9px}
.mma-customer-summary button{width:100%;min-height:72px;border:0;background:transparent;color:inherit;display:flex;align-items:center;justify-content:space-between;text-align:left}
.mma-customer-summary strong{font-size:28px;color:#fff}.mma-customer-summary small{display:block;color:var(--muted);margin-top:3px}
.mma-two-day-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.mma-day{border:1px solid #29313a;background:#0c1015;border-radius:11px;padding:11px;min-width:0}
.mma-day-row{width:100%;border:1px solid #28313b;background:#10151b;color:#fff;border-radius:9px;padding:9px;margin-top:7px;text-align:left}
.mma-day-row b,.mma-day-row small{display:block}.mma-day-row small{color:var(--muted);margin-top:3px}
.mma-calendar-tools{margin:10px 0}.mma-calendar-tools .btn-row{gap:6px}.mma-calendar-tools button.active{background:linear-gradient(180deg,#ee3037,#bd171d);border-color:#ff4b50}
.mma-week-grid{display:grid;gap:10px}.mma-week-day{border:1px solid #29313a;border-radius:11px;background:#0c1015;padding:10px}.mma-week-day.today{border-color:#7c2b31;box-shadow:0 0 0 1px rgba(239,42,49,.16)}
.mma-week-day .list{margin-top:8px}.mma-month-scroll{overflow-x:auto}.mma-month-grid{display:grid;grid-template-columns:repeat(7,minmax(94px,1fr));gap:5px;min-width:720px}.mma-month-weekday{font-size:10px;color:var(--muted);text-align:center;padding:5px}.mma-month-day{min-height:96px;border:1px solid #29313a;border-radius:8px;background:#0c1015;padding:6px}.mma-month-day.muted{opacity:.38}.mma-month-day.today{border-color:#7c2b31}.mma-month-day>strong{font-size:11px}.mma-month-job{display:block;width:100%;border:0;background:#211114;color:#ff979b;border-radius:5px;padding:4px 5px;margin-top:4px;font-size:9px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:620px){.mma-two-day-grid{grid-template-columns:1fr}.mma-calendar-tools{align-items:stretch}.mma-calendar-tools>.btn-row{width:100%}.mma-calendar-tools>.btn-row .btn{flex:1}}
`;document.head.appendChild(s);}

async function pendingIntakes(){const sid=shopId(),sb=window.MobileMechanicSupabase;if(!sid||!sb)return[];const {data,error}=await sb.from('intake_submissions').select('*').eq('shop_id',sid).eq('status','new').order('created_at',{ascending:false});if(error)throw error;return data||[];}

function pendingCard(i){const v=i.vehicle||{};return `<div class="mma-pending-card"><div><div><b>${esc(i.customer_name||'Customer')} — ${esc(vehicle(v))}</b><p>${esc(i.customer_states||'No complaint entered')}</p></div><span class="badge red">PENDING INTAKE</span></div><p>${i.availability?`Requested: ${esc(i.availability)} · `:''}${esc(i.phone||'No phone')}</p><div class="btn-row"><button class="btn btn-primary" data-convert-intake="${esc(i.id)}">Convert to Job</button><button class="btn btn-soft" data-production-intake-queue>Review Intake</button></div></div>`;}

async function buildPendingSection(limit=3){const sec=document.createElement('section');sec.className='card card-pad mma-pending-section';sec.dataset.mmaPending='1';sec.innerHTML='<div class="mma-pending-head"><b>PENDING CUSTOMER INTAKES</b><span class="muted small">Loading…</span></div>';try{const items=await pendingIntakes();sec.innerHTML=`<div class="mma-pending-head"><b>PENDING CUSTOMER INTAKES</b><button class="btn btn-soft" data-production-intake-queue>${items.length} waiting</button></div>${items.length?items.slice(0,limit).map(pendingCard).join(''):'<div class="mmp-empty" style="margin-top:9px">No pending customer intakes.</div>'}`;}catch(err){sec.innerHTML='<div class="mma-pending-head"><b>PENDING CUSTOMER INTAKES</b></div><div class="mmp-empty" style="margin-top:9px">Could not load pending intakes.</div>';console.warn(err);}return sec;}

function twoDaySchedule(){const sec=document.createElement('section');sec.className='card card-pad mma-two-day';sec.dataset.mmaTwoDay='1';const today=dayStart(new Date()),tomorrow=addDays(today,1),all=scheduledJobs();const renderDay=(d,label)=>{const list=all.filter(j=>sameDay(new Date(j.scheduledStart),d));return `<div class="mma-day"><div class="mma-day-head"><b>${label}</b><span class="muted small">${esc(fmtDay(d))}</span></div>${list.length?list.map(j=>`<button class="mma-day-row" data-mma-route="calendar"><b>${esc(fmtTime(j.scheduledStart))} · ${esc(j.customerName||'Customer')}</b><small>${esc(vehicle(j.vehicle))} · ${esc(j.status||'Scheduled')}</small></button>`).join(''):'<div class="mmp-empty" style="margin-top:8px">No jobs scheduled.</div>'}</div>`;};sec.innerHTML=`<div class="mmp-section-head"><b>SCHEDULE — TODAY & TOMORROW</b><button data-mma-route="calendar">Open Calendar</button></div><div class="mma-two-day-grid">${renderDay(today,'TODAY')}${renderDay(tomorrow,'TOMORROW')}</div>`;return sec;}

function customerSummary(){const s=shop(),sec=document.createElement('section');sec.className='card card-pad mma-customer-summary';sec.dataset.mmaCustomers='1';sec.innerHTML=`<button data-mma-route="customers"><span><b>CUSTOMERS</b><small>Customer records and vehicle history</small></span><strong>${Number(s?.customers?.length||0)}</strong></button>`;return sec;}

function sectionByTitle(text){return [...document.querySelectorAll('.content section')].find(sec=>String(sec.querySelector('.mmp-section-head b,.card-title')?.textContent||'').toUpperCase().includes(text));}

async function enhanceDashboard(){const head=document.querySelector('.mmp-page-head');if(!head||document.querySelector('[data-mma-dashboard-done]'))return;head.dataset.mmaDashboardDone='1';document.querySelector('.mmp-intake-link')?.remove();document.querySelector('.mmp-metrics')?.remove();const active=sectionByTitle('ACTIVE JOBS');active?.remove();const oldSchedule=sectionByTitle("TODAY'S SCHEDULE");oldSchedule?.remove();const quick=document.querySelector('.mmp-quick');const revenue=document.querySelector('.mmp-revenue');if(!quick)return;const pending=await buildPendingSection();head.insertAdjacentElement('afterend',pending);pending.insertAdjacentElement('afterend',quick);const qButtons=quick.querySelectorAll('button');if(qButtons[1]){qButtons[1].dataset.route='send-intake';qButtons[1].innerHTML='<span>Share Intake</span>';}const customers=customerSummary();quick.insertAdjacentElement('afterend',customers);const schedule=twoDaySchedule();customers.insertAdjacentElement('afterend',schedule);if(revenue)schedule.insertAdjacentElement('afterend',revenue);const trial=[...document.querySelectorAll('.priority-strip')].find(x=>String(x.textContent).includes('trial'));if(trial&&revenue)revenue.insertAdjacentElement('afterend',trial);}

async function enhanceJobs(){const title=[...document.querySelectorAll('.page-title h2')].find(x=>x.textContent.trim()==='Jobs');if(!title)return;const root=title.closest('.page-title');if(document.querySelector('[data-mma-jobs-pending]'))return;const sec=await buildPendingSection(10);sec.dataset.mmaJobsPending='1';root.insertAdjacentElement('afterend',sec);}

function mondayOf(d){const x=dayStart(d),day=(x.getDay()+6)%7;return addDays(x,-day);}
function monthStart(d){return new Date(d.getFullYear(),d.getMonth(),1);}
function moveAllBack(stash,nodeMap){nodeMap.forEach(node=>stash.appendChild(node));}

function enhanceCalendar(){const title=[...document.querySelectorAll('.page-title h2')].find(x=>x.textContent.trim()==='Calendar');if(!title||document.querySelector('[data-mma-calendar-enhanced]'))return;const scheduledSec=[...document.querySelectorAll('.content section')].find(sec=>String(sec.querySelector('.card-title')?.textContent||'').includes('SCHEDULED JOBS'));if(!scheduledSec)return;const list=scheduledSec.querySelector('.list');const nodes=new Map();[...list?.children||[]].forEach(node=>{const b=node.querySelector('[data-action="schedule-job"][data-job]');if(b)nodes.set(b.dataset.job,node);});const stash=document.createElement('div');stash.style.display='none';scheduledSec.appendChild(stash);moveAllBack(stash,nodes);scheduledSec.style.display='none';const panel=document.createElement('section');panel.className='card card-pad mma-calendar-panel';panel.dataset.mmaCalendarEnhanced='1';scheduledSec.insertAdjacentElement('beforebegin',panel);
 const all=()=>scheduledJobs();
 function controls(){return `<div class="mma-calendar-tools"><div class="btn-row"><button class="btn btn-soft" data-cal-prev>‹</button><button class="btn btn-soft" data-cal-today>Today</button><button class="btn btn-soft" data-cal-next>›</button></div><div class="btn-row"><button class="btn btn-soft ${calendarMode==='week'?'active':''}" data-cal-mode="week">Week</button><button class="btn btn-soft ${calendarMode==='month'?'active':''}" data-cal-mode="month">Month</button></div></div>`;}
 function renderWeek(){moveAllBack(stash,nodes);const start=mondayOf(calendarAnchor);panel.innerHTML=`<div class="mmp-section-head"><b>WEEK OF ${esc(start.toLocaleDateString([], {month:'short',day:'numeric'}))}</b><span class="muted small">Edit or move jobs here</span></div>${controls()}<div class="mma-week-grid" data-week-grid></div>`;const grid=panel.querySelector('[data-week-grid]');for(let n=0;n<7;n++){const d=addDays(start,n),box=document.createElement('div');box.className='mma-week-day'+(sameDay(d,new Date())?' today':'');box.innerHTML=`<div class="mma-day-head"><b>${esc(fmtDay(d))}</b><span class="muted small"></span></div><div class="list"></div>`;const dest=box.querySelector('.list'),dayJobs=all().filter(j=>sameDay(new Date(j.scheduledStart),d));if(dayJobs.length){dayJobs.forEach(j=>{const node=nodes.get(j.id);if(node)dest.appendChild(node);});}else dest.innerHTML='<div class="mmp-empty">No jobs.</div>';grid.appendChild(box);}bindControls();}
 function renderMonth(){moveAllBack(stash,nodes);const first=monthStart(calendarAnchor),gridStart=addDays(first,-first.getDay()),month=first.getMonth();panel.innerHTML=`<div class="mmp-section-head"><b>${esc(first.toLocaleDateString([], {month:'long',year:'numeric'}).toUpperCase())}</b><span class="muted small">Tap a job to open its week</span></div>${controls()}<div class="mma-month-scroll"><div class="mma-month-grid" data-month-grid>${['SUN','MON','TUE','WED','THU','FRI','SAT'].map(x=>`<div class="mma-month-weekday">${x}</div>`).join('')}</div></div>`;const grid=panel.querySelector('[data-month-grid]'),scheduled=all();for(let n=0;n<42;n++){const d=addDays(gridStart,n),cell=document.createElement('div');cell.className='mma-month-day'+(d.getMonth()!==month?' muted':'')+(sameDay(d,new Date())?' today':'');const js=scheduled.filter(j=>sameDay(new Date(j.scheduledStart),d));cell.innerHTML=`<strong>${d.getDate()}</strong>${js.map(j=>`<button class="mma-month-job" data-cal-open-date="${d.toISOString()}">${esc(fmtTime(j.scheduledStart))} ${esc(j.customerName||'Customer')}</button>`).join('')}`;grid.appendChild(cell);}bindControls();}
 function render(){calendarMode==='month'?renderMonth():renderWeek();}
 function bindControls(){panel.querySelector('[data-cal-prev]')?.addEventListener('click',()=>{calendarAnchor=calendarMode==='month'?new Date(calendarAnchor.getFullYear(),calendarAnchor.getMonth()-1,1):addDays(calendarAnchor,-7);render();});panel.querySelector('[data-cal-next]')?.addEventListener('click',()=>{calendarAnchor=calendarMode==='month'?new Date(calendarAnchor.getFullYear(),calendarAnchor.getMonth()+1,1):addDays(calendarAnchor,7);render();});panel.querySelector('[data-cal-today]')?.addEventListener('click',()=>{calendarAnchor=new Date();render();});panel.querySelectorAll('[data-cal-mode]').forEach(b=>b.addEventListener('click',()=>{calendarMode=b.dataset.calMode;render();}));panel.querySelectorAll('[data-cal-open-date]').forEach(b=>b.addEventListener('click',()=>{calendarAnchor=new Date(b.dataset.calOpenDate);calendarMode='week';render();setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),20);}));}
 render();}

async function enhance(){if(busy)return;busy=true;try{injectCss();const route=currentRoute();if(route==='dashboard')await enhanceDashboard();else if(route==='jobs')await enhanceJobs();else if(route==='calendar')enhanceCalendar();}finally{busy=false;}}

document.addEventListener('click',e=>{const b=e.target.closest?.('[data-mma-route]');if(!b)return;e.preventDefault();location.hash='#'+b.dataset.mmaRoute;},true);
let timer=null;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(enhance,80);}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(enhance,120));
window.addEventListener('focus',()=>setTimeout(enhance,80));
setTimeout(enhance,350);
})();
