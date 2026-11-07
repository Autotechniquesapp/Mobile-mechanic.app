const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function links(intake){
 const dom=new JSDOM('<body></body>',{url:'https://mobile-mechanic.app/',runScripts:'outside-only'}),w=dom.window;
 w.MutationObserver=class{observe(){}};w.setTimeout=()=>0;
 w.eval(fs.readFileSync('youtube-repair.js','utf8'));
 w.document.body.innerHTML=w.MobileMechanicRepairVideos.markup(intake);
 return {dom,w,queries:[...w.document.querySelectorAll('a')].map(a=>new URL(a.href).searchParams.get('search_query'))};
}
test('intake repair links use this vehicle, engine and requested work',()=>{
 const {dom,w,queries}=links({vehicle:{year:2017,make:'Toyota',model:'Highlander',submodel:'LE Plus',engine:'3.5 V6'},customer_states:'Overheating or water pump problem',phone:'928-555-1111',customer_name:'Private Customer'});
 assert.equal(queries.length,2);
 for(const q of queries){assert.ok(q.includes('2017 Toyota Highlander LE Plus 3.5 V6'));assert.ok(q.includes('Overheating or water pump problem'));assert.ok(!q.includes('Private Customer'));assert.ok(!q.includes('928-555'));}
 assert.ok(queries[0].includes('replacement how to'));assert.ok(queries[1].includes('troubleshooting testing'));
 for(const a of w.document.querySelectorAll('a')){assert.equal(new URL(a.href).hostname,'www.youtube.com');assert.equal(a.target,'_blank');assert.ok(a.rel.includes('noopener'));assert.ok(a.textContent.includes('Search YouTube'));}
 dom.window.close();
});
test('saved jobs and incomplete intakes get their own matching searches',()=>{
 for(const row of [{complaint:'Water pump replacement',codes:'P0128'},{customer_states:'Crank no start'},{vehicle:{make:'Ford'}}]){
  const {dom,queries}=links(row);assert.equal(queries.length,2);assert.ok(queries.every(q=>q.includes(row.complaint||row.customer_states||'Ford')));if(row.codes)assert.ok(queries.every(q=>q.includes(row.codes)));dom.window.close();
 }
});
test('repair links escape customer text and omit empty records',()=>{
 const hostile=links({customer_states:'<img src=x onerror=alert(1)> & "pump"'});
 assert.equal(hostile.w.document.querySelector('img'),null);assert.ok(hostile.queries[0].includes('<img src=x onerror=alert(1)>'));hostile.dom.window.close();
 const empty=links({});assert.equal(empty.queries.length,0);empty.dom.window.close();
});
