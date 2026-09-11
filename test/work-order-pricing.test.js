/*
 * Pricing and attestation logic.
 *
 * The property that matters most here is that an unsigned number can never
 * reach the quotable total, no matter which route it took to get onto the
 * line. Most of these tests exist to defend that one boundary.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../work-order-pricing.js');

const RATES = { laborRate: 100, partsMarkup: 50, taxRate: 10, travelFee: 25 };

function signed(extra = {}) {
  return {
    by_user_id: 'usr_1',
    by_name: 'Dave',
    at: '2026-09-11T10:00:00.000Z',
    source: 'Identifix 2.4 hr',
    checklist_version: P.ATTESTATION_VERSION,
    items: P.requiredItemIds('parts'),
    ...extra
  };
}

test('shop pricing reads both camelCase and snake_case settings', () => {
  assert.equal(P.shopPricing({ laborRate: 95 }).laborRate, 95);
  assert.equal(P.shopPricing({ labor_rate: 88 }).laborRate, 88);
  assert.equal(P.shopPricing(null).laborRate, P.DEFAULTS.laborRate);
});

test('a typed cost gets shop markup, a typed price does not', () => {
  assert.equal(P.partAmount({ cost: 100 }, RATES).amount, 150);
  assert.equal(P.partAmount({ cost: 100 }, RATES).basis, 'marked_up');
  assert.equal(P.partAmount({ price: 100 }, RATES).amount, 100);
  assert.equal(P.partAmount({ price: 100 }, RATES).basis, 'price');
});

test('an AI guess is reported as estimated and never as attested', () => {
  const r = P.partAmount({ estimate: { price: 80, source: 'ai' } }, RATES);
  assert.equal(r.amount, 80);
  assert.equal(r.estimated, true);
  assert.equal(r.attested, false);
});

test('a typed number outranks the AI estimate on the same line', () => {
  const r = P.partAmount({ cost: 100, estimate: { price: 80 } }, RATES);
  assert.equal(r.amount, 150);
  assert.equal(r.estimated, false);
});

test('labor uses the line rate when present, otherwise the shop rate', () => {
  assert.equal(P.laborAmount({ hours: 2 }, RATES).amount, 200);
  assert.equal(P.laborAmount({ hours: 2, rate: 60 }, RATES).amount, 120);
});

/* --- the attestation boundary --- */

test('a complete attestation is recognised', () => {
  assert.equal(P.isAttested({ cost: 10, attested: signed() }, 'parts'), true);
});

test('an attestation missing a checklist item does not count', () => {
  const partial = signed({ items: P.requiredItemIds('parts').slice(0, 2) });
  assert.equal(P.isAttested({ cost: 10, attested: partial }, 'parts'), false);
});

test('an attestation with no named user does not count', () => {
  assert.equal(P.isAttested({ cost: 10, attested: signed({ by_user_id: null }) }, 'parts'), false);
});

test('an attestation with a blank source does not count', () => {
  assert.equal(P.isAttested({ cost: 10, attested: signed({ source: '   ' }) }, 'parts'), false);
});

test('a labor line cannot be satisfied by the parts checklist', () => {
  // Same record, wrong checklist: the labor items were never ticked.
  assert.equal(P.isAttested({ hours: 2, attested: signed() }, 'labor'), false);
});

test('attestLine refuses to sign without every box, a source and a user', () => {
  const line = { name: 'Pads', cost: 80 };
  const all = P.requiredItemIds('parts');
  assert.equal(P.attestLine(line, 'parts', { userId: 'u1', source: 'NAPA', items: all.slice(0, 1) }).ok, false);
  assert.equal(P.attestLine(line, 'parts', { userId: 'u1', source: '  ', items: all }).ok, false);
  assert.equal(P.attestLine(line, 'parts', { userId: '', source: 'NAPA', items: all }).ok, false);
  const bad = P.attestLine(line, 'parts', { userId: 'u1', source: 'NAPA', items: [] });
  assert.equal(bad.missing.length, all.length);
  assert.equal(bad.line.attested, undefined);
});

test('attestLine records who, when, the source, the version and the AI guess', () => {
  const line = { name: 'Pads', cost: 80, estimate: { price: 65, source: 'ai' } };
  const res = P.attestLine(line, 'parts', {
    userId: 'usr_9', userName: 'Dave', source: 'NAPA quote #4821',
    items: P.requiredItemIds('parts'), amount: 120, userAgent: 'x'
  });
  assert.equal(res.ok, true);
  assert.equal(res.line.attested.by_user_id, 'usr_9');
  assert.equal(res.line.attested.by_name, 'Dave');
  assert.equal(res.line.attested.source, 'NAPA quote #4821');
  assert.equal(res.line.attested.checklist_version, P.ATTESTATION_VERSION);
  assert.equal(res.line.attested.amount_at_signing, 120);
  // The whole point: the record preserves what the AI had suggested.
  assert.equal(res.line.attested.ai_estimate_at_signing, 65);
  assert.ok(res.line.attested.at);
  // The original line is not mutated.
  assert.equal(line.attested, undefined);
});

