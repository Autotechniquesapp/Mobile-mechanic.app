const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const {JSDOM}=require('jsdom');
function calendar({role='owner'}={}){
 const dom=new JSDOM(`<body><section data-mma-calendar><button data-cal-week-prev>Previous</button><button data-cal-week-next>Next</button><button data-cal-today>Today</button><button data-cal-view="day">Day</button><button data-cal-view="week">Week</button><button data-cal-view="month">Month</button><b data-cal-week-title></b><div data-cal-week-strip></div><b data-cal-day-title></b><div data-cal-slot-grid></div><div data-cal-agenda></div></section><div data-cal-unscheduled></div><div data-cal-schedule-triggers><button data-action="schedule-job" data-job="pending"></button><button data-action="schedule-job" data-job="existing"></button></div></body>`,{url:'https://mobile-mechanic.app/#calendar',runScripts:'outside-only'}),w=dom.window,timers=[],opened=[];
 const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-12-29T12:00:00']));}static now(){return new NativeDate('2026-12-29T12:00:00').getTime();}};
 Object.defineProperty(w,'innerWidth',{value:390});w.CSS={escape:x=>x};w.MutationObserver=class{observe(){}disconnect(){}};w.setTimeout=fn=>timers.push(fn);w.MobileMechanicSchedulePicker={setStart:value=>opened.at(-1).start=value};
 w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{shopId:'shop',userId:'user'},shops:{shop:{users:[{id:'user',role}],jobs:[{id:'pending',customerName:'Waiting Customer',vehicle:{year:2020,make:'Ford'},status:'AI Pre-Workup'},{id:'existing',customerName:'Scheduled Customer',status:'Scheduled',scheduledStart:'2026-12-29T09:15:00',scheduledEnd:'2026-12-29T11:15:00'}]}}}));
 for(const b of w.document.querySelectorAll('[data-action="schedule-job"]'))b.onclick=()=>{opened.push({id:b.dataset.job});if(!w.document.querySelector('#scheduleStart'))w.document.body.insertAdjacentHTML('beforeend','<div class="modal-backdrop"><section class="modal"><input id="scheduleStart"><button data-action="save-schedule" data-job="existing">Save</button></section></div>');};
 w.eval(fs.readFileSync('calendar-live-actions.js','utf8'));function flush(){while(timers.length)timers.shift()();}flush();return{dom,w,opened,flush};
}
test('tap a calendar spot then a waiting job carries the exact date and time to scheduling',()=>{const {dom,w,opened,flush}=calendar();const slot=[...w.document.querySelectorAll('[data-cal-slot]')].find(b=>new Date(b.dataset.calSlot).getHours()===13&&new Date(b.dataset.calSlot).getMinutes()===30);const start=slot.dataset.calSlot;slot.click();w.document.querySelector('[data-cal-slot-job="pending"]').click();flush();assert.equal(opened[0].id,'pending');assert.equal(opened[0].start,start);assert.equal(w.document.querySelector('#scheduleStart').value,start);dom.window.close();});
test('month navigation crosses the year and day selection opens clickable time slots',()=>{const {dom,w}=calendar();w.document.querySelector('[data-cal-view="month"]').click();assert.match(w.document.querySelector('[data-cal-week-title]').textContent,/December 2026/);w.document.querySelector('[data-cal-week-next]').click();assert.match(w.document.querySelector('[data-cal-week-title]').textContent,/January 2027/);w.document.querySelector('[data-cal-month-day="2027-01-05"]').click();const slots=[...w.document.querySelectorAll('[data-cal-slot]')];assert.equal(slots.length,48);assert.ok(slots.every(b=>new Date(b.dataset.calSlot).getDate()===5));dom.window.close();});
test('existing appointments open their original start; new jobs retain the selected calendar spot',()=>{const {dom,w,opened,flush}=calendar();w.document.querySelector('[data-cal-slot-grid] [data-cal-edit="existing"]').click();flush();assert.equal(opened[0].start,'2026-12-29T09:15:00');const slot=w.document.querySelector('[data-cal-slot]'),start=slot.dataset.calSlot;slot.click();w.document.querySelector('[data-cal-slot-new]').click();const hint=JSON.parse(w.localStorage.getItem('mobile_mechanic_new_job_calendar_slot'));assert.equal(hint.start,start);assert.equal(hint.shopId,'shop');assert.equal(w.location.hash,'#new-intake');dom.window.close();});
test('the schedule modal shows date and time buttons without an operating-system date/time picker',()=>{
 const source=fs.readFileSync('app.js','utf8'),helpers=source.slice(source.indexOf('function localDateTimeValue('),source.indexOf('function scheduleWindow('));const dom=new JSDOM('<body></body>'),w=dom.window;
 const ctx={document:w.document,window:w,Date,Event:w.Event};vm.createContext(ctx);vm.runInContext(helpers,ctx);w.document.body.innerHTML=ctx.schedulePickerMarkup({scheduledStart:'2027-01-05T09:15:00'});ctx.bindSchedulePicker();assert.equal(w.document.querySelector('#scheduleDateCalendar').hidden,false);assert.equal(w.document.querySelector('#scheduleTime').hidden,true);assert.ok(w.document.querySelector('[data-schedule-time="09:15"]'));w.document.querySelector('[data-schedule-date="2027-01-10"]').click();w.document.querySelector('[data-schedule-time="13:30"]').click();assert.equal(w.document.querySelector('#scheduleStart').value,'2027-01-10T13:30');dom.window.close();
});


