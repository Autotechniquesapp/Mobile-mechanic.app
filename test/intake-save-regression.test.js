const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const start='2026-11-18T23:30';
function setup({fail=false,loseResponse=false,busy=[]}={}){
  const dom=new JSDOM(`<div class="modal-backdrop">
    <input id="scheduleStart" value="${start}">
    <input id="scheduleHours" value="1"><input id="scheduleTravel" value="0"><input id="scheduleBuffer" value="15">
    <p data-schedule-error hidden></p><button>Confirm &amp; Save</button></div>`,
    {url:'https://mobile-mechanic.app/#dashboard',runScripts:'outside-only'});
  const w=dom.window;
  const counters={converts:0,writes:0,reloads:0};
  let record={id:'job-a',status:'ai_workup',scheduled_start_at:null},highlight;
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({
    session:{shopId:'shop-a'},shops:{'shop-a':{name:'AutoTechniques'}}
  }));
  w.MobileMechanicSupabase={
    from(table){
      assert.equal(table,'jobs');
      let patch;
      const filters={};
      const query={
        select(){return query;},eq(key,value){filters[key]=value;return query;},
        update(value){patch=value;return query;},is(key,value){filters[key]=value;return query;},
        async single(){assert.equal(filters.shop_id,'shop-a');assert.equal(filters.id,'job-a');return {data:{...record}};},
        async maybeSingle(){
          assert.deepEqual(filters,{shop_id:'shop-a',id:'job-a',scheduled_start_at:null});
          counters.writes++;
          if(fail&&counters.writes===1)return {error:new Error('failed')};
          record={...record,...patch};
          return loseResponse?{error:new Error('response lost')}:{data:{...record}};
        }
      };
      return query;
    },
    functions:{async invoke(name){
      return {data:name==='public-availability'?{busy}:{ok:true,skipped:true}};
    }}
  };
  w.MobileMechanicScheduleDetails={read:()=>({current_location:{raw:''},schedule_reminder_minutes:30})};
  w.MobileMechanicReloadShopJobs=async()=>{counters.reloads++;};
  w.MobileMechanicCalendar={showJob(...args){highlight=args;}};
  w.eval(fs.readFileSync('schedule-time.js','utf8'));
  const integration=fs.readFileSync('integration-automation.js','utf8');
  w.eval(integration.split('// Free/open-source map loader.')[0]);
  const button=w.document.querySelector('button');
  const confirm=()=>w.MobileMechanicSaveSchedule(button,{},{
    shopId:'shop-a',intakeId:'intake-a',async convert(){counters.converts++;return 'job-a';}
  });
  return {w,confirm,button,counters,record:()=>record,highlight:()=>highlight};
}

test('rapid confirmation converts once and persists the Arizona day boundary',async()=>{
  const {w,confirm,counters,record,highlight}=setup();
  await Promise.all([confirm(),confirm()]);
  assert.deepEqual(counters,{converts:1,writes:1,reloads:1});
  assert.equal(record().status,'scheduled');
  assert.equal(record().scheduled_start_at,'2026-11-19T06:30:00.000Z');
  assert.equal(record().scheduled_end_at,'2026-11-19T07:45:00.000Z');
  assert.equal(record().schedule_reminder_minutes,30);
  assert.equal(w.MobileMechanicScheduleTime.wallValue(record().scheduled_start_at),start);
  assert.deepEqual(highlight(),['job-a','2026-11-19T06:30:00.000Z']);
  w.close();
});

test('failed write leaves the converted job unscheduled and retry updates the same job',async()=>{
  const {w,confirm,counters,record,button}=setup({fail:true});
  await confirm();
  assert.equal(record().scheduled_start_at,null);
  assert.match(w.document.querySelector('[data-schedule-error]').textContent,/Needs Time/);
  assert.equal(button.textContent,'Retry');
  await confirm();
  assert.deepEqual(counters,{converts:1,writes:2,reloads:2});
  assert.equal(record().status,'scheduled');
  w.close();
});

test('lost response recovers the appointment without another write',async()=>{
  const {w,confirm,counters,highlight}=setup({loseResponse:true});
  await confirm();
  assert.equal(counters.writes,1);
  assert.equal(highlight()[0],'job-a');
  w.close();
});

test('invalid time makes no writes and a busy time leaves the job in Needs Time',async()=>{
  const {w,confirm,counters,record}=setup({busy:[{start:'2026-11-19T06:00:00Z',end:'2026-11-19T07:00:00Z'}]});
  const input=w.document.getElementById('scheduleStart');
  input.value='';
  await confirm();
  assert.equal(counters.converts,0);
  input.value=start;
  await confirm();
  assert.equal(counters.writes,0);
  assert.equal(record().scheduled_start_at,null);
  assert.match(w.document.querySelector('[data-schedule-error]').textContent,/busy calendar block/);
  w.close();
});
