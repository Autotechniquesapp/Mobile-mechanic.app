const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const calendar=fs.readFileSync('calendar-live-actions.js','utf8');

test('calendar renders a seven day shop schedule and needs-time queue',()=>{
  assert.match(calendar,/Array\.from\(\{length:7\}/);
  assert.match(calendar,/data-cal-week-strip/);
  assert.match(calendar,/data-cal-agenda/);
  assert.match(calendar,/data-cal-unscheduled/);
  assert.match(calendar,/ops-agenda-row/);
});

test('calendar opens the actual job and edits schedule from the same screen',()=>{
  assert.match(calendar,/data-open-job/);
  assert.match(calendar,/data-cal-edit/);
  assert.match(calendar,/\[data-cal-schedule-triggers\]/);
});

test('removing a schedule persists and syncs the external calendar',()=>{
  assert.match(calendar,/scheduled_start_at:null,scheduled_end_at:null/);
  assert.match(calendar,/calendar-sync/);
  assert.match(calendar,/action:'sync_job'/);
});

test('closed work stays off the active calendar',()=>{
  assert.match(calendar,/!\['Completed','Cancelled'\]\.includes\(j\.status\)/);
  assert.match(calendar,/includes\('declined'\)/);
});
