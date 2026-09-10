const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const actions = fs.readFileSync('job-tile-actions.js', 'utf8');
const production = fs.readFileSync('supabase-production.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

test('the job-row button itself is not mistaken for a nested control', () => {
  assert.match(actions, /const nestedControl=control&&control!==tile/);
  assert.match(actions, /if\(nameClickedInTile\(e,tile,j\)\|\|!nestedControl\)/);
});
test('complete and decline actions use production persistence', () => {
  assert.match(actions, /dispatchPersistentAction\('complete-job',id\)/);
  assert.match(actions, /dispatchPersistentAction\('decline-job',id\)/);
  assert.match(production, /if\(action==='complete-job'\)/);
  assert.match(production, /if\(action==='decline-job'\)/);
});
test('signed-in users can securely change their own Supabase password', () => {
  assert.match(app, /id="changePasswordForm"/);
  assert.match(production, /signInWithPassword\(\{email:user\.email,password:/);
  assert.match(production, /updateUser\(\{password:/);
  assert.match(html, /app\.js\?v=20260910-jobtiles-password/);
});
