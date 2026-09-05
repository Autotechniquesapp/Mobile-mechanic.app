const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('the highest subscription tier is presented as Pro', () => {
  for (const file of ['app.js', 'pricing-gates.js', 'admin.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /Pro\s*\/\s*Fleet|Pro\/Fleet/);
  }
  assert.match(read('app.js'), /name:'Pro', price:129\.99/);
  assert.match(read('pricing-gates.js'), /code:'pro_fleet',name:'Pro'/);
});
