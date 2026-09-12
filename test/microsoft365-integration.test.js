import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const automation = await readFile(new URL('../integration-automation.js', import.meta.url), 'utf8');
const legacyUi = await readFile(new URL('../quickbooks-integration.js', import.meta.url), 'utf8');

test('Microsoft 365 bridge exposes the deployed Microsoft services', () => {
  assert.match(automation, /Microsoft 365 \/ Outlook Calendar/);
  assert.match(automation, /Microsoft 365 \/ Outlook Email/);
  assert.match(automation, /Microsoft OneDrive/);
  assert.match(automation, /microsoft_calendar/);
  assert.match(automation, /microsoft_email/);
  assert.match(automation, /onedrive/);
});

test('OneDrive Learn More dead-end is converted into a real connect or disconnect action', () => {
  assert.match(legacyUi, /data-onedrive-learn-more/);
  assert.match(automation, /removeAttribute\('data-onedrive-learn-more'\)/);
  assert.match(automation, /dataset\.businessConnect='onedrive'/);
  assert.match(automation, /dataset\.businessDisconnect='onedrive'/);
});

test('Dropbox is removed from the shop integration surface while OneDrive remains available', () => {
  assert.match(automation, /data-business-details="dropbox"/);
  assert.match(automation, /dropbox\.remove\(\)/);
  assert.match(automation, /Connect OneDrive/);
});

test('Microsoft services remain separately permissioned', () => {
  assert.match(automation, /Outlook Calendar, Outlook email and OneDrive separately/);
});
