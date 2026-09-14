import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tools = await readFile(new URL('../job-workflow-tools.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('mechanic job workflow tools are loaded', () => {
  assert.match(index, /job-workflow-tools\.js\?v=20260914-voice-suppliers1/);
});

test('voice findings save to the active job', () => {
  assert.match(tools, /SpeechRecognition\|\|window\.webkitSpeechRecognition/);
  assert.match(tools, /from\('jobs'\)\.update\(\{findings:text/);
  assert.match(tools, /data-jwt-findings/);
});

test('supplier shortcuts use Google Maps and do not fake inventory', () => {
  assert.match(tools, /google\.com\/maps\/search\/\?api=1/);
  for (const supplier of ['AutoZone','NAPA Auto Parts','Advance Auto Parts','Dealership Parts']) {
    assert.match(tools, new RegExp(supplier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(tools, /Live inventory\/pricing still requires a supplier integration/);
});
