const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const production=fs.readFileSync('supabase-production.js','utf8');

test('workspace refresh preserves the active job when it still belongs to the selected shop',()=>{
  assert.match(production,/const prior=readCache\(\)/);
  assert.match(production,/prior\.session\?\.shopId===s\.id\?prior\.session\?\.activeJobId:null/);
  assert.match(production,/uiJobs\.some\(j=>String\(j\.id\)===String\(priorActiveJobId\)\)\?priorActiveJobId/);
  assert.match(production,/activeJobId\};/);
});

test('workspace falls back to a valid current-shop job when the old active job is gone',()=>{
  assert.match(production,/\(uiJobs\[0\]\?\.id\|\|null\)/);
  assert.doesNotMatch(production,/activeJobId:uiJobs\[0\]\?\.id\|\|null/);
});

test('scheduled database status remains Scheduled after a production workspace reload',()=>{
  assert.match(production,/scheduled:'Scheduled'/);
  assert.match(production,/status:'scheduled'/);
});
