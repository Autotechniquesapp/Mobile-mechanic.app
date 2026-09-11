const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const P = require(path.join(__dirname, '..', 'parts-extraction.js'));
const names = rows => P.extractParts(rows).map(p => p.name);

/*
 * The regression this file exists for: actionableParts() previously recognised
 * only starter, battery, cable and relay, so every non-no-start job showed the
 * mechanic zero parts links even though the AI had named real parts.
 */

test('extracts parts from every repair category, not just no-start', () => {
  const byCategory = {
    brakes: 'Brake pads or shoes — only if worn or contaminated',
    cooling: 'Water pump — only if leaking, loose, noisy, or circulation testing fails',
    hvac: 'Leak-point seal, hose, condenser, evaporator, or service valve — only after leak detection',
    charging: 'Alternator — only if charging output testing fails',
    fuel: 'Fuel pump, filter, regulator, or relay — only after pressure and power testing',
    suspension: 'Front struts and sway bar links — only if bounce testing confirms wear',
    emissions: 'Catalytic converter and oxygen sensor — only after monitoring readings',
    transmission: 'Transmission fluid and filter — only if the fluid is burnt'
  };
  for (const [category, line] of Object.entries(byCategory)) {
    const found = P.extractParts([line]);
    assert.ok(found.length > 0, `no parts extracted for ${category}: ${line}`);
  }
});

test('the four legacy no-start parts still resolve', () => {
  const found = names([
    'Battery, terminals, or cables — only if load/voltage-drop testing fails',
    'Starter or relay — only if command, current, and voltage tests confirm failure'
  ]);
  assert.ok(found.includes('Battery'));
  assert.ok(found.includes('Battery cable / terminal'));
  assert.ok(found.includes('Starter assembly'));
  assert.ok(found.includes('Fuse / relay'));
});

test('one candidate line yields every part it names', () => {
  assert.deepEqual(
    names(['Brake pads or shoes — only if worn or contaminated']),
    ['Brake pads', 'Brake shoes']
  );
});

test('"wheel cylinder" does not produce a wheel or tire row', () => {
  const found = names(['Caliper or wheel cylinder — only if leaking, seized, or failing a hydraulic test']);
  assert.deepEqual(found, ['Brake caliper', 'Wheel cylinder']);
  assert.ok(!found.includes('Wheel / tire'));
});

test('an A/C compressor clutch is not treated as a transmission clutch', () => {
  const found = names(['Compressor, clutch, or control valve — only after pressure and circuit testing']);
  assert.ok(found.includes('A/C compressor clutch'));
  assert.ok(!found.includes('Clutch'), 'A/C line must not offer a transmission clutch');
});

test('a genuine clutch complaint still resolves to the transmission clutch', () => {
  assert.deepEqual(names(['Clutch disc and pressure plate — only if slipping is confirmed']), ['Clutch']);
});

test('"no parts should be selected" never becomes an orderable part', () => {
  assert.deepEqual(names([
    'No parts should be selected until the affected system is inspected and tested'
  ]), []);
  assert.deepEqual(names(['None', 'N/A', 'Do not order parts yet']), []);
});

test('generic fallbacks only fire when nothing specific matched', () => {
  assert.deepEqual(names(['Fuel pump — only after pressure testing']), ['Fuel pump']);
  assert.deepEqual(names(['A failed pump somewhere in the system']), ['Pump']);
});

test('the sourcing condition is kept with each part', () => {
  const [part] = P.extractParts(['Thermostat — only if temperature and circulation testing supports it']);
  assert.equal(part.name, 'Thermostat');
  assert.match(part.condition, /only if temperature/);
  assert.equal(part.category, 'cooling');
});

test('results are deduplicated and capped', () => {
  const dupes = Array.from({ length: 40 }, () => 'Brake pads — worn');
  assert.deepEqual(names(dupes), ['Brake pads']);
  const many = P.CATALOG.filter(e => e.category !== 'general').map(e => e.name);
  assert.ok(P.extractParts(many).length <= P.MAX_PARTS);
});

