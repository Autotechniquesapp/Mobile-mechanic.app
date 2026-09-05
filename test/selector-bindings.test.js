const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('AI action handlers use valid combined attribute selectors', () => {
  assert.match(source, /querySelector\('\[data-module="ai"\]\[data-action="ask-vehicle"\]'\)/);
  assert.match(source, /querySelector\('\[data-module="ai"\]\[data-action="second-opinion"\]'\)/);
  assert.doesNotMatch(source, /\[data-module="ai" data-action=/);
});

test('literal selectors passed to querySelector have balanced attribute brackets', () => {
  const selectors = [...source.matchAll(/querySelector(?:All)?\('([^']+)'\)/g)].map(match => match[1]);
  assert.ok(selectors.length > 0, 'expected to find literal DOM selectors');

  for (const selector of selectors) {
    const opens = (selector.match(/\[/g) || []).length;
    const closes = (selector.match(/\]/g) || []).length;
    assert.equal(opens, closes, `unbalanced attribute selector: ${selector}`);
  }
});
