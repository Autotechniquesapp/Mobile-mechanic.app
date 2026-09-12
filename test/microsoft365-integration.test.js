import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const automation = await readFile(new URL('../integration-automation.js', import.meta.url), 'utf8');
const integrations = await readFile(new URL('../quickbooks-integration.js', import.meta.url), 'utf8');
const catalog = await readFile(new URL('../supabase/functions/business-integrations/index.ts', import.meta.url), 'utf8');

test('Microsoft 365 providers are hidden from the shop integration catalog for now', () => {
  assert.doesNotMatch(catalog, /provider:"microsoft_calendar"/);
  assert.doesNotMatch(catalog, /provider:"microsoft_email"/);
  assert.doesNotMatch(catalog, /provider:"onedrive"/);
  assert.doesNotMatch(catalog, /connector:"microsoft-business-oauth"/);
});

test('the integrations UI defensively filters paused Microsoft providers', () => {
  assert.match(integrations, /HIDDEN_PROVIDERS=new Set\(\['microsoft_calendar','microsoft_email','onedrive'\]\)/);
  assert.match(integrations, /filter\(x=>!HIDDEN_PROVIDERS\.has\(x\.provider\)\)/);
  assert.doesNotMatch(integrations, /Microsoft 365 services are authorized separately so each shop grants only the permissions it wants/);
});

test('Dropbox remains absent and dormant OneDrive backup code cannot surface without a catalog connection', () => {
  assert.doesNotMatch(integrations, /dropbox/i);
  assert.doesNotMatch(automation, /dropbox/i);
  assert.match(automation, /st\.onedrive\?\.status==='connected'/);
});
