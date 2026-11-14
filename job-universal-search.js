(() => {
'use strict';
const KEY='mobile_mechanic_ai_approved_v7';
const root=document.getElementById('app');
if(!root||location.pathname.startsWith('/intake/')||new URLSearchParams(location.search).has('intake')||new URLSearchParams(location.search).has('estimate'))return;
const css=document.createElement('style');
css.textContent='.mma-find-launch{background:#272024;color:#fff;border:1px solid #e13e46;border-radius:9px;padding:10px 13px;cursor:pointer;font-weight:700}.mma-find-layer{position:fixed;inset:0;z-index:99990;overflow:auto;background:#000c;padding:12px}.mma-find-panel{margin:2vh auto;width:min(100%,650px);box-sizing:border-box;border:1px solid #e13e46;border-radius:13px;background:#131820;padding:15px;color:white}.mma-find-head{display:flex;justify-content:space-between;align-items:center}.mma-find-head h2{font-size:21px;margin:0}.mma-find-close{background:#252d36;border:1px solid #67717b;border-radius:8px;color:white;padding:9px 15px;font-size:22px;cursor:pointer}.mma-find-input{width:100%;box-sizing:border-box;padding:13px;margin:15px 0 7px;border-radius:8px;border:1px solid #7c8995;color:white;background:#090e14;font:inherit}.mma-find-list{display:grid;gap:8px;margin-top:12px}.mma-find-result{width:100%;text-align:left;border-radius:9px;padding:12px;border:1px solid #46525d;background:#202934;color:white;font:inherit;cursor:pointer}.mma-find-result strong,.mma-find-result span,.mma-find-result small{display:block}.mma-find-result span{font-size:13px;color:#c9d3dc;margin-top:3px}.mma-find-result small{font-size:12px;color:#ff939e;margin-top:4px}.mma-find-info{font-size:13px;color:#b9c2cd}.mma-find-result:focus-visible,.mma-find-input:focus-visible{outline:2px solid #ed4850;outline-offset:2px}@media(max-width:480px){.topbar .mma-find-launch{padding:8px}.mma-find-panel{margin:0;padding:12px}}';
document.head.append(css);
let layer=null,results=[],loadedShop='',busy=false,pending=false;
function ctx(){try{const db=JSON.parse(localStorage.getItem(KEY)||'{}');return db.session?.role==='shop'&&db.shops?.[db.session.shopId]?{id:db.session.shopId,shop:db.shops[db.session.shopId]}:null;}catch{return null;}}
function compact(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;}
function text(j,invoiceTerms=[]){const v=j.vehicle||{};return [j.customerName,j.phone,j.email,j.complaint,j.status,j.codes,j.findings,j.scheduleNotes,j.location,j.id,j.createdAt,v.year,v.make,v.model,v.trim,v.engine,v.vin,v.plate,v.license_plate,v.mileage,...invoiceTerms].filter(x=>x!==null&&x!==undefined).join(' ').toLowerCase();}
function jobResult(j,notes){const v=j.vehicle||{};return {id:String(j.id),kind:'job',title:j.customerName||'Customer',description:[v.year,v.make,v.model,v.engine].filter(Boolean).join(' ')||'Vehicle not recorded',status:j.status||'Job',date:j.createdAt||'',index:text(j,notes)};}
function cached(){return (ctx()?.shop.jobs||[]).map(j=>jobResult(j));}
function searchable(h,q){return q.trim().toLowerCase().split(/\s+/).every(word=>h.includes(word)||compact(h).includes(compact(word)));}
function render(){
if(!layer)return;
const q=layer.querySelector('[data-mma-find-input]').value.trim();
const list=layer.querySelector('[data-mma-find-list]');list.replaceChildren();
const matches=results.filter(r=>searchable(r.index,q)).slice(0,100);
layer.querySelector('[data-mma-find-count]').textContent=(q?'Matching records':'Jobs and customer intakes')+' · '+matches.length+(matches.length===100?' shown':'');
if(!matches.length){list.append(el('p','mma-find-info','No matching jobs or intakes.'));return;}
for(const item of matches){const b=el('button','mma-find-result');b.type='button';b.dataset.mmaFindId=item.id;b.dataset.mmaFindKind=item.kind;b.append(el('strong','',item.title),el('span','',item.description),el('small','',item.status+(item.date?' · '+new Date(item.date).toLocaleDateString():'')));list.append(b);}
}
async function refresh(){
const w=ctx(),sb=window.MobileMechanicSupabase;if(!w||!sb||busy)return;
busy=true;const sid=w.id;
try{
const [jr,cr,vr,ir,inv]=await Promise.all([
sb.rpc('get_my_shop_jobs',{p_shop_id:sid}),
sb.from('customers').select('id,name,phone,email').eq('shop_id',sid),
sb.from('vehicles').select('id,year,make,model,submodel,engine,vin,license_plate,mileage,drivetrain').eq('shop_id',sid),
sb.from('intake_submissions').select('id,customer_name,phone,email,vehicle,customer_states,status,converted_job_id,created_at').eq('shop_id',sid).order('created_at',{ascending:false}).limit(1000),
sb.from('invoices').select('job_id,line_items').eq('shop_id',sid).limit(1000)
]);
if(ctx()?.id!==sid)return;
if(jr.error)throw jr.error;
const cm=new Map((cr.data||[]).map(x=>[String(x.id),x])),vm=new Map((vr.data||[]).map(x=>[String(x.id),x])),notes=new Map();
for(const row of inv.data||[]){const a=notes.get(String(row.job_id))||[];for(const line of row.line_items||[])a.push(line.description||'');notes.set(String(row.job_id),a);}
const fromDb=(jr.data||[]).map(j=>{const c=cm.get(String(j.customer_id))||{},v=vm.get(String(j.vehicle_id))||{};return jobResult({id:j.id,customerName:c.name,phone:c.phone,email:c.email,vehicle:{...v,trim:v.submodel,plate:v.license_plate},complaint:j.customer_states,status:j.status,findings:j.findings,codes:j.codes,scheduleNotes:j.schedule_notes,location:j.current_location?.raw,createdAt:j.created_at},notes.get(String(j.id)));});
const jobIds=new Set(fromDb.map(x=>x.id));
for(const item of cached())if(!jobIds.has(item.id))fromDb.push(item);
const intakes=(ir.data||[]).filter(i=>!i.converted_job_id||!jobIds.has(String(i.converted_job_id))).map(i=>{const v=i.vehicle||{};return {id:String(i.id),kind:'intake',title:i.customer_name||'Customer',description:[v.year,v.make,v.model,v.engine].filter(Boolean).join(' ')||'Intake',status:i.status||'New intake',date:i.created_at||'',index:[i.customer_name,i.phone,i.email,i.customer_states,i.status,i.id,v.year,v.make,v.model,v.submodel,v.engine,v.vin,v.license_plate,v.mileage].filter(Boolean).join(' ').toLowerCase()};});
results=[...fromDb,...intakes].sort((a,b)=>String(b.date).localeCompare(String(a.date)));loadedShop=sid;render();
}catch(e){console.warn('Job search live lookup failed; showing saved jobs',e);if(ctx()?.id===sid){results=cached();render();}}
finally{busy=false;}
}
function close(){layer?.remove();layer=null;}
function open(){
const w=ctx();if(!w)return;close();if(loadedShop!==w.id)results=cached();
layer=el('div','mma-find-layer');layer.dataset.mmaFindLayer='1';
const panel=el('section','mma-find-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Find any job or intake');
const head=el('div','mma-find-head');const exit=el('button','mma-find-close','×');exit.type='button';exit.dataset.mmaFindClose='1';head.append(el('h2','','Find Any Job'),exit);
const input=el('input','mma-find-input');input.type='search';input.dataset.mmaFindInput='1';input.placeholder='Name, vehicle, VIN, repair, code, phone…';input.setAttribute('aria-label','Search all customer jobs and intakes');input.autocomplete='off';
const info=el('p','mma-find-info','Search active, unscheduled, completed and declined jobs, plus intakes.');const count=el('p','mma-find-info');count.dataset.mmaFindCount='1';
const list=el('div','mma-find-list');list.dataset.mmaFindList='1';
panel.append(head,input,info,count,list);layer.append(panel);document.body.append(layer);input.addEventListener('input',render);render();input.focus();refresh();
}
function openResult(result){
close();const b=el('button');b.hidden=true;b.type='button';
if(result.dataset.mmaFindKind==='job'){b.dataset.openJob=result.dataset.mmaFindId;b.dataset.mmaNativeOpen='1';}
else b.dataset.recordSubmission=result.dataset.mmaFindId;
document.body.append(b);b.click();b.remove();
}
document.addEventListener('click',event=>{
const start=event.target.closest?.('[data-mma-find-launch]');if(start){event.preventDefault();open();return;}
if(event.target.closest?.('[data-mma-find-close]')||(layer&&event.target===layer)){event.preventDefault();close();return;}
const result=event.target.closest?.('[data-mma-find-id]');if(result){event.preventDefault();openResult(result);}
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&layer){e.preventDefault();close();}},true);
function mount(){
if(!ctx()||!root.querySelector('.shell'))return;
const anchor=root.querySelector('.topbar .top-spacer');if(anchor&&!root.querySelector('.topbar [data-mma-find-launch]')){const b=el('button','mma-find-launch','Search Jobs');b.type='button';b.dataset.mmaFindLaunch='1';anchor.insertAdjacentElement('afterend',b);}
const board=root.querySelector('.ops-board-actions');if(board&&!root.querySelector('.ops-board-actions [data-mma-find-launch]')){const b=el('button','mma-find-launch','Find Any Job');b.type='button';b.dataset.mmaFindLaunch='1';board.append(b);}
}
new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;mount();});}).observe(root,{subtree:true,childList:true});
window.addEventListener('mobile-mechanic-jobs-updated',()=>{loadedShop='';if(layer)refresh();});
mount();
})();