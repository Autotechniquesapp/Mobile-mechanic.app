const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('app.js');
const production=read('supabase-production.js');
const tiles=read('job-tile-actions.js');
const scope=read('ui-scope-cleanup.js');
const calendar=read('calendar-live-actions.js');

test('generic routes and job cards are delegated so dynamically rendered controls still open',()=>{
  assert.match(app,/closest\\?\\.\\('\[data-route\]'\\)/);
  assert.match(app,/closest\\?\\.\\('\[data-open-job\]'\\)/);
});

test('job panel separates decline from permanent delete',()=>{
  assert.match(tiles,/data-job-panel-decline/);
  assert.match(tiles,/dispatchPersistentAction\\('decline-job',id\\)/);
  assert.match(tiles,/dispatchPersistentAction\\('delete-job',id\\)/);
  assert.doesNotMatch(tiles,/function deleteJob[^\\n]+dispatchPersistentAction\\('decline-job'/);
});

test('customer names vehicles and previous-job rows are actionable',()=>{
  assert.match(tiles,/data-job-panel-customer/);
  assert.match(tiles,/data-job-panel-open/);
  assert.match(tiles,/interactiveValue\\(k,v\\)/);
  assert.match(tiles,/href=\"tel:/);
  assert.match(tiles,/google\\.com\\/maps\\/search/);
  assert.match(scope,/data-mma-history-job/);
  assert.match(scope,/function openJob\\(id\\)/);
});

test('calendar day job edit map and remove controls all have click handlers',()=>{
  for(const marker of ['data-cal-day','data-cal-open-job','data-cal-edit','data-cal-maps','data-cal-remove']) assert.ok(calendar.includes(marker),marker);
});

test('time clock is production-backed',()=>{
  assert.match(production,/action==='clock-in'/);
  assert.match(production,/action==='clock-out'/);
  assert.match(production,/from\\('technician_time_entries'\\)/);
  assert.match(production,/timeEntries:\\(timeEntriesRes\\.data\\|\\|\\[\\]\\)/);
});

test('technician and shop identity controls persist to production services',()=>{
  assert.match(production,/from\\('technician_profiles'\\)\\.upsert/);
  assert.match(production,/from\\('shop_members'\\)\\.update\\(\\{status:next\\}/);
  assert.match(production,/storage\\.from\\('technician-avatars'\\)/);
  assert.match(production,/storage\\.from\\('shop-logos'\\)/);
  assert.match(production,/carfax_status:'Ready'/);
  assert.match(app,/Login email is managed through the account, not the profile\\./);
});
