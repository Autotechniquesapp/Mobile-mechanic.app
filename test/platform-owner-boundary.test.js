const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202609120001_single_platform_owner.sql', 'utf8');

test('the app exposes one Platform Owner and no delegated platform-admin creator', () => {
  assert.match(app, /This platform has one owner account/);
  assert.doesNotMatch(app, /Create Platform Admin/);
  assert.doesNotMatch(app, /platformAdminForm/);
  assert.doesNotMatch(app, /platformAdmins\.push/);
});

test('the database permits only one platform-wide owner row', () => {
  assert.match(migration, /check \(role = 'platform_owner'\)/);
  assert.match(migration, /unique index if not exists platform_admins_single_row/);
  assert.match(migration, /on public\.platform_admins \(\(true\)\)/);
  assert.match(migration, /shop_members/);
});
