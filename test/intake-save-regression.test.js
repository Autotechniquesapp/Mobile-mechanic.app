const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const intake=fs.readFileSync('intake-queue.js','utf8');
const calendar=fs.readFileSync('calendar-live-actions.js','utf8');
function appointmentHarness({existing=null,error=null,affected=[{id:'job'}]}={}){
 const updates=[];
 const sb={from(table){assert.equal(table,'jobs');let writing=false;const q={select(){return q;},eq(){return q;},is(column,value){assert.equal(column,'scheduled_start_at');assert.equal(value,null);return q;},single:async()=>({data:{scheduled_start_at:existing,estimated_labor_hours:1,travel_minutes:10,buffer_minutes:15}}),update(patch){writing=true;updates.push(patch);return q;},then(resolve){return Promise.resolve({data:affected,error:writing?error:null}).then(resolve);}};return q;}};
 const ctx={sb,shopId:()=> 'shop',Date};vm.createContext(ctx);
 vm.runInContext(intake.slice(intake.indexOf('async function saveIntakeAppointment'),intake.indexOf('async function convertIntakeToCalendar')),ctx);
 return {save:ctx.saveIntakeAppointment,updates};
}
test('first Add to Calendar saves the selected local time and duration to the live job',async()=>{
 const h=appointmentHarness(),start='2026-11-16T13:30';
 assert.equal(await h.save('job',start),new Date(start).toISOString());
 assert.equal(h.updates.length,1);assert.equal(h.updates[0].status,'scheduled');
 assert.equal(h.updates[0].scheduled_start_at,new Date(start).toISOString());
 assert.equal(Date.parse(h.updates[0].scheduled_end_at)-Date.parse(h.updates[0].scheduled_start_at),85*60000);
});
test('retry preserves an existing appointment instead of moving or duplicating it',async()=>{
 const h=appointmentHarness({existing:'2026-11-16T20:30:00.000Z'});
 assert.equal(await h.save('job','2026-11-17T08:00'),'2026-11-16T20:30:00.000Z');assert.equal(h.updates.length,0);
});
test('failed or zero-row schedule writes do not report success',async()=>{
 await assert.rejects(appointmentHarness({error:new Error('Denied')}).save('job','2026-11-16T13:30'),/Denied/);
 await assert.rejects(appointmentHarness({affected:[]}).save('job','2026-11-16T13:30'),/appointment changed/);
 const h=appointmentHarness();assert.equal(await h.save('job',''),null);assert.equal(h.updates.length,0);
});
test('calendar handoff waits for bootstrap and does not reopen a saved appointment',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://mobile-mechanic.app/#calendar',runScripts:'outside-only'}),w=dom.window;
 let jobs=[],opens=0,notices=0;
 w.CSS={escape:String};w.$=s=>w.document.querySelector(s);w.shop=()=>({jobs});w.render=()=>{};w.notify=()=>notices++;w.openSchedule=()=>opens++;w.startWeek=d=>d;
 w.localStorage.setItem('mobile_mechanic_pending_calendar_schedule',JSON.stringify({jobId:'job',start:'2026-11-16T13:30',saved:true,createdAt:Date.now()}));
 w.eval(calendar.slice(calendar.indexOf('function openPendingIntakeSchedule()'),calendar.indexOf('async function removeSchedule')));
 w.openPendingIntakeSchedule();assert.ok(w.localStorage.getItem('mobile_mechanic_pending_calendar_schedule'));
 w.document.body.innerHTML='<section data-mma-calendar></section>';jobs=[{id:'job'}];
 w.openPendingIntakeSchedule();w.openPendingIntakeSchedule();assert.equal(opens,0);assert.equal(notices,1);assert.equal(w.localStorage.getItem('mobile_mechanic_pending_calendar_schedule'),null);w.close();
});
test('unselected-time handoff waits for job scheduling controls before opening once',()=>{
 const dom=new JSDOM('<body><section data-mma-calendar></section></body>',{url:'https://mobile-mechanic.app/#calendar',runScripts:'outside-only'}),w=dom.window;let opens=0;
 w.CSS={escape:String};w.$=s=>w.document.querySelector(s);w.shop=()=>({jobs:[{id:'job'}]});w.openSchedule=()=>opens++;
 w.localStorage.setItem('mobile_mechanic_pending_calendar_schedule',JSON.stringify({jobId:'job',createdAt:Date.now()}));
 w.eval(calendar.slice(calendar.indexOf('function openPendingIntakeSchedule()'),calendar.indexOf('async function removeSchedule')));
 w.openPendingIntakeSchedule();assert.equal(opens,0);assert.ok(w.localStorage.getItem('mobile_mechanic_pending_calendar_schedule'));
 w.document.body.insertAdjacentHTML('beforeend','<div data-cal-schedule-triggers><button data-action="schedule-job" data-job="job"></button></div>');
 w.openPendingIntakeSchedule();w.openPendingIntakeSchedule();assert.equal(opens,1);w.close();
});
