const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const guards = fs.readFileSync('production-guards.js', 'utf8');
const legal = fs.readFileSync('legal-protections.js', 'utf8');

test('customer intake guard source parses', () => {
  assert.doesNotThrow(() => new Function(guards));
});

test('pre-purchase intake cannot be blocked by hidden required complaint', () => {
  assert.match(guards, /complaint\.required=false/);
  assert.match(guards, /appendPpiDetails\(form\)/);
});

test('VIN is optional and camera placeholder is removed from customer intake', () => {
  assert.match(guards, /VIN \(optional\)/);
  assert.match(guards, /You do not have to decode the VIN to send the request/);
  assert.match(guards, /scanField\.remove\(\)/);
});

test('visible external send button mirrors the handler submit button state', () => {
  assert.match(guards, /data\.intakeSubmitProxy/);
  assert.match(guards, /external\.disabled=proxy\.disabled/);
  assert.match(guards, /external\.textContent=proxy\.textContent/);
  assert.match(legal, /form\.querySelector\('\.customer-submit,\[type="submit"\]'\)/);
});
