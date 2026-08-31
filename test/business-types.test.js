const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('repair specialties cover automotive and equipment businesses', () => {
  for (const label of ['Automotive / Mobile Mechanic','Diesel & Heavy-Duty Truck','Agricultural Equipment','Construction / Heavy Equipment','RV & Camper','Marine / Boat','Small Engine / Outdoor Equipment','Multi-Location / Enterprise']) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('shop specialties and modules remain editable after onboarding', () => {
  assert.match(source, /businessTypesForm/);
  assert.match(source, /fd\.getAll\('specialties'\)/);
  assert.match(source, /fd\.getAll\('modules'\)/);
  assert.match(source, /Existing records were kept/);
});

test('older shops receive non-destructive configuration defaults', () => {
  assert.match(source, /function ensureShopConfig/);
  assert.match(source, /Array\.isArray\(s\.specialties\)/);
  assert.match(source, /Array\.isArray\(s\.modules\)/);
});
