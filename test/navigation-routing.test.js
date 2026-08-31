const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('every literal data-route has a registered destination', () => {
  const routeBlock = source.match(/const routes=\{([\s\S]*?)\};\n  \(routes\[route\]/)?.[1] || '';
  const registered = new Set([
    'login', 'signup', 'admin', 'setup', 'dashboard', 'new-intake',
    'send-intake', 'customers', 'jobs', 'findings', 'ai-second', 'quote',
    'inspection', 'team', 'billing', 'settings', 'more', 'calendar',
    'reports', 'parts', 'fleet', 'roadside', 'warranty', 'templates',
    'training', 'carfax', 'export'
  ]);
  assert.ok(routeBlock, 'route registry should remain discoverable');
  for (const match of source.matchAll(/data-route="([a-z-]+)"/g)) {
    assert.ok(registered.has(match[1]), `unregistered route: ${match[1]}`);
  }
});

test('navigation is delegated for dynamically inserted controls', () => {
  assert.match(source, /document\.addEventListener\('click',[\s\S]*?closest\?\.\('\[data-route\]'\)/);
  assert.doesNotMatch(source, /querySelectorAll\('\[data-route\]'\)\.forEach/);
});

test('job rows do not nest an action button inside another button', () => {
  assert.match(source, /class="list-item job-list-item" role="button"/);
  assert.doesNotMatch(source, /<button class="list-item"[^`]*data-job=/);
});
