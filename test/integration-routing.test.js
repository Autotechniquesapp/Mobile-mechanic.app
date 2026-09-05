const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const integrations = fs.readFileSync(path.join(__dirname, '..', 'quickbooks-integration.js'), 'utf8');

test('shop integrations has a registered direct route', () => {
  assert.match(app, /function integrations\(\)/);
  assert.match(app, /settings,integrations,more/);
  assert.match(integrations, /MobileMechanicOpenBusinessIntegrations=openIntegrationsPage/);
});

test('every integration exposes status or connection information', () => {
  assert.match(integrations, /data-business-details=/);
  assert.match(integrations, /data-parts-details=/);
  assert.match(integrations, /Problem found/);
  assert.match(integrations, /No reported connection error/);
});