test('a labor attestation snapshots the estimated hours, not a price', () => {
  const res = P.attestLine({ hours: 3, estimate: { hours: 2.4 } }, 'labor', {
    userId: 'u1', source: 'measured', items: P.requiredItemIds('labor'), amount: 300
  });
  assert.equal(res.line.attested.ai_estimate_at_signing, 2.4);
});

test('clearAttestation drops the signature but keeps the number', () => {
  const cleared = P.clearAttestation({ cost: 80, attested: signed() });
  assert.equal(cleared.attested, undefined);
  assert.equal(cleared.cost, 80);
});

/* --- totals --- */

test('an unsigned typed number is excluded from the quotable total', () => {
  const wo = { parts: [{ name: 'Pads', cost: 100 }], work: [] };
  const t = P.totals(wo, RATES);
  assert.equal(t.attested.total, null, 'nothing signed, so nothing quotable');
  assert.equal(t.entered.parts, 150);
  assert.equal(t.counts.pendingLines, 1);
  assert.equal(t.hasPending, true);
  assert.equal(t.quotable, false);
});

test('signing a line moves it into the quotable total', () => {
  const wo = { parts: [{ name: 'Pads', cost: 100, attested: signed() }], work: [] };
  const t = P.totals(wo, RATES);
  // 150 parts + 10% tax + 25 travel
  assert.equal(t.attested.parts, 150);
  assert.equal(t.attested.tax, 15);
  assert.equal(t.attested.travel, 25);
  assert.equal(t.attested.total, 190);
  assert.equal(t.counts.pendingLines, 0);
  assert.equal(t.quotable, true);
});

test('an AI estimate reaches the projected total but never the quotable one', () => {
  const wo = {
    parts: [{ name: 'Pads', cost: 100, attested: signed() }, { name: 'Rotors', estimate: { price: 200 } }],
    work: []
  };
  const t = P.totals(wo, RATES);
  assert.equal(t.attested.parts, 150);
  assert.equal(t.projected.parts, 350);
  assert.ok(t.projected.total > t.attested.total);
  assert.equal(t.counts.estimatedLines, 1);
  assert.equal(t.hasEstimates, true);
  assert.equal(t.quotable, false, 'an outstanding AI guess blocks quotable');
});

test('the three buckets nest: attested <= entered <= projected', () => {
  const wo = {
    parts: [
      { name: 'A', cost: 100, attested: signed() },
      { name: 'B', cost: 40 },
      { name: 'C', estimate: { price: 30 } }
    ],
    work: [{ name: 'R&R', hours: 2, attested: signed({ items: P.requiredItemIds('labor') }) }]
  };
  const t = P.totals(wo, RATES);
  assert.ok(t.attested.total <= t.entered.total);
  assert.ok(t.entered.total <= t.projected.total);
  assert.equal(t.counts.attestedLines, 2);
  assert.equal(t.counts.enteredLines, 3);
  assert.equal(t.counts.pendingLines, 1);
});

test('lines with no number at all are counted, not silently dropped', () => {
  const t = P.totals({ parts: [{ name: 'Unknown' }], work: [] }, RATES);
  assert.equal(t.counts.unpricedLines, 1);
  assert.equal(t.attested.total, null);
});

test('legacy confirmed alias points at the attested bucket', () => {
  const wo = { parts: [{ name: 'Pads', cost: 100 }], work: [] };
  const t = P.totals(wo, RATES);
  assert.equal(t.confirmed.total, t.attested.total);
  assert.equal(t.counts.confirmedLines, t.counts.attestedLines);
});

/* --- AI estimates --- */

test('applyAiEstimates fills estimates without touching real or signed values', () => {
  const wo = {
    parts: [{ name: 'Brake Pads', cost: 100, attested: signed() }, { name: 'Rotors' }],
    work: [{ name: 'Replace Front Brakes' }]
  };
  const ai = {
    parts_candidates: [{ name: 'Brake Pads', estimated_price: 55 }, { name: 'Rotors', estimated_price: 140 }],
    labor_suggestions: [{ operation: 'Replace Front Brakes', estimated_hours: 2.4 }]
  };
  const out = P.applyAiEstimates(wo, ai);
  assert.equal(out.parts[0].cost, 100, 'real cost untouched');
  assert.ok(out.parts[0].attested, 'signature untouched');
  assert.equal(out.parts[0].estimate, undefined, 'no estimate attached to a priced line');
  assert.equal(out.parts[1].estimate.price, 140);
  assert.equal(out.work[0].estimate.hours, 2.4);
  assert.equal(P.isAttested(out.parts[1], 'parts'), false);
});

