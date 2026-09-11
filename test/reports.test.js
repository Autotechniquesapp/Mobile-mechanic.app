import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('report totals are tappable filters backed by a delegated click handler', () => {
  for (const key of ['all', 'completed', 'declined', 'warranty']) {
    assert.match(app, new RegExp(`tile\\('${key}'`));
  }
  assert.match(app, /data-report-filter/);
  assert.match(app, /reports\(reportFilter\.dataset\.reportFilter\)/);
});

test('reports render job drill-down rows that open the complete job', () => {
  assert.match(app, /class="list-item report-job" data-open-job=/);
  assert.match(app, /Tap a row to open the complete job/);
});

test('profitability is calculated from saved job records instead of placeholder copy', () => {
  assert.match(app, /function reportJobFacts\(s,j\)/);
  assert.match(app, /revenue-partsCost-travelExpense-laborCost/);
  assert.match(app, /COMPLETED JOB PROFITABILITY/);
  assert.doesNotMatch(app, /Production version compares estimate vs\. actual technician time/);
});

test('missing financial data is identified rather than shown as fake profit', () => {
  assert.match(app, /Needs invoice/);
  assert.match(app, /Needs pricing/);
  assert.match(app, /Gross Before Overhead/);
});
