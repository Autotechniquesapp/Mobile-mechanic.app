const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'intake', 'autotechniques', 'index.html'), 'utf8');
const shareSources = [
  'app.js',
  'github-pages-intake.js',
  'intake-dashboard-fix.js',
  'settings-enhancements.js',
  'intake-repair.js'
].map(file => fs.readFileSync(path.join(root, file), 'utf8'));

test('AutoTechniques clean intake route has complete message-preview metadata', () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/mobile-mechanic\.app\/intake\/autotechniques">/);
  assert.match(page, /property="og:title" content="AutoTechniques Mobile Mechanic Service"/);
  assert.match(page, /property="og:image" content="https:\/\/mobile-mechanic\.app\/assets\/autotechniques-intake-preview\.jpg\?v=20260914-refined"/);
  assert.match(page, /name="twitter:card" content="summary_large_image"/);
  assert.match(page, /location\.replace\('https:\/\/mobile-mechanic\.app\/\?intake=autotechniques'\)/);
});

test('preview image is a correctly sized 1200 by 630 JPEG', () => {
  const image = fs.readFileSync(path.join(root, 'assets', 'autotechniques-intake-preview.jpg'));
  assert.equal(image.readUInt16BE(0), 0xffd8);
  const startOfFrame = image.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(startOfFrame > 0, 'JPEG must contain a baseline start-of-frame marker');
  assert.equal(image.readUInt16BE(startOfFrame + 7), 1200);
  assert.equal(image.readUInt16BE(startOfFrame + 5), 630);
});

test('every intake share surface produces the clean path URL', () => {
  for (const source of shareSources) {
    const usesLiteralOrigin = /https:\/\/mobile-mechanic\.app\/intake\/\$\{encodeURIComponent\(/.test(source);
    const usesCanonicalConstant = /const INTAKE_ORIGIN = 'https:\/\/mobile-mechanic\.app'/.test(source)
      && /\$\{INTAKE_ORIGIN\}\/intake\/\$\{encodeURIComponent\(/.test(source);
    assert.ok(usesLiteralOrigin || usesCanonicalConstant, 'share URL must use the canonical clean intake path');
    assert.doesNotMatch(source, /\/\?intake=\$\{encodeURIComponent\(/);
  }
});
