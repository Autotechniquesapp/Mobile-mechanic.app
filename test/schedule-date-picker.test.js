const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const helpers=source.slice(source.indexOf('function localDateTimeValue('),source.indexOf('function scheduleWindow('));
function setup(value){
  const elements={};
  for(const id of ['scheduleStart','scheduleDateButton','scheduleDateCalendar','scheduleTime'])elements[id]={value:'',dataset:{},hidden:true,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(k,v){this[k]=v;},focus(){},dispatchEvent(){}};
  elements.scheduleStart.value=value;
  elements.scheduleTime.value=value.slice(11);
  const ctx={Date,Event:class {},document:{getElementById:id=>elements[id]},window:{}};
  vm.createContext(ctx);vm.runInContext(helpers,ctx);ctx.bindSchedulePicker();
  return {ctx,e:elements,click(data){elements.scheduleDateCalendar.handlers.click({target:{closest:selector=>selector===data.selector?{dataset:data.dataset}:null}});}};
}
test('new jobs start scheduling on the local current date and existing appointments retain their start',()=>{
  const {ctx}=setup('2026-10-12T14:30');
  const today=ctx.localDateTimeValue(new Date());
  assert.ok(ctx.schedulePickerMarkup({}).includes(`value="${today}"`));
  assert.ok(ctx.schedulePickerMarkup({scheduledStart:'2026-11-03T10:15:00'}).includes('value="2026-11-03T10:15"'));
});
test('month calendar opens, moves across year boundaries and selects a date without changing time',()=>{
  const {e,click}=setup('2026-12-12T14:30');
  e.scheduleDateButton.handlers.click();
  assert.equal(e.scheduleDateCalendar.hidden,false);
  assert.match(e.scheduleDateCalendar.innerHTML,/2026-12-31/);
  click({selector:'[data-schedule-month]',dataset:{scheduleMonth:'1'}});
  assert.match(e.scheduleDateCalendar.innerHTML,/2027-01-31/);
  click({selector:'[data-schedule-date]',dataset:{scheduleDate:'2027-01-05'}});
  assert.equal(e.scheduleStart.value,'2027-01-05T14:30');
  assert.equal(e.scheduleDateCalendar.hidden,true);
});
test('time changes preserve selected date and intake calendar hints update visible controls',()=>{
  const {ctx,e}=setup('2026-10-12T14:30');
  e.scheduleTime.value='';e.scheduleTime.handlers.change();
  assert.equal(e.scheduleStart.value,'');
  e.scheduleTime.value='11:45';e.scheduleTime.handlers.change();
  assert.equal(e.scheduleStart.value,'2026-10-12T11:45');
  ctx.window.MobileMechanicSchedulePicker.setStart('2026-11-03T09:15');
  assert.equal(e.scheduleStart.value,'2026-11-03T09:15');
  assert.equal(e.scheduleTime.value,'09:15');
  assert.match(e.scheduleDateButton.textContent,/Nov/);
});
test('Today selects the local current date while preserving time',()=>{
  const {ctx,e,click}=setup('2026-11-03T09:15');
  click({selector:'[data-schedule-today]',dataset:{}});
  assert.equal(e.scheduleStart.value,ctx.localDateTimeValue(new Date()).slice(0,10)+'T09:15');
});
