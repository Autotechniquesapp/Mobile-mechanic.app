const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const calendar=fs.readFileSync('calendar-live-actions.js','utf8');

test('removing a calendar appointment persists to Supabase for the selected shop',()=>{
  assert.match(calendar,/const sb=window\.MobileMechanicSupabase/);
  assert.match(calendar,/from\('jobs'\)\.update\(\{scheduled_start_at:null,scheduled_end_at:null\}\)\.eq\('id',jobId\)\.eq\('shop_id',sid\)/);
  assert.doesNotMatch(calendar,/function removeSchedule\(jobId\)\{[\s\S]*?write\(db\);close\(\);status\('Removed from calendar/);
});

test('Open Job from calendar explicitly selects that job before routing to findings',()=>{
  assert.match(calendar,/db\.session\.activeJobId=jobId/);
  assert.match(calendar,/write\(db\);\s*close\(\);\s*location\.hash='#findings'/);
  assert.doesNotMatch(calendar,/location\.hash=`#findings\?id=/);
});

test('calendar still exposes Today, Needs Time, and Scheduled metric actions',()=>{
  assert.match(calendar,/label\.includes\('today'\)/);
  assert.match(calendar,/label\.includes\('need time'\)/);
  assert.match(calendar,/label\.includes\('scheduled'\)/);
  assert.match(calendar,/data-cal-open-day/);
});
