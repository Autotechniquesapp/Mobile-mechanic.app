(() => {
'use strict';

const SLOT_START=8;
const SLOT_END=18;
const SLOT_STEP=30;

function pad(n){return String(n).padStart(2,'0');}
function localISODate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function displayDate(v){
  if(!v)return '';
  const [y,m,d]=v.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'});
}
function slotLabel(h,m){
  const d=new Date(2000,0,1,h,m);
  return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}
function slotValue(h,m){return `${pad(h)}:${pad(m)}`;}
function makeSlots(){
  const out=[];
  for(let mins=SLOT_START*60;mins<=SLOT_END*60;mins+=SLOT_STEP){
    const h=Math.floor(mins/60),m=mins%60;
    out.push({value:slotValue(h,m),label:slotLabel(h,m)});
  }
  return out;
}

function clearAsap(wrap){
  const asap=wrap.querySelector('[data-asap]');
  if(!asap)return;
  asap.classList.remove('selected','btn-primary');
  asap.classList.add('btn-soft');
}

function setAvailability(wrap){
  const hidden=wrap.querySelector('input[name="availability"]');
  const schedule=wrap.querySelector('[data-intake-schedule]');
  const asap=schedule?.querySelector('[data-asap].selected');
  const date=schedule?.querySelector('[data-intake-date]')?.value||'';
  const selected=schedule?.querySelector('[data-time-slot].selected');
  const time=selected?.dataset.timeSlot||'';
  if(!hidden)return;
  if(asap){
    hidden.value='As soon as possible';
    hidden.dataset.iso='';
  }else if(date&&time){
    hidden.value=`${displayDate(date)} at ${selected.textContent.trim()}`;
    hidden.dataset.iso=`${date}T${time}:00`;
  }else if(date){
    hidden.value=displayDate(date);
    hidden.dataset.iso='';
  }else{
    hidden.value='';
    hidden.dataset.iso='';
  }
}

function buildAvailability(field){
  if(!field||field.dataset.calendarUpgraded==='1')return;
  field.dataset.calendarUpgraded='1';
  const old=field.querySelector('input[name="availability"]');
  if(!old)return;
  old.type='hidden';
  old.placeholder='';

  const today=new Date();
  const max=new Date();max.setDate(max.getDate()+60);
  const wrap=document.createElement('div');
  wrap.dataset.intakeSchedule='1';
  wrap.innerHTML=`
    <label>Preferred Date & Time</label>
    <button type="button" class="btn btn-soft" data-asap style="width:100%;margin:0 0 10px;padding:11px 12px;font-weight:700">As soon as possible</button>
    <div class="small muted" style="margin:0 0 8px">Or choose a preferred date and arrival time below.</div>
    <div class="field"><input type="date" data-intake-date min="${localISODate(today)}" max="${localISODate(max)}" aria-label="Preferred appointment date"></div>
    <div class="small muted" style="margin:6px 0 8px">Choose a preferred arrival time. The shop will confirm the appointment.</div>
    <div data-time-slots style="display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:7px">
      ${makeSlots().map(s=>`<button type="button" class="btn btn-soft" data-time-slot="${s.value}" style="padding:9px 6px">${s.label}</button>`).join('')}
    </div>
    <div data-selected-time class="small" style="margin-top:8px"></div>`;
  old.insertAdjacentElement('afterend',wrap);

  const dateInput=wrap.querySelector('[data-intake-date]');
  const asapBtn=wrap.querySelector('[data-asap]');
  asapBtn.addEventListener('click',()=>{
    wrap.querySelectorAll('[data-time-slot]').forEach(b=>{b.classList.remove('selected','btn-primary');b.classList.add('btn-soft');});
    dateInput.value='';
    asapBtn.classList.add('selected','btn-primary');
    asapBtn.classList.remove('btn-soft');
    setAvailability(field);
    wrap.querySelector('[data-selected-time]').textContent='Requested: As soon as possible. The shop will confirm availability.';
  });
  dateInput.addEventListener('change',()=>{
    clearAsap(wrap);
    setAvailability(field);
    const msg=wrap.querySelector('[data-selected-time]');
    const sel=wrap.querySelector('[data-time-slot].selected');
    msg.textContent=dateInput.value?(sel?`Requested: ${displayDate(dateInput.value)} at ${sel.textContent.trim()}`:`Choose a time for ${displayDate(dateInput.value)}.`):'';
  });
  wrap.querySelectorAll('[data-time-slot]').forEach(btn=>btn.addEventListener('click',()=>{
    clearAsap(wrap);
    wrap.querySelectorAll('[data-time-slot]').forEach(b=>{b.classList.remove('selected','btn-primary');b.classList.add('btn-soft');});
    btn.classList.add('selected','btn-primary');btn.classList.remove('btn-soft');
    setAvailability(field);
    const msg=wrap.querySelector('[data-selected-time]');
    msg.textContent=dateInput.value?`Requested: ${displayDate(dateInput.value)} at ${btn.textContent.trim()}`:'Choose a date above to complete your request.';
  }));
}

function upgrade(){
  const form=document.getElementById('intakeForm');
  if(!form)return;
  const availability=form.querySelector('input[name="availability"]');
  if(!availability)return;
  buildAvailability(availability.closest('.field'));
}

new MutationObserver(upgrade).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(upgrade,120);
window.addEventListener('hashchange',()=>setTimeout(upgrade,120));
})();
