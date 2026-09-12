import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const automation = await readFile(new URL('../integration-automation.js', import.meta.url), 'utf8');
const integrations = await readFile(new URL('../quickbooks-integration.js', import.meta.url), 'utf8');

test('Microsoft 365 is exposed as real shop integrations', () => {
  assert.match(integrations, /Microsoft 365 \/ Outlook Calendar/);
  assert.match(integrations, /Microsoft 365 \/ Outlook Email/);
  assert.match(integrations, /Microsoft OneDrive/);
  assert.match(integrations, /microsoft_calendar/);
  assert.match(integrations, /microsoft_email/);
  assert.match(integrations, /onedrive/);
});

test('OneDrive uses the normal OAuth connect and disconnect controls', () => {
  assert.doesNotMatch(integrations, /data-onedrive-learn-more/);
  assert.match(integrations, /data-business-connect/);
  assert.match(integrations, /data-business-disconnect/);
  assert.match(integrations, /Connect \$\{esc\(row\.name\)\}/);
});

test('Dropbox is absent while OneDrive remains the supported Microsoft file backup', () => {
  assert.doesNotMatch(integrations, /dropbox/i);
  assert.doesNotMatch(automation, /dropbox/i);
  assert.match(automation, /onedrive\.upload_text/);
});

test('Microsoft services remain separately permissioned', () => {
  assert.match(integrations, /Microsoft 365 services are authorized separately/);
});
