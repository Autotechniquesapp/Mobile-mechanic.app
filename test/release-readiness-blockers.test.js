const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const production=fs.readFileSync('supabase-production.js','utf8');
const queue=fs.readFileSync('intake-queue.js','utf8');
const edge=fs.readFileSync('supabase/functions/intake-ai-workup/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260912102500_scope_jobs_to_selected_shop.sql','utf8');
const square=fs.readFileSync('supabase/functions/square-invoice/index.ts','utf8');
const customerEstimate=fs.readFileSync('supabase/functions/customer-estimate/index.ts','utf8');
const html=fs.readFileSync('index.html','utf8');

test('selected shop id is validated by the server-scoped jobs RPC',()=>{
  assert.match(production,/rpc\('get_my_shop_jobs',\{p_shop_id:sid\}\)/);
  assert.match(migration,/m\.shop_id\s*=\s*p_shop_id/);
  assert.match(migration,/m\.user_id\s*=\s*\(select auth\.uid\(\)\)/);
  assert.match(migration,/j\.shop_id\s*=\s*p_shop_id/);
  assert.match(migration,/revoke execute on function public\.get_my_shop_jobs\(\) from authenticated/);
  assert.doesNotMatch(migration,/order by m\.created_at limit 1/);
});

test('built-in workup preserves and displays the paid AI failure',()=>{
  assert.match(edge,/ai_error:providerError/);
  assert.match(edge,/source:"built_in",ai_error:providerError/);
  assert.match(queue,/Built-in fallback:/);
  assert.match(queue,/Paid AI did not run/);
  assert.match(queue,/i\.ai_error/);
});

test('Square invoice authorization follows the invoice shop',()=>{
  assert.match(square,/eq\("user_id", user\.id\)\.eq\("shop_id", invoice\.shop_id\)/);
  assert.match(square,/if \(!membership\) return json\(\{ error: "Invoice not found\." \}, 404\)/);
  assert.doesNotMatch(square,/eq\("status", "active"\)\.limit\(1\)\.maybeSingle\(\)/);
});

test('public estimate backend is tracked and validates its signed link input',()=>{
  assert.match(customerEstimate,/\^\[a-f0-9\]\{64\}\$/);
  assert.match(customerEstimate,/submit_customer_estimate_decision/);
  assert.match(customerEstimate,/p_customer_name/);
  assert.match(customerEstimate,/decision !== "approved" && decision !== "declined"/);
  assert.match(customerEstimate,/Access-Control-Allow-Origin": "https:\/\/mobile-mechanic\.app"/);
});

test('the fallback disclosure is cache-busted into production',()=>{
  assert.match(html,/intake-queue\.js\?v=20260914-release-blockers1/);
});


test('production job writes stay scoped to the selected shop',()=>{
  assert.match(production,/save-schedule'[\\s\\S]*?eq\\('id',jid\\)\\.eq\\('shop_id',sid\\)/);
  assert.match(production,/save-findings'[\\s\\S]*?eq\\('id',jid\\)\\.eq\\('shop_id',sid\\)/);
  assert.match(production,/complete-job'[\\s\\S]*?eq\\('id',jid\\)\\.eq\\('shop_id',sid\\)/);
  assert.match(production,/decline-job'[\\s\\S]*?eq\\('id',jid\\)\\.eq\\('shop_id',sid\\)/);
});
