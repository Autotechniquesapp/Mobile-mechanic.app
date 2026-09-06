const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const landing=fs.readFileSync('cardata-inspired-landing.js','utf8');
const css=fs.readFileSync('cardata-inspired-landing.css','utf8');
const guards=fs.readFileSync('production-guards.js','utf8');

test('CarData-inspired landing script parses',()=>{
  assert.doesNotThrow(()=>new Function(landing));
});

test('landing keeps existing login card instead of recreating auth',()=>{
  assert.match(landing,/querySelector\('\.login-card'\)/);
  assert.match(landing,/slot\.appendChild\(card\)/);
  assert.doesNotMatch(landing,/signInWithPassword|signUp\(/);
});

test('landing includes trial, features, pricing and signup actions',()=>{
  assert.match(landing,/60-DAY FREE TRIAL/);
  assert.match(landing,/WHAT'S INSIDE/);
  assert.match(landing,/SIMPLE PRICING/);
  assert.match(landing,/data-mma-go="signup"/);
});

test('landing is responsive and production guard loads versioned assets',()=>{
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(guards,/cardata-inspired-landing\.css\?v=20260906-1/);
  assert.match(guards,/cardata-inspired-landing\.js\?v=20260906-1/);
});
