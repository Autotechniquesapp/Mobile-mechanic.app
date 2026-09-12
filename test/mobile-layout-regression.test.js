const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const feedback = fs.readFileSync('feedback.js', 'utf8');
const help = fs.readFileSync('technician-help.js', 'utf8');
const square = fs.readFileSync('square-sync.js', 'utf8');
const processors = fs.readFileSync('payment-processors.js', 'utf8');

test('Square synchronization stays inside the Square content column', () => {
  assert.match(processors, /data-square-sync-slot/);
  assert.match(square, /card\.querySelector\('\[data-square-sync-slot\]'\)\|\|card\.querySelector\('\.list-main'\)/);
  assert.doesNotMatch(square, /card\.insertAdjacentHTML\('beforeend'.*square-sync-panel/);
});

test('mobile helper controls do not float over page actions', () => {
  assert.match(feedback, /@media\(max-width:560px\)\{\.feedback-fab\{position:static/);
  assert.match(help, /@media\(max-width:560px\)\{\.tech-help-fab\{position:static/);
  assert.match(feedback, /content\.appendChild\(btn\)/);
  assert.match(help, /content\.appendChild\(b\)/);
  assert.match(help, /job-banner,\[data-job-work-order\]/);
});

test('narrow authenticated headers reserve room for admin and settings controls', () => {
  assert.match(css, /\.topbar \.brand-copy\{display:none\}/);
  assert.match(css, /\.topbar \.mma-platform-admin-link\{/);
  assert.match(html, /feedback\.js\?v=20260912-mobile-layout1/);
  assert.match(html, /technician-help\.js\?v=20260912-mobile-layout1/);
  assert.match(html, /admin-access\.js\?v=20260912-mobile-layout1/);
});
