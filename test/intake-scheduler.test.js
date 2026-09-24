const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const scheduler=fs.readFileSync('intake-scheduler.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const staticIntake=fs.readFileSync('intake/autotechniques/index.html','utf8');

test('customer intake uses a calendar-style day and time picker',()=>{
  assert.match(scheduler,/Pick a day and time/);
  assert.match(scheduler,/mma-intake-days/);
  assert.match(scheduler,/mma-intake-slots/);
  assert.match(scheduler,/form\.elements\.availability/);
});

test('customer availability checks the public busy-time endpoint',()=>{
  assert.match(scheduler,/public-availability/);
  assert.match(scheduler,/google_connected/);
  assert.match(scheduler,/Busy times from the shop calendar and connected Google Calendar are not offered/);
});

test('both intake surfaces load the same scheduler',()=>{
  assert.match(html,/intake-scheduler\.js\?v=20260924-autoleap1/);
  assert.match(staticIntake,/intake-scheduler\.js\?v=20260924-autoleap1/);
  assert.match(staticIntake,/MobileMechanicIntakeConfig/);
});
