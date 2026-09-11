/*
 * Live render test.
 *
 * The other test files assert on source text. This one actually runs
 * parts-extraction.js, open-map.js and intake-queue.js inside a real DOM,
 * drives the intake queue the way a mechanic does (click the queue button),
 * and asserts on the resulting elements. It catches what a regex cannot: a
 * throw during render, markup that never reaches the page, a mount point that
 * is built but never filled.
 *
 * Nothing real is contacted. Leaflet, fetch and Supabase are stubbed at the
 * window boundary, so the module code under test is the repo's own, unmodified.
 *
 * jsdom is a devDependency. Run `npm install` first. CI sets
 * MMA_REQUIRE_DOM_TESTS=1 so a missing dependency fails the build instead of
 * quietly skipping this file.
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
  throw new Error(`jsdom is required for the live render test but could not be loaded: ${loadError}`);
}
if (!JSDOM) {
  // Report a visible skip rather than an empty file, so nobody reads "0 tests"
  // as "the render test passed".
  test('intake queue live render (skipped: run npm install to get jsdom)', { skip: true }, () => {});
}
const describe = JSDOM ? test.describe : test.describe.skip;

const SHOP_ID = 'shop-test-0001';
const ADDRESS = '1400 S 4th Ave, Yuma, AZ 85364';

const INTAKE = {
  id: 'intake-0001',
  shop_id: SHOP_ID,
  status: 'new',
  created_at: '2026-09-11T10:00:00.000Z',
  customer_name: 'Dana Ruiz',
  phone: '928-555-0143',
  address: ADDRESS,
  concern: 'Grinding noise from the front when braking and the pedal pulses.',
  vehicle: { year: '2014', make: 'Ford', model: 'F-150', submodel: 'XLT', engine: '5.0L V8' },
  ai_status: 'complete',
  ai_workup: {
    summary: 'Front brake friction material is likely worn past specification.',
    likely_causes: [{ cause: 'Worn front brake pads', likelihood: 'high', why: 'Grinding under braking' }],
    first_checks: ['Measure front pad thickness'],
    diagnostic_tests: [{ test: 'Measure rotor runout', what_to_watch: 'runout beyond spec' }],
    parts_candidates: [
      'Brake pads or shoes — only if worn or contaminated',
      'Brake rotors or drums — only if damaged or outside specification',
      'Caliper or wheel cylinder — only if leaking, seized, or failing a hydraulic test'
    ],
    labor_suggestions: [{ operation: 'Front brake service', range: 'Use vehicle-specific labor data' }],
    safety: {}
  }
};

const STORES = {
  elements: [
    { lat: 32.6789, lon: -114.6201, tags: { name: 'AutoZone', 'addr:housenumber': '1550', 'addr:street': 'S 4th Ave', 'addr:city': 'Yuma', phone: '928-555-0100' } },
    { lat: 32.6712, lon: -114.6255, tags: { name: 'NAPA Auto Parts', 'addr:street': 'W 16th St', 'addr:city': 'Yuma' } }
  ]
};

/* A Leaflet stand-in. Only the surface open-map.js actually touches. */
function makeLeaflet(calls) {
  const layer = {
    _markers: [],
    clearLayers() { this._markers = []; },
    eachLayer(fn) { this._markers.forEach(fn); },
    addLayer(m) { this._markers.push(m); }
  };
  return {
    map(canvas) {
      calls.canvas = canvas;
      const m = {
        setView(c, z) { calls.views.push([c, z]); return m; },
        invalidateSize() { return m; },
        fitBounds(b, o) { calls.fitBounds.push([b, o]); return m; }
      };
      return m;
    },
    tileLayer: () => ({ addTo: () => ({}) }),
    layerGroup: () => ({ addTo: () => layer }),
    marker(coords) {
      const mk = {
        _ll: { lat: coords[0], lng: coords[1] },
        addTo(l) { l.addLayer?.(mk); calls.markers.push(coords); return mk; },
        bindPopup() { return mk; },
        openPopup() { return mk; },
        getLatLng() { return mk._ll; }
      };
      return mk;
    },
    latLngBounds: pts => ({ _pts: pts, pad() { return this; } })
  };
}

