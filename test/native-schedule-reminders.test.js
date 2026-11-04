const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('native-schedule-reminders.js','utf8');
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
async function browser({permission='granted',native=true,remote=null}={}){
  const dom=new JSDOM('<div id="app"><main class="content"></main></div>',{url:'https://mobile-mechanic.app/#calendar',runScripts:'outside-only'}),w=dom.window;
  const future=new Date(Date.now()+3*3600000).toISOString(),calls=[],listeners={},pending=new Map([[99,{id:99,extra:{kind:'other-feature'}}]]);
  let allowed=permission;
  const local={checkPermissions:async()=>({display:allowed}),requestPermissions:async()=>{calls.push({request:true});allowed='granted';return {display:allowed}},createChannel:async value=>calls.push({channel:value}),getPending:async()=>({notifications:[...pending.values()]}),cancel:async value=>{calls.push({cancel:value});value.notifications.forEach(n=>pending.delete(n.id))},schedule:async value=>{calls.push({schedule:value});value.notifications.forEach(n=>pending.set(n.id,n))},addListener:async(name,fn)=>listeners[name]=fn,changeExactNotificationSetting:async()=>calls.push({exact:true})};
  w.Capacitor={isNativePlatform:()=>native,getPlatform:()=>native?'android':'web',registerPlugin:()=>local};w.setInterval=()=>0;
  const cache={session:{role:'shop',shopId:'shop',userId:'owner'},shops:{shop:{jobs:[{id:'job',customerName:'Customer',status:'Scheduled',scheduledStart:future,vehicle:{year:'2020',make:'Ram',model:'3500'},location:'Yuma'}]}}};
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify(cache));
  if(remote)w.MobileMechanicSupabase={from(table){assert.equal(table,'jobs');const q={select(){return q},eq:async(k,v)=>{assert.equal(k,'shop_id');assert.equal(v,'shop');return remote}};return q}};
  w.eval(source);await settle();return {dom,w,calls,pending,listeners,cache,future};
}
test('Android schedules a separate appointment reminder 30 minutes early and preserves other notifications',async()=>{
  const h=await browser(),notification=h.calls.find(c=>c.schedule).schedule.notifications[0];assert.equal(notification.channelId,'scheduled_jobs_v1');assert.equal(notification.schedule.at.getTime(),new Date(h.future).getTime()-30*60000);assert.match(notification.body,/Customer.*2020 Ram 3500.*Yuma/);assert.equal(notification.extra.shopId,'shop');assert.equal(h.pending.has(99),true);h.dom.window.close();
});
test('unchanged jobs do not create duplicate alarms; rescheduling replaces the old alarm',async()=>{
  const h=await browser();await h.w.MobileMechanicScheduleReminders.sync();assert.equal(h.calls.filter(c=>c.schedule).length,1);
  h.cache.shops.shop.jobs[0].scheduledStart=new Date(Date.now()+5*3600000).toISOString();h.w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify(h.cache));await h.w.MobileMechanicScheduleReminders.sync();assert.equal(h.calls.filter(c=>c.schedule).length,2);assert.equal(h.calls.filter(c=>c.cancel).length,1);assert.equal(h.pending.size,2);h.dom.window.close();
});
test('completion, paid state, removed appointment, deletion, and logout cancel scheduled reminders',async()=>{
  for(const mode of ['completed','paid','unschedule','delete','logout']){
    const h=await browser();if(mode==='logout')h.cache.session=null;else if(mode==='delete')h.cache.shops.shop.jobs=[];else if(mode==='unschedule')h.cache.shops.shop.jobs[0].scheduledStart=null;else h.cache.shops.shop.jobs[0].status=mode;
    h.w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify(h.cache));await h.w.MobileMechanicScheduleReminders.sync();assert.equal(h.pending.size,1,mode);assert.equal(h.pending.has(99),true);h.dom.window.close();
  }
});
test('a fresh paid backend status stays cancelled even when the local cache still says scheduled',async()=>{
  const h=await browser({remote:{data:[{id:'job',status:'completed',completed_at:'2026-11-01T00:00:00Z'}],error:null}});await h.w.MobileMechanicScheduleReminders.sync();assert.equal(h.calls.filter(c=>c.schedule).length,0);h.dom.window.close();
});
test('past appointments are skipped; jobs inside the lead window remind at appointment time',async()=>{
  const h=await browser(),now=Date.now(),ctx={sid:'shop',uid:'owner',shop:{jobs:[{id:'past',status:'Scheduled',scheduledStart:new Date(now-1).toISOString()},{id:'near',status:'Scheduled',scheduledStart:new Date(now+600000).toISOString()}]}};
  const list=h.w.MobileMechanicScheduleReminders.plan(ctx,{enabled:true,minutes:30},now);assert.equal(list.length,1);assert.equal(list[0].extra.jobId,'near');assert.equal(list[0].schedule.at.getTime(),now+600000);h.dom.window.close();
});
test('permission is requested through Enable and Off cancels only this feature',async()=>{
  const h=await browser({permission:'prompt'});assert.equal(h.calls.filter(c=>c.schedule).length,0);await h.w.MobileMechanicScheduleReminders.enable();assert.equal(h.calls.filter(c=>c.request).length,1);assert.equal(h.calls.filter(c=>c.schedule).length,1);
  h.w.localStorage.setItem('mma_schedule_reminders_shop',JSON.stringify({enabled:false,minutes:30}));await h.w.MobileMechanicScheduleReminders.sync();assert.equal(h.pending.size,1);h.dom.window.close();
});
test('a reminder opens the exact job only in the matching signed-in shop and user',async()=>{
  const h=await browser();let opened;h.w.document.addEventListener('click',e=>{if(e.target.dataset.openJob)opened=e.target.dataset.openJob;});
  h.listeners.localNotificationActionPerformed({notification:{extra:{kind:'mma-scheduled-job',shopId:'other',userId:'owner',jobId:'job'}}});assert.equal(opened,undefined);
  h.listeners.localNotificationActionPerformed({notification:{extra:{kind:'mma-scheduled-job',shopId:'shop',userId:'owner',jobId:'job'}}});assert.equal(opened,'job');h.dom.window.close();
});
test('regular website and Chrome installation do not schedule native reminders',async()=>{
  const h=await browser({native:false});assert.equal(h.w.MobileMechanicScheduleReminders,undefined);assert.equal(h.calls.length,0);h.dom.window.close();
});
