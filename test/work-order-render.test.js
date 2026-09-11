/*
 * Live render test for work order pricing and attestation.
 *
 * Runs work-order-pricing.js and job-work-order.js inside a real DOM, mounts
 * the work order the way the app does, and then does what a mechanic does:
 * type a cost, open the sign-off dialog, try to sign without ticking the
 * boxes, tick them, sign, and change the number afterwards.
 *
 * The assertions are about one property above all: a number nobody signed for
 * must never appear in the quotable total.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let JSDOM = null;
let loadError = '';
try {
  ({ JSDOM } = require('jsdom'));
} catch (err) {
  loadError = err.message;
}
if (!JSDOM && process.env.MMA_REQUIRE_DOM_TESTS) {
  throw new Error(`jsdom is required for the work order render test but could not be loaded: ${loadError}`);
}
if (!JSDOM) {
  test('work order live render (skipped: run npm install to get jsdom)', { skip: true }, () => {});
}
const describe = JSDOM ? test.describe : test.describe.skip;

const SHOP_ID = 'shop-test-0001';
const JOB_ID = 'job-0001';
const USER_ID = 'usr_tech_7';

const AI_WORKUP = {
  summary: 'Front brake friction material worn past specification.',
  work_order: {
    parts: [
      { name: 'Brake Pads', status: 'needed', price: null, source: '' },
      { name: 'Rotors', status: 'needed', price: null, source: '' }
    ],
    work: [{ name: 'Replace Front Brakes', status: 'to_do' }],
    tests: [{ name: 'Measure rotor runout', status: 'to_do', purpose: 'check spec' }],
    authorization: { status: '', note: '' }
  },
  parts_candidates: [
    { name: 'Brake Pads', estimated_price: 65 },
    { name: 'Rotors', estimated_price: 140 }
  ],
  labor_suggestions: [{ operation: 'Replace Front Brakes', estimated_hours: 2.4 }]
};

function makeSupabase(recorder) {
  const result = (data, extra = {}) => Promise.resolve({ data, error: null, ...extra });
  return {
    from(table) {
      const chain = {
        _mode: 'select',
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'jobs') return result({ id: JOB_ID, ai_workup: recorder.aiWorkup, status: 'in_progress' });
          return result(null);
        },
        single() { return result({ ai_workup: recorder.aiWorkup }); },
        update(patch) {
          recorder.updates.push(patch);
          if (patch.ai_workup) recorder.aiWorkup = patch.ai_workup;
          chain._mode = 'update';
          return chain;
        },
        then(res, rej) {
          if (chain._mode === 'update') return result(null).then(res, rej);
          return result([]).then(res, rej);
        }
      };
      return chain;
    },
    functions: { invoke: () => result({}) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {}
  };
}

async function renderWorkOrder() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div class="page-title"><h2>AI Pre-Workup</h2><p>sub</p></div>
       <div class="job-banner">2014 Ford F-150</div>
     </body></html>`,
    { url: 'https://mobile-mechanic.app/', runScripts: 'dangerously', pretendToBeVisual: true }
  );
  const { window } = dom;
  const recorder = { updates: [], aiWorkup: JSON.parse(JSON.stringify(AI_WORKUP)) };

  // jsdom does not implement structuredClone, which every target browser has.
  // Supplying it keeps the module under test unmodified.
  if (!window.structuredClone) window.structuredClone = v => JSON.parse(JSON.stringify(v));
  window.MobileMechanicSupabase = makeSupabase(recorder);
  window.localStorage.setItem('mobile_mechanic_ai_approved_v7', JSON.stringify({
    session: { role: 'shop', shopId: SHOP_ID, userId: USER_ID, activeJobId: JOB_ID },
    shops: {
      [SHOP_ID]: {
        id: SHOP_ID,
        laborRate: 100,
        partsMarkup: 50,
        taxRate: 0,
        travelFee: 0,
        users: [{ id: USER_ID, name: 'Dave Ruiz', role: 'technician', active: true }],
        jobs: [{ id: JOB_ID, vehicle: { year: '2014', make: 'Ford', model: 'F-150' } }]
      }
    }
  }));

  for (const file of ['work-order-pricing.js', 'job-work-order.js']) {
    const s = window.document.createElement('script');
    s.textContent = read(file);
    window.document.head.appendChild(s);
  }

  const settle = ms => new Promise(r => window.setTimeout(r, ms));
  await settle(1200); // the module's own deferred mount at 900ms
  return { window, dom, recorder, settle };
}

describe('work order pricing and attestation live render', () => {
  let ctx;
  const opened = [];

  test.before(async () => { ctx = await renderWorkOrder(); opened.push(ctx.dom); });
  test.after(() => opened.forEach(d => d.window.close()));

  const $ = sel => ctx.window.document.querySelector(sel);
  const $$ = sel => [...ctx.window.document.querySelectorAll(sel)];
  const totalsText = () => $('[data-jwo-totals]')?.textContent || '';

  test('the work order mounts as a technician, with money fields visible', () => {
    assert.ok($('[data-job-work-order]'), 'work order rendered');
    // The point of the permission widening: a technician, not just an owner.
    assert.ok($$('[data-jwo-cost]').length >= 2, 'per-part cost inputs present');
    assert.ok($$('[data-jwo-hours]').length >= 1, 'per-labor hours input present');
  });

  test('AI estimates from the workup are shown, flagged as estimates', () => {
    const chips = $$('.jwo-est').map(c => c.textContent);
    assert.ok(chips.some(t => /65/.test(t)), 'part estimate surfaced');
    assert.ok(chips.some(t => /2\.4/.test(t)), 'labor estimate surfaced');
    assert.ok($$('.jwo-amt.est').length >= 2, 'estimated amounts styled apart from real ones');
  });

  test('an AI estimate alone cannot be signed off', () => {
    assert.ok($$('.jwo-attest.none').length >= 1, 'estimate-only lines offer no sign-off button');
    assert.equal($$('[data-jwo-attest]').length, 0, 'nothing signable before a real number is entered');
  });

  test('with nothing signed, there is no quotable total', () => {
    const t = totalsText();
    assert.match(t, /Nothing signed off yet/);
    assert.match(t, /not quotable/i);
  });

  test('the terms disclaimer is rendered next to the numbers', () => {
    const d = $('.jwo-disclaimer');
    assert.ok(d, 'disclaimer present');
    assert.match(d.textContent, /informational aids only/);
    assert.match(d.textContent, /may be incomplete or incorrect/);
    assert.match(d.textContent, /Check every labor time and part price yourself/);
  });

  test('typing a real cost replaces the estimate but stays unsigned', async () => {
    const input = $$('[data-jwo-cost]')[0];
    input.value = '100';
    input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
    await ctx.settle(60);

    const row = $$('.jwo-row-money')[0];
    // 100 cost + 50% shop markup
    assert.match(row.textContent, /\$150\.00/);
    assert.ok(row.querySelector('[data-jwo-attest]'), 'now offers a sign-off button');
    assert.match(row.textContent, /Not checked/);
    assert.match(totalsText(), /Nothing signed off yet/, 'typing a number does not make it quotable');
    assert.match(totalsText(), /1 line not signed off/);
  });

  test('the sign-off dialog shows the AI guess and refuses an incomplete signature', async () => {
    $('[data-jwo-attest]').click();
    await ctx.settle(40);
    const modal = $('[data-jwo-attest-modal]');
    assert.ok(modal, 'dialog opened');
    assert.match(modal.textContent, /\$150\.00/);
    assert.match(modal.textContent, /The AI estimated \$65\.00/);
    assert.match(modal.textContent, /informational aids only/);
    assert.match(modal.textContent, /Signing as/);
    assert.match(modal.textContent, /Dave Ruiz/);

    // Submit with nothing ticked and no source.
    modal.querySelector('[data-jwo-attest-form]').dispatchEvent(new ctx.window.Event('submit', { bubbles: true, cancelable: true }));
    await ctx.settle(30);
    assert.ok($('[data-jwo-attest-modal]'), 'dialog stays open on a refused signature');
    const err = $('[data-jwo-attest-err]');
    assert.equal(err.hidden, false);
    // Both the source and the boxes are missing; the message names the source first.
    assert.match(err.textContent, /labor guide, supplier or quote|Check every box/i);
    assert.match(totalsText(), /Nothing signed off yet/, 'refused signature changed nothing');
  });

  test('ticking every box but leaving the source blank is still refused', async () => {
    const modal = $('[data-jwo-attest-modal]');
    modal.querySelectorAll('[data-jwo-check]').forEach(c => { c.checked = true; });
    modal.querySelector('[data-jwo-attest-source]').value = '   ';
    modal.querySelector('[data-jwo-attest-form]').dispatchEvent(new ctx.window.Event('submit', { bubbles: true, cancelable: true }));
    await ctx.settle(30);
    assert.ok($('[data-jwo-attest-modal]'), 'still open');
    assert.match($('[data-jwo-attest-err]').textContent, /labor guide, supplier or quote/i);
  });

  test('a complete signature records the name, source and AI guess, and becomes quotable', async () => {
    const modal = $('[data-jwo-attest-modal]');
    modal.querySelectorAll('[data-jwo-check]').forEach(c => { c.checked = true; });
    modal.querySelector('[data-jwo-attest-source]').value = 'NAPA counter quote #4821';
    modal.querySelector('[data-jwo-attest-form]').dispatchEvent(new ctx.window.Event('submit', { bubbles: true, cancelable: true }));
    await ctx.settle(80);

    assert.equal($('[data-jwo-attest-modal]'), null, 'dialog closed');
    const row = $$('.jwo-row-money')[0];
    assert.match(row.textContent, /Checked by Dave Ruiz/);
    assert.match(row.textContent, /NAPA counter quote #4821/);
    assert.match(totalsText(), /\$150\.00/);
    assert.doesNotMatch(totalsText(), /Nothing signed off yet/);

    // And it was persisted, with the evidence intact.
    const saved = ctx.recorder.aiWorkup.work_order.parts[0];
    assert.equal(saved.attested.by_user_id, USER_ID);
    assert.equal(saved.attested.by_name, 'Dave Ruiz');
    assert.equal(saved.attested.source, 'NAPA counter quote #4821');
    assert.equal(saved.attested.amount_at_signing, 150);
    assert.equal(saved.attested.ai_estimate_at_signing, 65, 'the AI guess is preserved on the record');
    assert.ok(saved.attested.checklist_version);
    assert.equal(saved.attested.items.length, 3);
  });

  test('changing the number afterwards revokes the signature', async () => {
    const input = $$('[data-jwo-cost]')[0];
    input.value = '400';
    input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
    await ctx.settle(80);

    const row = $$('.jwo-row-money')[0];
    assert.match(row.textContent, /Not checked/, 'signature dropped when the figure changed');
    assert.doesNotMatch(row.textContent, /Checked by/);
    assert.equal(ctx.recorder.aiWorkup.work_order.parts[0].attested, undefined, 'revocation persisted');
    assert.match(totalsText(), /Nothing signed off yet/, 'the raised figure is not quotable');
  });
});
