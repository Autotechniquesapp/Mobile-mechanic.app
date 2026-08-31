const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('modal close button cannot submit a form', () => {
  assert.match(app, /class="close-btn" type="button" data-action="close-modal"/);
});

test('modal supports delegated close, backdrop tap, and Escape', () => {
  assert.match(app, /function closeModal\(\)/);
  assert.match(app, /e\.target===backdrop/);
  assert.match(app, /e\.key==='Escape'/);
});
