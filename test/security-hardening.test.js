const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js','utf8');
const intake = fs.readFileSync('public-intake-rpc.js','utf8');

test('complete browser application bundle parses', () => {
  assert.doesNotThrow(() => new Function(app));
});

test('production source does not publish prototype passwords', () => {
  assert.doesNotMatch(app, /MasterDemo|BillingDemo|SupportDemo|DemoShop|TechDemo/);
  assert.doesNotMatch(app, /password\s*:\s*['"][^'"]+['"]/);
});

test('public browser does not invoke privileged notification function', () => {
  assert.doesNotMatch(intake, /notify_intake|push-notifications/);
});
