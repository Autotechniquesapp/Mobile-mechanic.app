(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
let mounting=false;
let currentState=null;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));return {db,shop,job};}
function canSeeFinancials(){const {db,shop}=context(),user=shop?.users?.find(u=>u.id===db.session?.userId);return ['owner','manager','service_writer'].includes(user?.role);}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function money(v){if(v===null||v===undefined||v==='')return '';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function toast(msg,type=''){document.querySelector('.workorder-toast')?.remove();const d=document.createElement('div');d.className=`toast workorder-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3200);}
function labelStatus(v){return ({completed:'Completed',installed:'Installed',in_progress:'In Progress',purchased:'Purchased',needed:'Need / Not Bought',to_do:'To Do',inspect_first:'Inspect First',conditional:'If Needed',waiting:'Waiting',authorized:'Authorized',pending_signature:'Needs Signature'})[v]||String(v||'').replaceAll('_',' ');}
function statusClass(v){return ['completed','installed','authorized'].includes(v)?'green':['in_progress','purchased'].includes(v)?'orange':'red';}
function partOptions(v){const opts=['purchased','in_progress','installed','needed','inspect_first','waiting'];return opts.map(x=>`<option value="${x}" ${x===v?'selected':''}>${labelStatus(x)}</option>`).join('');}
function taskOptions(v){const opts=['to_do','in_progress','completed','waiting','conditional'];return opts.map(x=>`<option value="${x}" ${x===v?'selected':''}>${labelStatus(x)}</option>`).join('');}
function emptyWO(){return {parts:[],work:[],tests:[],authorization:{status:'',note:''}};}

async function load(job){
  let row=null,invoice=null;
  if(sb&&job?.id){
    const [jr,ir]=await Promise.all([
      sb.from('jobs').select('id,customer_states,findings,codes,ai_workup,status').eq('id',job.id).maybeSingle(),
      sb.from('invoices').select('id,status,total,subtotal,tax,payment_processor,processor_metadata,line_items,created_at').eq('job_id',job.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    if(!jr.error)row=jr.data;
    if(!ir.error)invoice=ir.data;
  }
  const wo=structuredClone(row?.ai_workup?.work_order||emptyWO());
  wo.parts=Array.isArray(wo.parts)?wo.parts:[];
  wo.work=Array.isArray(wo.work)?wo.work:[];
  wo.tests=Array.isArray(wo.tests)?wo.tests:[];
  wo.authorization=wo.authorization||{status:'',note:''};
  return {job,row,invoice,wo};
}

function rowMarkup(item,type,index){
  const task=type!=='parts';
  const options=task?taskOptions(item.status):partOptions(item.status);
  const detail=item.note||item.purpose||item.source||'';
  return `<div class="jwo-row"><div class="jwo-main"><b>${esc(item.name)}</b>${detail?`<small>${esc(detail)}</small>`:''}</div>${canSeeFinancials()&&item.price!==null&&item.price!==undefined?`<span class="jwo-price">${money(item.price)}</span>`:''}<select data-jwo-status data-jwo-type="${type}" data-jwo-index="${index}">${options}</select></div>`;
}
function section(title,type,items,button){return `<div class="jwo-section"><div class="jwo-section-head"><h3>${title}</h3><button type="button" class="btn btn-soft jwo-add" data-jwo-add="${type}">+ ${button}</button></div><div class="jwo-list">${items.length?items.map((x,i)=>rowMarkup(x,type,i)).join(''):`<div class="jwo-empty">Nothing entered yet.</div>`}</div></div>`;}
function financialMarkup(invoice,wo){
  if(!invoice)return `<div class="jwo-fin"><b>Invoice / Payment</b><span>No invoice attached yet.</span></div>`;
  const paid=Number(invoice.processor_metadata?.total_paid||0),total=Number(invoice.total||0),remaining=Math.max(0,total-paid);
  const invNo=invoice.processor_metadata?.square_invoice_number?`#${esc(invoice.processor_metadata.square_invoice_number)}`:'';
  const processor=String(invoice.payment_processor||'').toLowerCase()==='square'?'Square':esc(invoice.payment_processor||'Payment');
  const auth=wo.authorization?.status?` • Added work: ${labelStatus(wo.authorization.status)}`:'';
  return `<div class="jwo-fin"><div><b>${processor} Invoice ${invNo}</b><span>${money(total)} total • ${money(paid)} paid • <strong>${money(remaining)} remaining</strong>${esc(auth)}</span></div></div>`;
}
function markup(state){const {job,row,invoice,wo}=state;const complaint=row?.customer_states||job?.complaint||'';const codes=row?.codes||job?.codes||'';return `<section class="jwo" data-job-work-order>
  <div class="jwo-top"><div><div class="eyebrow">LIVE REPAIR WORK ORDER</div><h2>Repair Breakdown</h2></div><span class="badge ${statusClass(job?.status==='Completed'?'completed':'in_progress')}">${esc(job?.status||'Job')}</span></div>
  <div class="jwo-complaint"><b>Original Complaint</b><p>${esc(complaint||'No complaint entered.')}</p>${codes?`<small><b>Codes / scan notes:</b> ${esc(codes)}</small>`:''}</div>
  ${section('Parts Bought / Needed','parts',wo.parts,'Part')}
  ${section('Work Being Done / Completed','work',wo.work,'Work Item')}
  ${section('Tests / Checks','tests',wo.tests,'Test')}
  ${canSeeFinancials()?financialMarkup(invoice,wo):''}
  ${wo.authorization?.note?`<div class="jwo-auth"><b>Authorization:</b> ${esc(wo.authorization.note)}</div>`:''}
</section>`;}

function css(){if(document.getElementById('job-work-order-style'))return;const s=document.createElement('style');s.id='job-work-order-style';s.textContent=`
.jwo{background:#10151b;border:1px solid #63262b;border-radius:15px;padding:14px;margin:10px 0 12px;box-shadow:0 0 18px rgba(239,42,49,.08)}
.jwo-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.jwo-top h2{font-size:18px;margin:2px 0}.jwo-complaint{background:#0a0e13;border:1px solid #303841;border-radius:10px;padding:11px;margin-bottom:10px}.jwo-complaint p{margin:5px 0 3px;line-height:1.35}.jwo-complaint small{display:block;color:#aeb6c0;margin-top:7px}.jwo-section{border-top:1px solid #2c343d;padding-top:10px;margin-top:10px}.jwo-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.jwo-section-head h3{font-size:13px;margin:0;text-transform:uppercase;letter-spacing:.04em}.jwo-add{padding:4px 8px!important;min-height:28px!important;font-size:11px!important}.jwo-list{display:grid;gap:6px}.jwo-row{display:grid;grid-template-columns:minmax(0,1fr) auto 118px;gap:8px;align-items:center;background:#0a0e13;border:1px solid #28313a;border-radius:9px;padding:8px 9px}.jwo-main{min-width:0}.jwo-main b{display:block;font-size:12px}.jwo-main small{display:block;color:#8e99a5;font-size:10px;margin-top:3px;line-height:1.25}.jwo-price{font-size:11px;font-weight:700}.jwo-row select{background:#111820;color:#f4f6f8;border:1px solid #39434d;border-radius:7px;padding:6px;font-size:10px;max-width:118px}.jwo-empty{font-size:11px;color:#8e99a5;padding:8px}.jwo-fin{margin-top:11px;background:#0a0e13;border:1px solid #34404a;border-radius:10px;padding:10px}.jwo-fin b,.jwo-fin span{display:block}.jwo-fin span{font-size:11px;color:#c5cbd2;margin-top:3px}.jwo-auth{font-size:11px;margin-top:8px;color:#c8ced5}.jwo-ai-wrap{margin-top:9px;border:1px solid #303841;border-radius:11px;background:#0b0f14}.jwo-ai-wrap>summary{cursor:pointer;padding:10px 12px;font-size:12px;font-weight:700}.jwo-ai-wrap>.work-white{margin:0!important;border:0!important;border-top:1px solid #303841!important;border-radius:0 0 11px 11px!important}
@media(max-width:620px){.jwo{padding:11px}.jwo-row{grid-template-columns:minmax(0,1fr) 108px}.jwo-price{grid-column:1}.jwo-row select{grid-column:2;grid-row:1 / span 2}.jwo-top h2{font-size:16px}}
`;document.head.appendChild(s);}

function simplifyLegacyUI(){
  document.querySelectorAll('.work-card').forEach(card=>{
    const h=(card.querySelector('h3')?.textContent||'').trim();
    if(/Good\s*\/\s*Better\s*\/\s*Best/i.test(h)||/^Repair Videos\b/i.test(h))card.style.display='none';
  });
  document.querySelectorAll('[data-action="use-quote-example"]').forEach(b=>{
    if(/Good,? Better,? and Best/i.test(b.dataset.example||b.textContent||''))b.remove();
  });
  const choiceHeading=[...document.querySelectorAll('.customer-card h3')].find(h=>/Choose Your Repair Option/i.test(h.textContent||''));
  if(choiceHeading){
    choiceHeading.textContent='Repair Estimate';
    const card=choiceHeading.closest('.customer-card');
    card?.querySelectorAll('.estimate-card').forEach(ec=>{ec.style.display=ec.classList.contains('best')?'block':'none';});
    const best=card?.querySelector('.estimate-card.best');
    if(best){
      const radio=best.querySelector('input[name="customerOption"]');if(radio)radio.checked=true;
      const title=best.querySelector('b');if(title)title.textContent='Repair Breakdown';
    }
    const alert=card?.querySelector('.customer-alert');if(alert)alert.textContent='This authorization covers the repair work listed above. If the price or scope changes, the shop will send a revised authorization.';
    const approveLabel=[...document.querySelectorAll('.customer-card b')].find(b=>/I approve the selected repair option/i.test(b.textContent||''));if(approveLabel)approveLabel.textContent='I approve the repair work listed above';
    const approveHelp=approveLabel?.parentElement?.querySelector('p');if(approveHelp)approveHelp.textContent='I authorize the listed repair scope and amount shown above.';
    const approveBtn=document.querySelector('[data-action="approve-estimate"]');if(approveBtn)approveBtn.innerHTML='✓ Approve Repair';
    const declineBtn=document.querySelector('[data-action="decline-estimate"]');if(declineBtn)declineBtn.textContent='Decline / Contact Shop';
  }
}

async function save(){
  if(!sb||!currentState?.job?.id)return;
  try{
    const {data,error}=await sb.from('jobs').select('ai_workup').eq('id',currentState.job.id).single();if(error)throw error;
    const ai={...(data?.ai_workup||{}),work_order:{...currentState.wo,updated_at:new Date().toISOString()}};
    const r=await sb.from('jobs').update({ai_workup:ai,updated_at:new Date().toISOString()}).eq('id',currentState.job.id);if(r.error)throw r.error;
    toast('Work order updated.','good');
  }catch(err){toast(err?.message||'Could not save work order.','bad');}
}
function rerender(){const old=document.querySelector('[data-job-work-order]');if(!old||!currentState)return;old.outerHTML=markup(currentState);simplifyLegacyUI();}
function add(type){
  if(!currentState)return;
  const labels={parts:'part',work:'work item',tests:'test / check'};const name=prompt(`Add ${labels[type]||'item'}:`);if(!name?.trim())return;
  if(type==='parts')currentState.wo.parts.push({name:name.trim(),status:'needed',price:null,source:''});
  else currentState.wo[type].push({name:name.trim(),status:'to_do'});
  rerender();save();
}
function bindGlobal(){
  document.addEventListener('change',e=>{const el=e.target.closest?.('[data-jwo-status]');if(!el||!currentState)return;const type=el.dataset.jwoType,i=Number(el.dataset.jwoIndex);if(!currentState.wo[type]?.[i])return;currentState.wo[type][i].status=el.value;save();},true);
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-jwo-add]');if(!b)return;e.preventDefault();add(b.dataset.jwoAdd);},true);
}
async function mount(){
  simplifyLegacyUI();
  if(mounting||document.querySelector('[data-job-work-order]'))return;
  const {db,job}=context();if(db.session?.role!=='shop'||!job)return;
  const title=document.querySelector('.page-title h2');if(!title||!/^AI Pre-Workup$/i.test(title.textContent.trim()))return;
  mounting=true;try{
    css();currentState=await load(job);
    title.textContent='Job Work Order';const sub=title.parentElement?.querySelector('p');if(sub)sub.textContent='One repair breakdown: parts, work performed, current progress, tests, authorization, and payment status.';
    const banner=document.querySelector('.job-banner');if(!banner)return;
    banner.insertAdjacentHTML('afterend',markup(currentState));
    simplifyLegacyUI();
    const ww=document.querySelector('.work-white');if(ww&&!ww.closest('.jwo-ai-wrap')){const d=document.createElement('details');d.className='jwo-ai-wrap';d.innerHTML='<summary>AI / Diagnostic Tools</summary>';ww.parentNode.insertBefore(d,ww);d.appendChild(ww);}
  }catch(err){console.error('work order mount',err);}finally{mounting=false;}
}
bindGlobal();
new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{currentState=null;setTimeout(mount,100);});
setTimeout(mount,900);
})();
