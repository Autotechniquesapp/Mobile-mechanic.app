const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const calendar=fs.readFileSync('calendar-live-actions.js','utf8');

test('removing a calendar appointment persists to Supabase for the selected shop before updating local cache',()=>{
  assert.match(calendar,/const sb=window\.MobileMechanicSupabase/);
  assert.match(calendar,/from\('jobs'\)\.update\(\{scheduled_start_at:null,scheduled_end_at:null\}\)\.eq\('id',jobId\)\.eq\('shop_id',sid\)/);
  const serverWrite=calendar.indexOf("const {error}=await sb.from('jobs').update({scheduled_start_at:null,scheduled_end_at:null})");
  const localWrite=calendar.indexOf('j.scheduledStart=null;j.scheduledEnd=null');
  assert.ok(serverWrite>=0,'expected Supabase calendar removal write');
  assert.ok(localWrite>serverWrite,'local calendar cache must only change after the Supabase update');
});

test('Open Job from calendar explicitly selects that job before routing to findings',()=>{
  assert.match(calendar,/db\.session\.activeJobId=jobId/);
  assert.match(calendar,/write\(db\);\s*close\(\);\s*location\.hash='#findings'/);
  assert.doesNotMatch(calendar,/location\.hash=`#findings\?id=/);
});

test('calendar renders tappable days and keeps Today, Needs Time, and Scheduled metric actions',()=>{
  assert.match(calendar,/Array\.from\(\{length:14\}/);
  assert.match(calendar,/data-cal-open-day=/);
  assert.match(calendar,/Tap a day to see its jobs, edit times, or schedule an unscheduled job/);
  assert.match(calendar,/label\.includes\('today'\)/);
  assert.match(calendar,/label\.includes\('need time'\)/);
  assert.match(calendar,/label\.includes\('scheduled'\)/);
});

test('completed, cancelled, and declined work stays out of the active calendar',()=>{
  assert.match(calendar,/function isClosedJob\(j\)/);
  assert.match(calendar,/!!j\?\.completedAt/);
  assert.match(calendar,/state==='completed'/);
  assert.match(calendar,/state==='cancelled'/);
  assert.match(calendar,/state\.includes\('declined'\)/);
  assert.match(calendar,/filter\(j=>!isClosedJob\(j\)\)/);
});