/* A Supabase stand-in: one pending intake, and a recording jobs table. */
function makeSupabase(recorder) {
  const result = (data, extra = {}) => Promise.resolve({ data, error: null, ...extra });
  const rows = table => (table === 'intake_submissions' ? [INTAKE] : []);
  return {
    from(table) {
      // Supabase query builders are chainable AND awaitable at any point, so
      // every filter returns the chain and `then` resolves whatever the last
      // terminal call implies.
      const chain = {
        _table: table,
        _mode: 'select',
        select(_cols, opts) { if (opts?.head) chain._mode = 'count'; return chain; },
        eq() { return chain; },
        order() { return chain; },
        maybeSingle() {
          if (table === 'intake_submissions') return result({ ai_workup: INTAKE.ai_workup });
          return result(recorder.jobRow);
        },
        update(patch) { recorder.updates.push({ table, patch }); chain._mode = 'update'; return chain; },
        then(res, rej) {
          if (chain._mode === 'count') return result(null, { count: rows(table).length }).then(res, rej);
          if (chain._mode === 'update') return result(null).then(res, rej);
          return result(rows(table)).then(res, rej);
        }
      };
      return chain;
    },
    rpc(name, args) { recorder.rpc.push({ name, args }); return result('job-0001'); },
    functions: { invoke: () => result({}) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {}
  };
}

async function renderQueue() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div class="dash-head"><h1>Dashboard</h1></div>
       <div class="dash-status"></div>
     </body></html>`,
    { url: 'https://mobile-mechanic.app/', runScripts: 'dangerously', pretendToBeVisual: true }
  );
  const { window } = dom;
  const calls = { views: [], markers: [], fitBounds: [] };
  const recorder = { updates: [], rpc: [], jobRow: { ai_workup: null } };
  const fetched = [];

  window.L = makeLeaflet(calls);
  window.MobileMechanicSupabase = makeSupabase(recorder);
  window.localStorage.setItem('mobile_mechanic_ai_approved_v7', JSON.stringify({ session: { shopId: SHOP_ID } }));
  window.fetch = async (url, opts) => {
    const href = String(url);
    fetched.push(href);
    if (href.includes('nominatim')) {
      return { ok: true, json: async () => [{ lat: '32.6927', lon: -114.6277, display_name: ADDRESS }] };
    }
    if (href.includes('overpass')) return { ok: true, json: async () => STORES };
    return { ok: false, json: async () => ({}) };
  };
  window.document.hasFocus = () => true;

  // The repo's own modules, in the order index.html loads them.
  for (const file of ['parts-extraction.js', 'open-map.js', 'intake-queue.js']) {
    const s = window.document.createElement('script');
    s.textContent = read(file);
    window.document.head.appendChild(s);
  }

  const settle = ms => new Promise(r => window.setTimeout(r, ms));
  await settle(400); // the module's own deferred boot
  const button = window.document.querySelector('[data-production-intake-queue]');
  if (button) button.click();
  await settle(1400); // panel geocode (100ms) + auto parts search (650ms)

  return { window, dom, calls, recorder, fetched };
}

describe('intake queue live render', () => {
  let ctx;
  // Closing a jsdom window mid-run leaves the modules' global click listeners
  // pointing at a torn-down document, so hold every window open until the end.
  const opened = [];

  test.before(async () => { ctx = await renderQueue(); opened.push(ctx.dom); });
  test.after(() => opened.forEach(d => d.window.close()));

  test('the queue button appears and opens a modal holding the intake card', () => {
    const doc = ctx.window.document;
    const button = doc.querySelector('[data-production-intake-queue]');
    assert.ok(button, 'the intake queue button never rendered');
    assert.match(button.textContent, /1 Customer Intake Waiting/);
    const modal = doc.querySelector('[data-intake-queue-modal]');
    assert.ok(modal, 'clicking the queue button did not open the modal');
    assert.match(modal.textContent, /Dana Ruiz/);
  });

  test('extracted parts are rendered as real elements, not just computed', () => {
    const doc = ctx.window.document;
    const text = doc.querySelector('[data-intake-queue-modal]').textContent;
    // Brake work: none of these are the four parts the old code knew about.
    for (const part of ['Brake pads', 'Brake rotors', 'Caliper']) {
      assert.ok(text.includes(part), `"${part}" was not rendered into the card`);
    }
    assert.ok(text.includes('2014 Ford F-150'), 'part search terms are missing the vehicle');
  });

  test('each rendered part carries working supplier lookup links', () => {
    const doc = ctx.window.document;
    const links = [...doc.querySelectorAll('[data-intake-queue-modal] a[href*="autozonepro.com"]')];
    assert.ok(links.length >= 3, `expected a supplier link per part, found ${links.length}`);
    const href = links[0].getAttribute('href');
    assert.ok(/searchText=.+/.test(href), 'the supplier link has no search term');
    assert.ok(/Ford|F-150/.test(decodeURIComponent(href)), 'the supplier link does not identify the vehicle');
  });

  test('the parts map mount point is filled in by open-map.js', () => {
    const doc = ctx.window.document;
    const slot = doc.querySelector('[data-intake-parts-map]');
    assert.ok(slot, 'the parts map container was never rendered');
    assert.equal(slot.dataset.partsLocation, ADDRESS);
    assert.ok(slot.dataset.partsNames.includes('|'), 'part names were not passed to the map');
    assert.equal(slot.dataset.partsMapReady, '1', 'the map was never mounted');
    assert.ok(slot.querySelector('.mma-map-canvas'), 'open-map.js did not build a map canvas in the slot');
  });

  test('the customer address is geocoded and plotted', () => {
    assert.ok(ctx.fetched.some(u => u.includes('nominatim')), 'the address was never geocoded');
    assert.ok(ctx.calls.markers.length >= 1, 'no marker was placed on the map');
    const status = ctx.window.document.querySelector('[data-intake-parts-map] .mma-map-status');
    assert.ok(status, 'the map has no status line');
    assert.doesNotMatch(status.textContent, /busy right now/, 'the nearby-store search failed');
  });

  test('nearby stores are rendered with distances and per-part stock links', () => {
    const doc = ctx.window.document;
    const results = doc.querySelector('[data-intake-parts-map] .mma-map-results');
    assert.ok(results, 'the store results container is missing');
    const stores = [...results.querySelectorAll('[data-store]')];
    assert.equal(stores.length, 2, `expected the two stubbed stores, rendered ${stores.length}`);
    assert.match(results.textContent, /AutoZone/);
    assert.match(stores[0].textContent, /\d+\.\d mi/, 'store distance was not rendered');
    const stock = [...results.querySelectorAll('.mma-map-part-link')];
    assert.ok(stock.length >= 3, `expected a stock link per part, found ${stock.length}`);
    assert.match(results.textContent, /Live inventory needs a supplier account/);
  });

  test('the map fits its bounds around the customer and the stores', () => {
    assert.ok(ctx.calls.fitBounds.length >= 1, 'the map never fit bounds to the results');
    assert.ok(ctx.calls.markers.length >= 3, 'expected the customer plus both stores to be plotted');
  });

  test('no part is rendered when the workup names none', async () => {
    // Render again with a workup that declines to name parts.
    const saved = INTAKE.ai_workup.parts_candidates;
    INTAKE.ai_workup.parts_candidates = ['No parts should be selected until a road test confirms the concern.'];
    try {
      const alt = await renderQueue();
      opened.push(alt.dom);
      const doc = alt.window.document;
      assert.ok(doc.querySelector('[data-intake-queue-modal]'), 'the modal failed to render');
      assert.equal(doc.querySelector('[data-intake-parts-map]'), null, 'a parts map was rendered with no parts');
      assert.equal(doc.querySelector('a[href*="autozonepro.com"]'), null, 'supplier links were rendered with no parts');
    } finally {
      INTAKE.ai_workup.parts_candidates = saved;
    }
  });

  test('converting the intake carries the workup onto the job', () => {
    const doc = ctx.window.document;
    const convert = doc.querySelector('[data-convert-intake]');
    assert.ok(convert, 'the convert button was never rendered');
    convert.click();
    return new Promise(r => ctx.window.setTimeout(r, 300)).then(() => {
      assert.deepEqual(ctx.recorder.rpc.map(c => c.name), ['convert_intake_to_job']);
      const jobUpdate = ctx.recorder.updates.find(u => u.table === 'jobs' && u.patch.ai_workup);
      assert.ok(jobUpdate, 'the AI workup was not written to the job');
      assert.equal(jobUpdate.patch.ai_workup.carried_from_intake, INTAKE.id);
      assert.equal(jobUpdate.patch.ai_workup.summary, INTAKE.ai_workup.summary);
      assert.ok(!('work_order' in jobUpdate.patch.ai_workup), 'an empty work_order key was carried over');
    });
  });
});
