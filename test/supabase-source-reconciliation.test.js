const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const slugs=[
  'ai-credit-billing','ai-quote','calendar-sync','dropbox-oauth',
  'integration-actions','message-delivery','plate-lookup','platform-costs',
  'shop-payment','sms-send','square-oauth','stripe-connect',
  'stripe-shop-invoice','stripe-webhook','technician-help','vehicle-data'
];
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('all recovered production Edge Functions are tracked and syntax-checked',()=>{
  for(const slug of slugs){
    const path=`supabase/functions/${slug}/index.ts`;
    assert.ok(fs.existsSync(path),`missing recovered function: ${slug}`);
    assert.match(pkg.scripts.check,new RegExp(`supabase/functions/${slug.replace(/[.*+?^$\{\}()|[\\]\\]/g,'\\$&')}/index\\.ts`));
  }
});
