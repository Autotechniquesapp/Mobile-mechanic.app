const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const intake=fs.readFileSync('intake-queue.js','utf8');
const calendar=fs.readFileSync('calendar-live-actions.js','utf8');
const html=fs.readFileSync('index.html','utf8');

function block(start,end){
  const a=intake.indexOf(start),b=intake.indexOf(end,a);
  assert.ok(a>=0&&b>a,`expected source block ${start}`);
  return intake.slice(a,b);
}

test('incoming intake card is mechanic-first and does not render AI workup',()=>{
  const card=block('function intakeCard(i){','async function openQueue');
  assert.doesNotMatch(card,/aiWorkupMarkup\(i\)/);
  assert.match(card,/<h3[^>]*>\$\{esc\(i\.customer_name/);
  assert.match(card,/<b>Phone:<\/b>/);
  assert.match(card,/<b>Address:<\/b>/);
  assert.match(card,/<b>Vehicle<\/b>/);
  assert.match(card,/<b>Customer states:<\/b>/);
  assert.match(card,/<b>Requested Date & Time<\/b>/);
  assert.match(card,/data-convert-intake-calendar/);
  assert.match(card,/Add to Calendar/);
  const order=['customer_name','<b>Phone:</b>','<b>Address:</b>','<b>Vehicle</b>','<b>Customer states:</b>','<b>Requested Date & Time</b>'].map(x=>card.indexOf(x));
  order.forEach(x=>assert.ok(x>=0));
  for(let i=1;i<order.length;i++)assert.ok(order[i]>order[i-1],'intake details should stay in service-ticket order');
});

test('intake queue header no longer tells mechanic to review AI workup',()=>{
  const queue=block('async function openQueue(){','async function retryAiWorkup');
  assert.doesNotMatch(queue,/AI preliminary workup/i);
  assert.match(queue,/Review the customer details, vehicle, concern, and requested appointment/);
});

test('Add to Calendar converts the intake then hands the new job to the live scheduler',()=>{
  assert.match(intake,/mobile_mechanic_pending_calendar_schedule/);
  assert.match(intake,/location\.hash='#calendar'/);
  assert.match(calendar,/mobile_mechanic_pending_calendar_schedule/);
  assert.match(calendar,/data-action="schedule-job"/);
  assert.match(calendar,/openSchedule\(String\(pending\.jobId\),String\(pending\.start\|\|''\)\)/);
});

test('production shell cache-busts the cleaned intake and calendar scripts',()=>{
  assert.match(html,/calendar-live-actions\.js\?v=20260923-intake-calendar1/);
  assert.match(html,/intake-queue\.js\?v=20260923-clean-workup1/);
  assert.match(html,/intake-scheduler\.js\?v=20260924-autoleap1/);
});
