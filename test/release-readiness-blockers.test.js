const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const production=fs.readFileSync('supabase-production.js','utf8');
const queue=fs.readFileSync('intake-queue.js','utf8');
const edge=fs.readFileSync('supabase/functions/intake-ai-workup/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260908070000_scope_jobs_to_selected_shop.sql','utf8');

test('selected shop id is sent to the server-scoped jobs RPC',()=>{
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
