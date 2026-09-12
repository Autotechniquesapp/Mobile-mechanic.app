const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const production=fs.readFileSync('supabase-production.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260912102500_scope_jobs_to_selected_shop.sql','utf8');

test('workspace preserves a valid selected shop instead of blindly taking the first membership',()=>{
  assert.match(production,/const preferredShopId=currentShopId\(\);/);
  assert.match(production,/memberships\.find\(m=>m\.shop_id===preferredShopId\)\|\|memberships\[0\]/);
  assert.doesNotMatch(production,/eq\('status','active'\)\.limit\(1\)/);
});

test('job reads are scoped to the selected shop on both client and server',()=>{
  assert.match(production,/rpc\('get_my_shop_jobs',\{p_shop_id:sid\}\)/);
  assert.match(migration,/m\.user_id\s*=\s*\(select auth\.uid\(\)\)/);
  assert.match(migration,/m\.shop_id\s*=\s*p_shop_id/);
  assert.match(migration,/j\.shop_id\s*=\s*p_shop_id/);
  assert.match(migration,/revoke execute on function public\.get_my_shop_jobs\(\) from authenticated/);
});

test('technicians do not receive estimate, approval, or labor-hour financial fields from the scoped RPC',()=>{
  assert.match(migration,/to_jsonb\(j\)-'estimate'-'approval'-'estimated_labor_hours'/);
});
