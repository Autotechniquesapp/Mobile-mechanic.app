const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const P = require(path.join(root, 'parts-extraction.js'));
const intakeQueue = read('intake-queue.js');
const openMap = read('open-map.js');
const workOrder = read('job-work-order.js');
const edgeFn = read('supabase/functions/intake-ai-workup/index.ts');
const html = read('index.html');
const workflow = read('.github/workflows/validate.yml');

/* ---------------------------------------------------------------------------
 * The shared catalog must cover what the app itself produces and promises.
 * ------------------------------------------------------------------------- */

test('every built-in fallback workup yields at least one orderable part', () => {
  // Pull the real partsCandidates arrays out of the edge function source so
  // this test keeps tracking them if the fallback copy is ever reworded.
  const blocks = edgeFn.match(/partsCandidates=\[[\s\S]*?\];/g) || [];
  assert.ok(blocks.length >= 4, `expected the built-in symptom branches, found ${blocks.length}`);
  for (const block of blocks) {
    const lines = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
    if (!lines.length) continue;
    const found = P.extractParts(lines);
    const isVagueBranch = lines.some(l => /^No parts should be selected/.test(l));
    if (isVagueBranch) {
      assert.equal(found.length, 0, 'the vague-complaint branch must not offer parts');
    } else {
      assert.ok(found.length > 0, `no parts extracted from: ${lines.join(' | ')}`);
    }
  }
});

test('the catalog covers every part the AI prompt tells the model to name', () => {
  // The prompt lists concrete examples; each must be sourceable.
  for (const part of ['starter assembly', 'starter relay', 'battery cable', 'fuel pump', 'alternator', 'brake pads', 'compressor']) {
    assert.ok(edgeFn.includes(part), `prompt no longer mentions "${part}" — update this test`);
    assert.ok(P.extractParts([part]).length > 0, `catalog cannot source "${part}"`);
  }
});

/* ---------------------------------------------------------------------------
 * Item 1 — the intake queue uses the shared catalog, not the old four-part list.
 * ------------------------------------------------------------------------- */

test('intake queue delegates part extraction to the shared catalog', () => {
  assert.match(intakeQueue, /window\.MobileMechanicParts/);
  assert.match(intakeQueue, /api\.extractParts\(rows\)/);
});

test('the hard-coded four-part no-start list is gone', () => {
  assert.doesNotMatch(intakeQueue, /out\.push\('Starter assembly'\)/);
  assert.doesNotMatch(intakeQueue, /if\(\/battery\/\.test\(text\)\)/);
});

test('a missing catalog yields no parts rather than a starter-only list', () => {
  const fn = intakeQueue.match(/function actionableParts\(rows=\[\]\)\{[\s\S]*?\n\}/)[0];
  assert.match(fn, /if\(!api\?\.extractParts\)return \[\];/);
});

/* ---------------------------------------------------------------------------
 * Item 2 — the AI workup survives conversion and seeds the work order.
 * ------------------------------------------------------------------------- */

test('converting an intake carries the AI workup onto the job', () => {
  assert.match(intakeQueue, /async function carryWorkupToJob/);
  assert.match(intakeQueue, /await carryWorkupToJob\(id,data\)/);
  assert.match(intakeQueue, /from\('jobs'\)\.update\(\{ai_workup:merged/);
});

test('carry-forward never overwrites a job that already has a diagnosis', () => {
  const fn = intakeQueue.match(/async function carryWorkupToJob[\s\S]*?\n\}/)[0];
  assert.match(fn, /if\(api\.hasDiagnosis\(job\?\.ai_workup\)\)return false;/);
  assert.match(fn, /work_order:job\?\.ai_workup\?\.work_order/, 'an existing work order must be preserved');
});

test('the work order seeds from the AI workup only while it is empty', () => {
  assert.match(workOrder, /api\?\.isEmptyWorkOrder\?\.\(wo\)&&api\.hasDiagnosis\?\.\(row\?\.ai_workup\)/);
  assert.match(workOrder, /seedWorkOrder\(row\.ai_workup\)/);
});

test('a saved work order is never replaced by AI seeding', () => {
  // Mirrors the guard in job-work-order.js load().
  const saved = { parts: [{ name: 'Customer-supplied battery' }], work: [], tests: [] };
  assert.equal(P.isEmptyWorkOrder(saved), false);
  const aiWorkup = { parts_candidates: ['Alternator — only if output testing fails'] };
  const shouldSeed = P.isEmptyWorkOrder(saved) && P.hasDiagnosis(aiWorkup);
  assert.equal(shouldSeed, false);
});

/* ---------------------------------------------------------------------------
 * Item 3 — the nearby-parts map is mounted beside the AI workup.
 * ------------------------------------------------------------------------- */

test('open-map exposes a mount point for other modules', () => {
  assert.match(openMap, /window\.MobileMechanicMap=\{/);
  assert.match(openMap, /mount\(container,\{location='',parts=\[\]\}=\{\}\)/);
});

test('the intake card renders a parts-map container seeded with customer location', () => {
  assert.match(intakeQueue, /data-intake-parts-map=/);
  assert.match(intakeQueue, /data-parts-location=/);
  assert.match(intakeQueue, /data-parts-names=/);
  assert.match(intakeQueue, /intake\.address\|\|intake\.current_location\?\.raw/);
});

test('the parts map is mounted after the queue modal renders', () => {
  assert.match(intakeQueue, /function mountIntakePartsMaps/);
  assert.match(intakeQueue, /document\.body\.appendChild\(d\);\s*\n\s*mountIntakePartsMaps\(\);/);
});

test('the map is only mounted once per intake card', () => {
  const fn = intakeQueue.match(/function mountIntakePartsMaps[\s\S]*?\n\}/)[0];
  assert.match(fn, /if\(el\.dataset\.partsMapReady==='1'\)return;/);
});

test('no parts map is rendered when no parts could be extracted', () => {
  const fn = intakeQueue.match(/function nearbyPartsMarkup[\s\S]*?\n\}/)[0];
  assert.match(fn, /if\(!partNames\.length\)return'';/);
});

test('store results offer a per-part stock check without claiming live inventory', () => {
  assert.match(openMap, /function partStockLinks/);
  assert.match(openMap, /\.join\(''\)\+partStockLinks\(state,stores\)/);
  assert.match(openMap, /Live inventory needs a supplier account/);
});

/* ---------------------------------------------------------------------------
 * Wiring.
 * ------------------------------------------------------------------------- */

test('parts-extraction.js loads before the modules that depend on it', () => {
  const at = f => html.indexOf(f);
  assert.ok(at('parts-extraction.js') > -1, 'parts-extraction.js is not loaded');
  assert.ok(at('parts-extraction.js') < at('open-map.js'));
  assert.ok(at('parts-extraction.js') < at('intake-queue.js'));
});

test('CI validates the new module and runs the test suite', () => {
  assert.match(workflow, /node --check parts-extraction\.js/);
  assert.match(workflow, /test -f parts-extraction\.js/);
  assert.match(workflow, /node --test test\/\*\.test\.js/);
});
