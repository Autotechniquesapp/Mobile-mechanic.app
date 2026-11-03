const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto,generateKeyPairSync}=require('node:crypto');

function backend({authenticated=true,member=true,configured=true}={}){
  const tables={shop_members:member?[{shop_id:'shop',user_id:'user',status:'active'}]:[],native_push_tokens:[],push_subscriptions:[],push_vapid_config:[{singleton:true,public_key:'public-only',private_key:'never-return'}],intake_submissions:[{id:'intake',shop_id:'shop',customer_name:'Customer',vehicle:{},created_at:new Date().toISOString(),status:'new',push_notified_at:null}]};
  let handler;const deliveries=[];
  const admin={rpc:async()=>({data:'internal'}),from(table){let filters=[],op='select',value,count=false;
    const q={select(_cols,options){count=!!options?.head;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v);},limit(){return q;},update(v){op='update';value=v;return q;},upsert(v){op='upsert';value=v;return q;},maybeSingle(){return run(true);},single(){return run(true);},then(a,b){return run(false).then(a,b);}};
    async function run(single){let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(op==='update')rows.forEach(r=>Object.assign(r,value));if(op==='upsert'){const old=tables[table].find(r=>r.token===value.token);if(old)Object.assign(old,value);else tables[table].push({...value});rows=[old||tables[table].at(-1)];}return {data:structuredClone(single?rows[0]||null:rows),count:count?rows.length:null,error:null};}return q;}};
  const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-notifications/index.ts','utf8').replace(/^import .*;\n/gm,''));
  vm.runInNewContext(source,{Response,Request,Set,console,createClient:(_u,_k,o)=>o?.global?{auth:{getUser:async()=>({data:{user:authenticated?{id:'user'}:null}})}}:admin,webpush:{},nativePushConfigured:()=>configured,nativePushConfigurationStatus:()=>configured?'configured':'missing',sendNativeIntakePush:async(args)=>{deliveries.push(args);return {sent:args.tokens.length,invalid:[]};},Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn}});
  return {tables,deliveries,run:(body,internal=false)=>handler(new Request('https://example.test',{method:'POST',headers:internal?{'x-intake-internal-token':'internal'}:{Authorization:'Bearer user'},body:JSON.stringify(body)}))};
}
const subscription={action:'native_subscribe',shop_id:'shop',token:'a-device-token-longer-than-twenty'};
test('native subscriptions require sign-in, active shop membership, and configured Firebase',async()=>{
  for(const [options,status] of [[{authenticated:false},401],[{member:false},403],[{configured:false},503]]){const s=backend(options);assert.equal((await s.run(subscription)).status,status);assert.equal(s.tables.native_push_tokens.length,0);}
});
test('repeated native registration reuses one token; unsubscribe is user-scoped',async()=>{
  const s=backend();assert.equal((await s.run(subscription)).status,200);await s.run(subscription);assert.equal(s.tables.native_push_tokens.length,1);
  s.tables.native_push_tokens.push({token:'someone-elses-device-token',user_id:'other',active:true});
  await s.run({action:'native_unsubscribe',token:'someone-elses-device-token'});assert.equal(s.tables.native_push_tokens[1].active,true);
  await s.run({action:'native_unsubscribe',token:subscription.token});assert.equal(s.tables.native_push_tokens[0].active,false);
});
test('native delivery excludes removed members and other shops',async()=>{
  const s=backend();s.tables.native_push_tokens.push({token:'active',shop_id:'shop',user_id:'user',active:true},{token:'removed',shop_id:'shop',user_id:'removed',active:true},{token:'foreign',shop_id:'other',user_id:'user',active:true});
  const r=await s.run({action:'notify_intake',intake_id:'intake'},true);assert.equal(r.status,200);assert.deepEqual(Array.from(s.deliveries[0].tokens),['active']);
});
test('native-only delivery works without any Chrome subscriptions and duplicate intake is skipped',async()=>{
  const s=backend();await s.run(subscription);const first=await (await s.run({action:'notify_intake',intake_id:'intake'},true)).json();assert.equal(first.sent,1);
  const again=await (await s.run({action:'notify_intake',intake_id:'intake'},true)).json();assert.equal(again.skipped,'already_notified');assert.equal(s.deliveries.length,1);
});
test('public readiness reports only a boolean and the existing public web-push key',async()=>{
  const s=backend();const data=await (await s.run({action:'public_key'})).json();assert.deepEqual(data,{ok:true,public_key:'public-only',native_configured:true,native_configuration_status:'configured'});assert.ok(!JSON.stringify(data).includes('never-return'));
});
test('configuration diagnostics distinguish missing, wrong, quoted, and incomplete files without returning values',()=>{
  const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-notifications/native-fcm.ts','utf8').replace(/^export /gm,''));
  for(const [value,expected] of [[undefined,'missing'],['filename.json','invalid_json'],[JSON.stringify({project_info:{project_id:'test'}}),'android_client_file'],[JSON.stringify('{}'),'quoted_json'],['{}','missing_service_account_fields'],[JSON.stringify({project_id:'test',client_email:'test@example.test',private_key:'secret-not-returned'}),'configured']]){
    const sandbox={Deno:{env:{get:()=>value}}};vm.runInNewContext(source+'\nglobalThis.status=nativePushConfigurationStatus;',sandbox);assert.equal(sandbox.status(),expected);
  }
});
test('FCM sends to the job channel; generic 404 preserves tokens; UNREGISTERED removes only expired tokens',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-notifications/native-fcm.ts','utf8').replace(/^export /gm,''));
  const requests=[];const sandbox={TextEncoder,Uint8Array,URLSearchParams,Response,btoa,atob,crypto:webcrypto,console:{error(){}},Deno:{env:{get:()=>JSON.stringify({project_id:'test',client_email:'test@example.test',private_key:privateKey})}},fetch:async(url,init)=>{
    if(url.includes('oauth2'))return Response.json({access_token:'test-bearer',expires_in:3600});
    const body=JSON.parse(init.body);requests.push(body);
    if(body.message.token==='expired')return Response.json({error:{details:[{errorCode:'UNREGISTERED'}]}},{status:404});
    if(body.message.token==='generic404')return Response.json({error:{status:'NOT_FOUND'}},{status:404});
    return Response.json({name:'accepted'});
  }};
  vm.runInNewContext(source+'\nglobalThis.send=sendNativeIntakePush;',sandbox);
  const result=await sandbox.send({tokens:['healthy','expired','generic404'],intakeId:'i',customer:'Customer',vehicle:'Truck',pendingCount:2});
  assert.equal(result.sent,1);assert.deepEqual(Array.from(result.invalid),['expired']);assert.equal(requests[0].message.android.notification.channel_id,'new_customer_jobs_v1');assert.equal(requests[0].message.android.notification.notification_count,2);
});

test('mobile PEM line breaks are repaired narrowly and used for signing',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-notifications/native-fcm.ts','utf8').replace(/^export /gm,''));
  const correct=JSON.stringify({project_id:'test',client_email:'test@example.test',private_key:privateKey});
  const copied=correct.replace(/\\n/g,'\n');
  const sandbox={TextEncoder,Uint8Array,URLSearchParams,Response,btoa,atob,crypto:webcrypto,console:{error(){}},Deno:{env:{get:()=>copied}},fetch:async(url)=>url.includes('oauth2')?Response.json({access_token:'test',expires_in:3600}):Response.json({name:'accepted'})};
  vm.runInNewContext(source+'\nglobalThis.status=nativePushConfigurationStatus;globalThis.send=sendNativeIntakePush;',sandbox);
  assert.equal(sandbox.status(),'configured');
  assert.equal((await sandbox.send({tokens:['device'],intakeId:'i',customer:'Test',vehicle:'',pendingCount:1})).sent,1);
  sandbox.Deno.env.get=()=>copied.replace('test@example.test','bad\nemail');
  assert.notEqual(sandbox.status(),'configured');
});
