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

test('reports do not show incomplete profitability figures', () => {
  assert.match(app, /function reportJobFacts\(s,j\)/);
  assert.doesNotMatch(app, /COMPLETED JOB PROFITABILITY/);
  assert.doesNotMatch(app, /Gross Before Overhead/);
  assert.doesNotMatch(app, /class="report-money"/);
});