test('malformed input is handled without throwing', () => {
  assert.deepEqual(P.extractParts(null), []);
  assert.deepEqual(P.extractParts(undefined), []);
  assert.deepEqual(P.extractParts('not an array'), []);
  assert.deepEqual(P.extractParts([null, '', {}, 42]), []);
  assert.deepEqual(names([{ name: 'Alternator' }, { part: 'Radiator' }]), ['Alternator', 'Radiator']);
});

test('search terms combine the vehicle with the part name', () => {
  const vehicle = { year: 2016, make: 'Ford', model: 'F-150', engine: '3.5L' };
  assert.equal(P.searchTerm({ name: 'Brake pads' }, vehicle), '2016 Ford F-150 3.5L Brake pads');
  assert.equal(P.searchTerm('Battery', {}), 'Battery');
  assert.equal(P.searchTerm('Battery', null), 'Battery');
});

test('seedWorkOrder fills parts, labor, and tests from the AI workup', () => {
  const wo = P.seedWorkOrder({
    parts_candidates: ['Brake pads or shoes — only if worn or contaminated'],
    labor_suggestions: [{ operation: 'Pads and rotors', range: 'Use axle-specific labor data', condition: 'After measuring' }],
    first_checks: ['Inspect pad thickness'],
    diagnostic_tests: [{ test: 'Road test', meaning: 'Confirms the noise' }]
  });
  assert.equal(wo.seeded_from_ai, true);
  assert.deepEqual(wo.parts.map(p => p.name), ['Brake pads', 'Brake shoes']);
  assert.deepEqual(wo.work.map(w => w.name), ['Pads and rotors']);
  assert.deepEqual(wo.tests.map(t => t.name), ['Inspect pad thickness', 'Road test']);
});

test('seeded rows never assert a price or a labor time', () => {
  const wo = P.seedWorkOrder({
    parts_candidates: ['Water pump — only if leaking'],
    labor_suggestions: [{ operation: 'Water pump replacement', range: 'Use vehicle-specific labor data', condition: '' }]
  });
  for (const p of wo.parts) assert.equal(p.price, null, 'seeded parts must be unpriced');
  for (const w of wo.work) assert.equal(w.hours, null, 'seeded labor must not assert hours');
});

test('a conditional part is seeded as inspect_first rather than needed', () => {
  const wo = P.seedWorkOrder({ parts_candidates: ['Water pump — only if leaking, loose, or noisy'] });
  assert.equal(wo.parts[0].status, 'inspect_first');
  const unconditional = P.seedWorkOrder({ parts_candidates: ['Alternator'] });
  assert.equal(unconditional.parts[0].status, 'needed');
});

test('seedWorkOrder returns an empty, safe shape for an empty workup', () => {
  for (const input of [null, undefined, {}, { parts_candidates: [] }]) {
    const wo = P.seedWorkOrder(input);
    assert.equal(wo.seeded_from_ai, false);
    assert.deepEqual(wo.parts, []);
    assert.deepEqual(wo.work, []);
    assert.deepEqual(wo.tests, []);
    assert.deepEqual(wo.authorization, { status: '', note: '' });
  }
});

test('isEmptyWorkOrder distinguishes a blank order from mechanic-entered work', () => {
  assert.equal(P.isEmptyWorkOrder(null), true);
  assert.equal(P.isEmptyWorkOrder({ parts: [], work: [], tests: [] }), true);
  assert.equal(P.isEmptyWorkOrder({ parts: [{ name: 'Battery' }], work: [], tests: [] }), false);
  assert.equal(P.isEmptyWorkOrder({ parts: [], work: [], tests: [{ name: 'Road test' }] }), false);
});

test('hasDiagnosis only accepts a workup with real content', () => {
  assert.equal(P.hasDiagnosis(null), false);
  assert.equal(P.hasDiagnosis({}), false);
  assert.equal(P.hasDiagnosis({ summary: 'text only' }), false, 'a summary alone is not a diagnosis');
  assert.equal(P.hasDiagnosis({ work_order: { parts: [] } }), false, 'a work order alone is not a diagnosis');
  assert.equal(P.hasDiagnosis({ likely_causes: [{ cause: 'x' }] }), true);
  assert.equal(P.hasDiagnosis({ parts_candidates: ['Battery'] }), true);
});
