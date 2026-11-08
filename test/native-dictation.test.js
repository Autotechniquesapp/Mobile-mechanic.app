const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup({start=async()=>({text:'Pressure test found a coolant leak'}),available=true}={}){
 const dom=new JSDOM('<body><textarea id="findingText">Existing notes.</textarea><button data-action="voice-findings">Dictate Findings</button></body>',{url:'https://www.mobile-mechanic.app/',runScripts:'outside-only'}),w=dom.window,updates=[];
 w.setTimeout=()=>0;
 w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{shopId:'shop-a',activeJobId:'job-a'},shops:{'shop-a':{jobs:[{id:'job-a',findings:'Existing notes.'}]}}}));
 w.Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>available,registerPlugin:()=>({start})};
 w.MobileMechanicSupabase={from:table=>{const update={table,filters:[]},chain={update(value){update.value=value;updates.push(update);return chain;},eq(key,value){update.filters.push([key,value]);return chain;},select(){return chain;},maybeSingle:async()=>({data:{id:'job-a'},error:null})};return chain;}};
 w.eval(fs.readFileSync('native-dictation.js','utf8'));
 return {dom,w,updates,click:()=>w.document.querySelector('button').click(),flush:()=>new Promise(r=>setImmediate(r))};
}
test('APK dictation fills findings and persists only to the captured shop and job',async()=>{
 const c=setup();c.click();await c.flush();
 assert.equal(c.w.document.querySelector('textarea').value,'Existing notes. Pressure test found a coolant leak');
 assert.equal(c.updates.length,1);assert.deepEqual(c.updates[0].filters,[['shop_id','shop-a'],['id','job-a']]);
 const cache=JSON.parse(c.w.localStorage.getItem('mobile_mechanic_ai_approved_v7'));assert.equal(cache.shops['shop-a'].jobs[0].findings,c.updates[0].value.findings);
 assert.equal(c.w.document.querySelector('button').disabled,false);c.dom.window.close();
});
test('permission denial and cancellation preserve notes and restore the microphone button',async()=>{
 for(const start of [async()=>{throw Error('Microphone access was denied');},async()=>({cancelled:true,text:''})]){
  const c=setup({start});c.click();await c.flush();assert.equal(c.w.document.querySelector('textarea').value,'Existing notes.');assert.equal(c.updates.length,0);assert.equal(c.w.document.querySelector('button').disabled,false);c.dom.window.close();
 }
});
test('changing jobs while Android dictation is open does not write to either job',async()=>{
 let done;const c=setup({start:()=>new Promise(r=>done=r)});c.click();const db=JSON.parse(c.w.localStorage.getItem('mobile_mechanic_ai_approved_v7'));db.session.activeJobId='job-b';c.w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify(db));done({text:'Wrong job text'});await c.flush();assert.equal(c.updates.length,0);assert.equal(c.w.document.querySelector('textarea').value,'Existing notes.');c.dom.window.close();
});
test('older APK explains that the Android microphone update is required',async()=>{
 const c=setup({available:false});c.click();await c.flush();assert.match(c.w.document.querySelector('.toast').textContent,/updated Android app/);assert.equal(c.updates.length,0);c.dom.window.close();
});
test('ordinary browser dictation keeps its existing handler',()=>{
 const c=setup();c.w.Capacitor.isNativePlatform=()=>false;let clicks=0;c.w.document.querySelector('button').onclick=()=>clicks++;c.click();assert.equal(clicks,1);c.dom.window.close();
});