test('scheduled jobs offer completion and payment in the agenda and appointment dialog',()=>{
 const {dom,w}=calendar();
 const agenda=w.document.querySelector('[data-cal-agenda]');
 assert.equal(agenda.querySelector('[data-action="complete-job"]').dataset.job,'existing');
 assert.equal(agenda.querySelector('[data-cal-invoice]').dataset.calInvoice,'existing');
 w.document.querySelector('[data-cal-slot-grid] [data-cal-edit="existing"]').click();
 const actions=w.document.querySelector('[data-cal-finish-actions]');
 assert.ok(actions.querySelector('[data-action="complete-job"][data-job="existing"]'));
 assert.ok(actions.querySelector('[data-cal-invoice="existing"]'));
 dom.window.close();
});
test('invoice action opens the matching job and focuses its payment editor',()=>{
 const {dom,w}=calendar();let opened=null,scrolled=false;
 w.document.addEventListener('click',e=>{const b=e.target.closest('[data-open-job]');if(!b)return;opened={id:b.dataset.openJob,native:b.dataset.mmaNativeOpen};const invoice=w.document.createElement('section');invoice.dataset.nextInvoice='';invoice.scrollIntoView=()=>scrolled=true;w.document.body.appendChild(invoice);});
 w.document.querySelector('[data-cal-invoice="existing"]').click();
 assert.deepEqual(opened,{id:'existing',native:'1'});
 assert.equal(JSON.parse(w.localStorage.getItem('mobile_mechanic_ai_approved_v7')).session.activeJobId,'existing');
 assert.equal(scrolled,true);
 assert.equal(JSON.parse(w.localStorage.getItem('mobile_mechanic_ai_approved_v7')).shops.shop.jobs[1].status,'Scheduled');
 dom.window.close();
});
test('calendar payment controls follow invoice permissions',()=>{
 const {dom,w}=calendar({role:'technician'});
 assert.equal(w.document.querySelector('[data-cal-invoice]'),null);
 assert.ok(w.document.querySelector('[data-action="complete-job"]'));
 dom.window.close();
});

test('keyboard activation of calendar completion and payment buttons does not open the job row',()=>{
 const {dom,w}=calendar();
 for(const selector of ['[data-action="complete-job"]','[data-cal-invoice]']){const button=w.document.querySelector(selector),event=new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});button.dispatchEvent(event);assert.equal(event.defaultPrevented,false);}
 dom.window.close();
});
