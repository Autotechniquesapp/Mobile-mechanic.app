(() => {
'use strict';
const cap=window.Capacitor;
if(!cap?.isNativePlatform?.()||cap.getPlatform?.()!=='android')return;
if(window.MobileMechanicScheduleReminders)return;
const local=cap.registerPlugin?.('LocalNotifications')||cap.Plugins?.LocalNotifications;
if(!local)return;
const DBKEY='mobile_mechanic_ai_approved_v7',CHANNEL='scheduled_jobs_v1',OWNER='mma-scheduled-job',PREF='mma_schedule_reminders_';
let syncing=false,again=false,lastSignature='',listenerReady=false,lastFetch=0,queuedJob=null,lastSnapshot=null,ready=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(){try{const db=JSON.parse(localStorage.getItem(DBKEY)||'{}'),session=db.session;return session?.role==='shop'&&db.shops?.[session.shopId]?{sid:session.shopId,uid:session.userId,shop:db.shops[session.shopId]}:null;}catch{return null;}}
function preferences(sid){try{const p=JSON.parse(localStorage.getItem(PREF+sid)||'{}');return {enabled:p.enabled!==false,minutes:[0,15,30,60,120].includes(p.minutes)?p.minutes:30};}catch{return {enabled:true,minutes:30};}}
function active(job){return !job.completedAt&&!job.completed_at&&!/^(completed|paid|cancelled|canceled|customer declined|declined)$/i.test(job.status||'');}
function plan(ctx,pref,now=Date.now()){
  if(!ctx||!pref.enabled)return [];
  const used=new Set();
  return (ctx.shop.jobs||[]).filter(j=>active(j)&&j.scheduledStart&&new Date(j.scheduledStart).getTime()>now).sort((a,b)=>String(a.id).localeCompare(String(b.id))).flatMap(job=>{
    const start=new Date(job.scheduledStart).getTime(),at=start-pref.minutes*60000;
    // If the reminder window has passed, remind at appointment time rather than alerting late immediately.
    const fireAt=at>now?at:start;
    let id=2166136261;for(const c of `${ctx.sid}:${job.id}`)id=Math.imul(id^c.charCodeAt(0),16777619)>>>0;
    id=(id%2147483646)+1;while(used.has(id))id=id===2147483647?1:id+1;used.add(id);
    const vehicle=[job.vehicle?.year,job.vehicle?.make,job.vehicle?.model].filter(Boolean).join(' '),when=new Date(start).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    return [{id,title:`Scheduled job · ${when}`,body:[job.customerName||'Customer',vehicle,job.location||job.address].filter(Boolean).join(' · '),channelId:CHANNEL,foreground:true,smallIcon:'ic_stat_job',iconColor:'#ef2a31',schedule:{at:new Date(fireAt),allowWhileIdle:true},extra:{kind:OWNER,shopId:ctx.sid,jobId:String(job.id),userId:ctx.uid}}];
  });
}
async function ownedPending(){const pending=await local.getPending();return (pending.notifications||[]).filter(n=>n.extra?.kind===OWNER);}
async function clear(){const pending=await ownedPending();if(pending.length)await local.cancel({notifications:pending.map(n=>({id:n.id}))});lastSignature='';}
async function freshJobs(ctx){
  const sb=window.MobileMechanicSupabase;if(!sb)return ctx;
  const key=`${ctx.sid}:${ctx.uid}`;
  if(!lastSnapshot||lastSnapshot.key!==key||Date.now()-lastFetch>=30000){
    const {data,error}=await sb.from('jobs').select('id,status,scheduled_start_at,completed_at').eq('shop_id',ctx.sid);
    if(error)throw new Error('Could not refresh scheduled jobs. Existing reminders were kept.');
    if(context()?.sid!==ctx.sid||context()?.uid!==ctx.uid)return null;
    lastFetch=Date.now();lastSnapshot={key,rows:new Map((data||[]).map(row=>[String(row.id),row]))};
  }
  return {...ctx,shop:{...ctx.shop,jobs:(ctx.shop.jobs||[]).filter(j=>lastSnapshot.rows.has(String(j.id))).map(job=>{const row=lastSnapshot.rows.get(String(job.id));return {...job,status:row.status,scheduledStart:row.scheduled_start_at,completedAt:row.completed_at};})}};
}
async function sync(){
  if(!ready)return;
  if(syncing){again=true;return;}syncing=true;
  try{
    let ctx=context();if(!ctx){await clear();return;}
    const pref=preferences(ctx.sid);if(!pref.enabled){await clear();return;}
    // A locally completed/removed job or a previous account must never retain
    // an alarm just because the next network refresh is unavailable.
    const localIds=new Set((ctx.shop.jobs||[]).filter(j=>active(j)&&j.scheduledStart).map(j=>String(j.id)));
    const stale=(await ownedPending()).filter(n=>n.extra?.shopId!==ctx.sid||n.extra?.userId!==ctx.uid||!localIds.has(n.extra?.jobId));
    if(stale.length)await local.cancel({notifications:stale.map(n=>({id:n.id}))});
    ctx=await freshJobs(ctx);if(!ctx)return;
    const permission=await local.checkPermissions();if(permission.display!=='granted')return;
    await local.createChannel({id:CHANNEL,name:'Scheduled Jobs',description:'Reminders for appointments on your schedule',importance:4,visibility:0,vibration:true});
    const exact=await local.checkExactNotificationSetting?.();
    const notifications=plan(ctx,pref).map(n=>({...n,isExactNotification:exact?.exact_alarm==='granted'})),signature=JSON.stringify(notifications),pending=await ownedPending();
    if(context()?.sid!==ctx.sid||context()?.uid!==ctx.uid){again=true;return;}
    if(signature===lastSignature&&pending.length===notifications.length)return;
    if(pending.length)await local.cancel({notifications:pending.map(n=>({id:n.id}))});
    if(context()?.sid!==ctx.sid||context()?.uid!==ctx.uid){again=true;return;}
    if(notifications.length)await local.schedule({notifications});
    lastSignature=signature;
    if(context()?.sid!==ctx.sid||context()?.uid!==ctx.uid)again=true;
  }catch(error){console.warn('Schedule reminders:',error.message);status(error.message);}
  finally{syncing=false;if(again){again=false;sync();}}
}
function status(message){const el=document.querySelector('[data-schedule-reminder-status]');if(el)el.textContent=message;}
async function enable(){
  let permission=await local.checkPermissions();if(permission.display!=='granted')permission=await local.requestPermissions();
  if(permission.display!=='granted'){status('Allow notifications in Android settings to receive schedule reminders.');return false;}
  await sync();const exact=await local.checkExactNotificationSetting?.();
  status(exact?.exact_alarm==='granted'?'Schedule reminders are enabled.':'Reminders are enabled. Allow on-time alerts to prevent Android from delaying them.');return true;
}
function openQueuedJob(){
  const ctx=context();if(!queuedJob||!ctx||!document.querySelector('#app .content'))return;
  const extra=queuedJob;queuedJob=null;
  if(extra.shopId!==ctx.sid||extra.userId!==ctx.uid||!ctx.shop.jobs?.some(j=>String(j.id)===extra.jobId))return;
  const trigger=document.createElement('button');trigger.hidden=true;trigger.dataset.openJob=extra.jobId;trigger.dataset.mmaNativeOpen='1';document.body.appendChild(trigger);trigger.click();trigger.remove();
}
async function initialize(){
  await (window.MobileMechanicBootstrap||Promise.resolve());ready=true;
  if(!listenerReady){listenerReady=true;await local.addListener('localNotificationActionPerformed',event=>{const extra=event.notification?.extra;if(extra?.kind===OWNER){queuedJob=extra;openQueuedJob();}});}
  await sync();mount();
}
function mount(){
  const route=location.hash.split('?')[0],ctx=context(),existing=document.querySelector('[data-schedule-reminder-settings]');
  if(!ctx||!['#settings','#calendar'].includes(route)){existing?.remove();return;}
  const content=document.querySelector('#app .content');if(!content||existing)return;
  const pref=preferences(ctx.sid),card=document.createElement('section');card.className='card card-pad';card.dataset.scheduleReminderSettings='1';
  card.innerHTML=`<div class="card-title">Scheduled job reminders</div><label>Remind me <select data-schedule-reminder-lead>${[0,15,30,60,120].map(m=>`<option value="${m}" ${pref.minutes===m?'selected':''}>${m===0?'At appointment time':m<60?`${m} minutes before`:`${m/60} hour${m===60?'':'s'} before`}</option>`).join('')}<option value="off" ${!pref.enabled?'selected':''}>Off</option></select></label><div class="btn-row"><button type="button" class="btn btn-soft" data-schedule-reminder-enable>Enable reminders</button><button type="button" class="btn btn-soft" data-schedule-reminder-timing>Allow on-time alerts</button></div><p class="small muted" data-schedule-reminder-status aria-live="polite">${esc(pref.enabled?'Reminders update when this app refreshes your schedule.':'Schedule reminders are off.')}</p>`;
  content.appendChild(card);
}
document.addEventListener('change',async event=>{
  if(!event.target.matches('[data-schedule-reminder-lead]'))return;const ctx=context();if(!ctx)return;
  const value=event.target.value;localStorage.setItem(PREF+ctx.sid,JSON.stringify({enabled:value!=='off',minutes:value==='off'?30:Number(value)}));lastSignature='';lastFetch=0;
  if(value==='off'){await clear();status('Schedule reminders are off.');}else await enable();
});
document.addEventListener('click',async event=>{
  if(event.target.closest('[data-schedule-reminder-enable]')){const ctx=context();if(!ctx)return;const p=preferences(ctx.sid);localStorage.setItem(PREF+ctx.sid,JSON.stringify({...p,enabled:true}));await enable();}
  if(event.target.closest('[data-schedule-reminder-timing]')){try{await local.changeExactNotificationSetting();}catch{status('Open Android app settings and allow Alarms & reminders for on-time alerts.');}}
});
window.MobileMechanicScheduleReminders={sync,clear,enable,plan};
window.addEventListener('hashchange',()=>{lastFetch=0;sync();mount();openQueuedJob();});
window.addEventListener('focus',()=>{lastFetch=0;sync();mount();});
window.addEventListener('mobile-mechanic-jobs-updated',()=>{lastFetch=0;sync();});
window.addEventListener('mma-shop-session-ready',()=>{lastFetch=0;sync();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){lastFetch=0;sync();}});
setInterval(()=>{if(document.visibilityState!=='hidden'){sync();mount();openQueuedJob();}},5000);
initialize().catch(error=>console.warn('Schedule reminders:',error.message));
})();
