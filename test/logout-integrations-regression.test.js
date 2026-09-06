const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const logout = fs.readFileSync('logout-screen.js', 'utf8');
const automation = fs.readFileSync('integration-automation.js', 'utf8');
const health = fs.readFileSync('supabase/functions/integration-health/index.ts', 'utf8');

test('logout confirmation loads before production auth handlers', () => {
  const logoutPos = index.indexOf('logout-screen.js');
  const authPos = index.indexOf('supabase-production.js');
  assert.ok(logoutPos >= 0, 'logout-screen.js must be loaded');
  assert.ok(authPos >= 0, 'supabase-production.js must be loaded');
  assert.ok(logoutPos < authPos, 'logout confirmation must capture logout before auth fallback handlers');
});

test('logout signs out remotely and clears local workspace session', () => {
  assert.match(logout, /MobileMechanicSupabase\?\.auth/);
  assert.match(logout, /auth\.signOut\(\)/);
  assert.match(logout, /localStorage\.removeItem\(DBKEY\)/);
  assert.match(logout, /data-confirm-logout/);
  assert.match(logout, /data-cancel-logout/);
});

test('shop navigation removes the legacy bottom bar and keeps drawer logout', () => {
  assert.match(logout, /removeBottomNavigation\(\)/);
  assert.match(logout, /querySelectorAll\('\.bottom-nav'\)/);
  assert.match(logout, /addDrawerLogout\(\)/);
});

test('Dropbox is not part of the supported backup flow', () => {
  assert.doesNotMatch(automation, /dropbox/i);
  assert.doesNotMatch(health, /dropbox/i);
});

test('OneDrive remains explicitly supported', () => {
  assert.match(automation, /onedrive\.upload_text/);
  assert.match(health, /onedrive:\s*microsoftReady/);
});
