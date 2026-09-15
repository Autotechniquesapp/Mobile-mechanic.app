const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js', 'utf8');
const production = fs.readFileSync('supabase-production.js', 'utf8');
const queue = fs.readFileSync('intake-queue.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

function customerHelpers(){
  const start=app.indexOf('function customerPhoneKey');
  const end=app.indexOf('function shopIntake',start);
  assert.ok(start>=0&&end>start,'customer helper block should exist');
  return vm.runInNewContext(`${app.slice(start,end)};({customerPhoneKey,customerEmailKey,combinedCustomers,customerJobsFor})`);
}

test('repeat customer rows group by normalized contact details without losing vehicles or visits', () => {
  const {combinedCustomers,customerJobsFor}=customerHelpers();
  const shop={
    customers:[
      {id:'c1',name:'Returning Customer',phone:'(602) 555-0100',email:'CUSTOMER@example.com',vehicles:[{id:'v1',make:'Ford'}]},
      {id:'c2',name:'Returning Customer',phone:'602-555-0100',email:'customer@example.com ',vehicles:[{id:'v2',make:'Honda'}]}
    ],
    jobs:[
      {id:'j1',customerId:'c1',createdAt:'2026-09-01T00:00:00Z'},
      {id:'j2',customerId:'c2',createdAt:'2026-09-14T00:00:00Z'}
    ]
  };
  const customers=combinedCustomers(shop);
  assert.equal(customers.length,1);
  assert.deepEqual(Array.from(customers[0]._customerIds),['c1','c2']);
  assert.deepEqual(Array.from(customers[0].vehicles,v=>v.id),['v1','v2']);
  assert.deepEqual(Array.from(customerJobsFor(shop,customers[0]),j=>j.id),['j2','j1']);
});

test('one database customer displays one card with combined vehicle and visit history', () => {
  assert.match(app, /customerList=combinedCustomers\(s\)/);
  assert.match(app, /repeat visits stay together/);
  assert.match(app, /vehicles\.length.*visits\.length/);
  assert.match(app, />Combined History</);
  assert.match(app, /modal\('Combined Customer History'/);
  assert.match(app, /data-open-job="\$\{j\.id\}"/);
});

test('signed-in intake entry reuses normalized phone or email within the current shop', () => {
  assert.match(production, /function sameCustomerIdentity\(customer,phone,email\)/);
  assert.match(production, /from\('customers'\)\.select\('\*'\)\.eq\('shop_id',sid\)/);
  assert.match(production, /find\(c=>sameCustomerIdentity\(c,d\.phone,d\.email\)\)/);
  assert.match(production, /update\(patch\)\.eq\('shop_id',sid\)\.eq\('id',customer\.id\)/);
});

test('public intake conversion aligns repeat-customer identity before the conversion RPC', () => {
  const alignAt=queue.indexOf('await alignRepeatCustomerIdentity(id)');
  const convertAt=queue.indexOf("sb.rpc('convert_intake_to_job'",alignAt);
  assert.ok(alignAt>=0&&convertAt>alignAt);
  assert.match(queue, /from\('intake_submissions'\).*eq\('shop_id',sid\).*eq\('id',intakeId\)/);
  assert.match(queue, /from\('customers'\).*eq\('shop_id',sid\)/);
  assert.match(queue, /update\(\{\.\.\.patch,updated_at:new Date\(\)\.toISOString\(\)\}\)\.eq\('shop_id',sid\)\.eq\('id',intakeId\)/);
});

test('changed customer scripts are cache-busted together', () => {
  assert.match(html, /supabase-production\.js\?v=20260915-square-deposit1/);
  assert.match(html, /intake-queue\.js\?v=20260914-release-blockers1/);
  assert.match(html, /app\.js\?v=20260914-repeat-customer1/);
});
