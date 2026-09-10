const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js','utf8');
const production = fs.readFileSync('supabase-production.js','utf8');
const styles = fs.readFileSync('styles.css','utf8');
const migration = fs.readFileSync('supabase/migrations/202609100001_shop_module_preferences.sql','utf8');

test('module cards expose clear whole-card on/off switches',()=>{
  assert.match(app,/class="plan-card config-toggle"/);
  assert.match(app,/state-on">ON/);
  assert.match(app,/state-off">OFF/);
  assert.match(styles,/\.config-toggle\{cursor:pointer/);
});
test('business modules persist to the authenticated shop',()=>{
  assert.match(production,/form\.id==='businessTypesForm'/);
  assert.match(production,/\.from\('shops'\)\.update\(\{specialties,modules/);
  assert.match(production,/\.eq\('shop_id',sid\)/);
  assert.match(production,/modules:Array\.isArray\(shop\.modules\)/);
});
test('shop module preference columns are tracked in a migration',()=>{
  assert.match(migration,/add column if not exists specialties text\[\]/);
  assert.match(migration,/add column if not exists modules text\[\]/);
});