test('formatters return empty rather than lying about a missing number', () => {
  assert.equal(P.formatMoney(null), '');
  assert.equal(P.formatHours(undefined), '');
  assert.equal(P.formatMoney(150), '$150.00');
  assert.equal(P.formatHours(2.5), '2.5 hr');
});

/*
 * Regression: a signature covers one figure, not a line forever.
 *
 * These exist because the first version of this module shipped a hole. The
 * amount was recorded at signing and then never looked at again, so changing
 * the shop's parts markup or labor rate silently re-priced every signed line
 * while leaving the signatures in place. A technician who signed for $150
 * would appear to have vouched for $250.
 */
test('raising the parts markup voids the signature it invalidates', () => {
  const rates = { laborRate: 75, partsMarkup: 50, taxRate: 0, travelFee: 0 };
  const signed = P.attestLine({ name: 'Brake Pads', cost: 100 }, 'parts', {
    userId: 'u1', userName: 'Dave', source: 'NAPA #4821',
    items: P.requiredItemIds('parts'), amount: P.partAmount({ cost: 100 }, rates).amount
  }).line;

  assert.equal(P.partAmount(signed, rates).amount, 150);
  assert.equal(P.partAmount(signed, rates).attested, true);
  assert.equal(P.partAmount(signed, rates).stale, false);

  const raised = { ...rates, partsMarkup: 150 };
  const after = P.partAmount(signed, raised);
  assert.equal(after.amount, 250, 'the line is worth more now');
  assert.equal(after.attested, false, 'nobody signed for $250');
  assert.equal(after.stale, true, 'and the UI must be able to say why');
});

test('a raised rate pulls the line back out of the quotable total', () => {
  const rates = { laborRate: 100, partsMarkup: 0, taxRate: 0, travelFee: 0 };
  const line = P.attestLine({ name: 'Replace Brakes', hours: 2 }, 'labor', {
    userId: 'u1', userName: 'Dave', source: 'Measured',
    items: P.requiredItemIds('labor'), amount: 200
  }).line;
  const wo = { parts: [], work: [line], tests: [] };

  assert.equal(P.totals(wo, rates).attested.total, 200);
  assert.equal(P.totals(wo, rates).counts.staleLines, 0);

  const raised = { ...rates, laborRate: 160 };
  const t = P.totals(wo, raised);
  assert.equal(t.attested.total, null, 'there is no quotable total any more');
  assert.equal(t.projected.total, 320, 'the working figure still reflects reality');
  assert.equal(t.counts.staleLines, 1);
  assert.equal(t.hasStale, true);
  assert.equal(t.counts.pendingLines, 1, 'it counts as awaiting a signature');
});

test('lowering a rate voids the signature too, not just raising it', () => {
  const rates = { laborRate: 100, partsMarkup: 0, taxRate: 0, travelFee: 0 };
  const line = P.attestLine({ name: 'Job', hours: 2 }, 'labor', {
    userId: 'u1', userName: 'Dave', source: 'Measured',
    items: P.requiredItemIds('labor'), amount: 200
  }).line;
  // A cheaper number is still a number nobody checked.
  assert.equal(P.laborAmount(line, { ...rates, laborRate: 50 }).attested, false);
});

test('rounding noise does not void a signature', () => {
  const rates = { laborRate: 100, partsMarkup: 0, taxRate: 0, travelFee: 0 };
  const line = P.attestLine({ name: 'Job', hours: 2 }, 'labor', {
    userId: 'u1', userName: 'Dave', source: 'Measured',
    items: P.requiredItemIds('labor'), amount: 200.001
  }).line;
  assert.equal(P.laborAmount(line, rates).attested, true, 'a tenth of a cent is not a price change');
  assert.equal(P.laborAmount(line, rates).stale, false);
});

test('an old record with no amount recorded is not treated as stale', () => {
  // Forward compatibility: rows signed before amount_at_signing existed.
  const line = { name: 'Part', cost: 100, attested: {
    by_user_id: 'u1', by_name: 'Dave', at: new Date().toISOString(),
    source: 'NAPA', items: P.requiredItemIds('parts')
  } };
  const r = P.partAmount(line, { partsMarkup: 50 });
  assert.equal(r.attested, true, 'nothing to compare against, so it stands');
  assert.equal(r.stale, false);
});

test('staleAttestationOf exposes the original figure for the warning', () => {
  const line = P.attestLine({ name: 'Part', cost: 100 }, 'parts', {
    userId: 'u1', userName: 'Dave', source: 'NAPA',
    items: P.requiredItemIds('parts'), amount: 150
  }).line;
  const s = P.staleAttestationOf(line, 'parts', 250);
  assert.equal(s.amount_at_signing, 150);
  assert.equal(s.by_name, 'Dave');
  assert.equal(P.staleAttestationOf(line, 'parts', 150), null, 'not stale when it matches');
});
