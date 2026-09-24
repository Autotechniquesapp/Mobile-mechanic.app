(() => {
'use strict';
if(window.__MMAIntakeSchedulerLoaded)return;
window.__MMAIntakeSchedulerLoaded=true;

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const pad=n=>String(n).padStart(2,'0');
const dayKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const sameDay=(a,b)=>dayKey(a)===dayKey(b);
const overlap=(a0,a1,b0,b1)=>a0<b1&&a1>b0;
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const startOfWeek=d=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x;};

function ensureStyles(){
  if(document.getElementById('mma-intake-scheduler-styles'))return;
  const s=document.createElement('style');s.id='mma-intake-scheduler-styles';s.textContent=`
  .mma-intake-scheduler{border:1px solid #d8dde4;border-radius:14px;background:#fff;color:#1f2328;padding:12px;margin-top:2px;box-shadow:0 5px 18px rgba(0,0,0,.06)}
  .customer-shell .mma-intake-scheduler{background:#fff;color:#1f2328}
  .mma-intake-cal-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
  .mma-intake-cal-head b{font-size:14px}.mma-intake-cal-head span{font-size:11px;color:#68707a}
  .mma-intake-week-nav{display:flex;gap:6px}.mma-intake-week-nav button{border:1px solid #d6dbe2;background:#fff;color:#252a30;border-radius:9px;padding:7px 10px;font-weight:800}
  .mma-intake-days{display:grid;grid-template-columns:repeat(7,minmax(48px,1fr));gap:5px}
  .mma-intake-day{border:1px solid #dce1e7;background:#fff;color:#23272d;border-radius:11px;min-height:62px;padding:6px 3px;text-align:center}
  .mma-intake-day small,.mma-intake-day b{display:block}.mma-intake-day small{font-size:9px;color:#747c86;text-transform:uppercase}.mma-intake-day b{font-size:17px;margin-top:3px}
  .mma-intake-day.today{border-color:#ef2a31}.mma-intake-day.selected{background:#ef2a31;color:#fff;border-color:#ef2a31}.mma-intake-day.selected small{color:#fff}
  .mma-intake-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:11px}
  .mma-intake-slot{border:1px solid #cfd5dc;background:#fff;color:#20252b;border-radius:9px;padding:9px 4px;font-weight:800;font-size:12px}
  .mma-intake-slot:hover{border-color:#ef2a31}.mma-intake-slot.selected{background:#ef2a31;color:#fff;border-color:#ef2a31}.mma-intake-slot:disabled{opacity:.35;text-decoration:line-through;background:#f1f3f5}
  .mma-intake-cal-note{font-size:10px;color:#717983;margin-top:9px;line-height:1.35}.mma-intake-cal-selected{margin-top:10px;padding:9px 10px;border-radius:9px;background:#f7f8fa;border:1px solid #dfe3e8;font-size:12px;font-weight:800}
  .mma-intake-cal-status{font-size:10px;color:#717983;margin:8px 0 0}
  @media(max-width:560px){.mma-intake-scheduler{padding:10px}.mma-intake-days{gap:3px}.mma-intake-day{min-height:58px;padding:5px 2px}.mma-intake-day b{font-size:16px}.mma-intake-slots{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `;document.head.appendChild(s);
}

function client(){
  if(window.MobileMechanicSupabase)return window.MobileMechanicSupabase;
  const cfg=window.MobileMechanicIntakeConfig;
  if(cfg?.supabaseUrl&&cfg?.publishableKey&&window.supabase?.createClient){
    window.__MMAIntakeSchedulerClient ||= window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    return window.__MMAIntakeSchedulerClient;
  }
  return null;
}

function shopId(form){return form.dataset.shop||window.MobileMechanicIntakeConfig?.shopId||'';}

async function busyFor(form,start,end){
  const sb=client(),id=shopId(form);if(!sb||!id)return {busy:[],google_connected:false};
  const {data,error}=await sb.functions.invoke('public-availability',{body:{shop_id:id,range_start:start.toISOString(),range_end:end.toISOString()}});
  if(error||data?.error)throw error||new Error(data.error);
  return data||{busy:[]};
}

function labelFor(d){
  return d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'});
}
function timeLabel(d){return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}
function valueFor(d){return `${d.toLocaleDateString()} at ${timeLabel(d)}`;}

function mount(form){
  const input=form.elements.availability;
  if(!input||input.dataset.mmaSchedulerMounted==='1')return;
  input.dataset.mmaSchedulerMounted='1';
  ensureStyles();
  const field=input.closest('.field')||input.parentElement;
  const oldLabel=field?.querySelector('label');if(oldLabel)oldLabel.textContent='Preferred Appointment';
  input.type='hidden';

  let week=startOfWeek(today()),selectedDay=today(),selectedTime=null,busy=[],google=false,loading=false;
  const wrap=document.createElement('div');wrap.className='mma-intake-scheduler';wrap.innerHTML=`
    <div class="mma-intake-cal-head"><div><b>Pick a day and time</b><br><span>Choose the time that works best for you.</span></div><div class="mma-intake-week-nav"><button type="button" data-mma-week-prev aria-label="Previous week">‹</button><button type="button" data-mma-week-next aria-label="Next week">›</button></div></div>
    <div class="mma-intake-days" data-mma-days></div>
    <div class="mma-intake-slots" data-mma-slots></div>
    <div class="mma-intake-cal-selected" data-mma-selected>No time selected yet.</div>
    <div class="mma-intake-cal-status" data-mma-status>Checking the shop calendar…</div>
    <div class="mma-intake-cal-note">This is a requested appointment time. The shop will confirm it. Busy times from the shop calendar and connected Google Calendar are not offered.</div>`;
  input.insertAdjacentElement('afterend',wrap);

  const days=wrap.querySelector('[data-mma-days]'),slots=wrap.querySelector('[data-mma-slots]'),status=wrap.querySelector('[data-mma-status]'),selected=wrap.querySelector('[data-mma-selected]');

  const slotDates=()=>{
    const out=[];
    for(let h=8;h<18;h++)for(const m of [0,30]){const d=new Date(selectedDay);d.setHours(h,m,0,0);out.push(d);}
    return out;
  };
  const isBusy=d=>{
    const end=new Date(d.getTime()+60*60000);
    return busy.some(x=>overlap(d.getTime(),end.getTime(),new Date(x.start).getTime(),new Date(x.end).getTime()));
  };
  function renderDays(){
    days.innerHTML=Array.from({length:7},(_,i)=>{
      const d=addDays(week,i),past=d<today(),cls=[sameDay(d,today())?'today':'',sameDay(d,selectedDay)?'selected':''].filter(Boolean).join(' ');
      return `<button type="button" class="mma-intake-day ${cls}" data-mma-day="${dayKey(d)}" ${past?'disabled':''}><small>${esc(d.toLocaleDateString([],{weekday:'short'}))}</small><b>${d.getDate()}</b></button>`;
    }).join('');
  }
  function renderSlots(){
    const now=Date.now();
    slots.innerHTML=slotDates().map(d=>{
      const unavailable=d.getTime()<now+30*60000||isBusy(d),chosen=selectedTime&&d.getTime()===selectedTime.getTime();
      return `<button type="button" class="mma-intake-slot ${chosen?'selected':''}" data-mma-slot="${d.toISOString()}" ${unavailable?'disabled':''}>${esc(timeLabel(d))}</button>`;
    }).join('');
    if(!slots.querySelector('button:not(:disabled)'))slots.innerHTML='<div style="grid-column:1/-1;padding:12px;text-align:center;color:#6b737d">No open times that day. Pick another date.</div>';
  }
  async function load(){
    if(loading)return;loading=true;status.textContent='Checking the shop calendar…';
    const rangeStart=new Date(week);rangeStart.setHours(0,0,0,0);const rangeEnd=addDays(rangeStart,7);rangeEnd.setHours(23,59,59,999);
    try{
      const data=await busyFor(form,rangeStart,rangeEnd);busy=Array.isArray(data.busy)?data.busy:[];google=!!data.google_connected;
      status.textContent=google?'Live availability includes the connected Google Calendar.':'Live shop availability loaded.';
    }catch(err){
      console.warn('Availability lookup failed',err);busy=[];status.textContent='Live availability could not load. You can still request a time and the shop will confirm it.';
    }finally{loading=false;renderDays();renderSlots();}
  }

  wrap.addEventListener('click',e=>{
    const day=e.target.closest('[data-mma-day]');if(day){
      selectedDay=new Date(`${day.dataset.mmaDay}T12:00:00`);selectedTime=null;input.value='';selected.textContent='No time selected yet.';renderDays();renderSlots();return;
    }
    const slot=e.target.closest('[data-mma-slot]');if(slot){
      selectedTime=new Date(slot.dataset.mmaSlot);input.value=valueFor(selectedTime);selected.textContent=`Requested: ${labelFor(selectedTime)} at ${timeLabel(selectedTime)}`;renderSlots();input.dispatchEvent(new Event('change',{bubbles:true}));return;
    }
    if(e.target.closest('[data-mma-week-prev]')){
      const min=startOfWeek(today()),next=addDays(week,-7);if(next<min)return;week=next;selectedDay=week;selectedTime=null;input.value='';selected.textContent='No time selected yet.';load();return;
    }
    if(e.target.closest('[data-mma-week-next]')){
      if(week>=addDays(startOfWeek(today()),21))return;week=addDays(week,7);selectedDay=week;selectedTime=null;input.value='';selected.textContent='No time selected yet.';load();return;
    }
  });
  renderDays();load();
}

function scan(){document.querySelectorAll('form#intakeForm').forEach(mount);}
new MutationObserver(()=>setTimeout(scan,40)).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',scan,{once:true});setTimeout(scan,100);
})();