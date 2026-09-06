const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const legal = fs.readFileSync('legal-protections.js', 'utf8');
const privacy = fs.readFileSync('privacy.html', 'utf8');
const dataUse = fs.readFileSync('data-use.html', 'utf8');
const notFound = fs.readFileSync('404.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260906180128_add_privacy_data_use_acceptance.sql', 'utf8');

test('public legal documents exist with explicit versions', () => {
  assert.match(privacy, /Privacy Policy/);
  assert.match(privacy, /Version 2026-09-v1/);
  assert.match(dataUse, /Data Collection & Use Policy/);
  assert.match(dataUse, /Version 2026-09-v1/);
});

test('setup acceptance covers terms privacy and data use', () => {
  assert.match(legal, /PRIVACY_VERSION\s*=\s*'2026-09-v1'/);
  assert.match(legal, /DATA_USE_VERSION\s*=\s*'2026-09-v1'/);
  assert.match(legal, /privacy_version:PRIVACY_VERSION/);
  assert.match(legal, /data_use_version:DATA_USE_VERSION/);
  assert.match(legal, /privacy_accepted_at:acceptedAt/);
  assert.match(legal, /data_use_accepted_at:acceptedAt/);
  assert.match(legal, /href="\/privacy"/);
  assert.match(legal, /href="\/data-use"/);
});

test('pretty legal routes resolve on GitHub Pages', () => {
  assert.match(notFound, /parts\[0\] === 'privacy'/);
  assert.match(notFound, /privacy\.html/);
  assert.match(notFound, /parts\[0\] === 'data-use'/);
  assert.match(notFound, /data-use\.html/);
});

test('database migration stores legal document versions and acceptance times', () => {
  for (const column of [
    'privacy_version', 'privacy_accepted_at', 'data_use_version', 'data_use_accepted_at'
  ]) assert.match(migration, new RegExp(column));
});
