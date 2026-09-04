const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('supabase/functions/push-notifications/index.ts', 'utf8');
const browserSource = fs.readFileSync('push-notifications.js', 'utf8');

test('push notification CORS supports the canonical and currently served domains', () => {
  assert.match(source, /https:\/\/mobile-mechanic\.app/);
  assert.match(source, /https:\/\/www\.mobile-mechanic\.app/);
  assert.match(source, /allowedOrigins\.has\(origin\)\?origin/);
  assert.match(source, /"Vary":"Origin"/);
  assert.doesNotMatch(source, /"Access-Control-Allow-Origin":"\*"/);
});

test('settings notification card does not continuously replace itself', () => {
  assert.match(browserSource, /existing\?\.dataset\.pushState===state\.key/);
  assert.match(browserSource, /card\.dataset\.pushState=state\.key/);
});
