(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
let mounting=false;
let currentState=null;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));return {db,shop,job};}
function canSeeFinancials(){const {db,shop}=context(),user=shop?.users?.find(u=>u.id===db.session?.userId);return ['owner','manager','service_writer'].includes(user?.role);}
/*
 * Customer-facing money (the invoice, what was paid, what is owed) stays behind
 * canSeeFinancials. Work order line money is different: the mechanic on the job
 * is the person who knows what the part cost at the counter and how long the
 * job actually took, so they can enter and see cost, hours, and line amounts.
 * Shop-side session only — this module never mounts for a customer.
 */
function canEditWorkOrderMoney(){const {db,shop}=context();if(db.session?.role!=='shop'||!shop)return false;return Boolean(shop.users?.find(u=>u.id===db.session?.userId)?.active!==false);}
function pricing(){const {shop}=context();const p=window.MobileMechanicPricing;return p?p.shopPricing(shop):{laborRate:75,partsMarkup:25,taxRate:0,travelFee:0};}
/* Who is signing. An attestation with no named user is worthless, so the UI
 * refuses to record one when the session cannot identify the person. */
function currentUser(){const {db,shop}=context();const id=db.session?.userId;if(!id)return null;const u=shop?.users?.find(x=>x.id===id);return {id,name:u?.name||db.session?.name||null,role:u?.role||null};}
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
  let wo=structuredClone(row?.ai_workup?.work_order||emptyWO());
  wo.parts=Array.isArray(wo.parts)?wo.parts:[];
  wo.work=Array.isArray(wo.work)?wo.work:[];
  wo.tests=Array.isArray(wo.tests)?wo.tests:[];
  wo.authorization=wo.authorization||{status:'',note:''};
  /*
   * The intake AI workup used to stop at the intake queue: the job's work order
   * always opened blank and the mechanic retyped the parts, checks, and labor
   * operations the AI had already produced. Seed the first render from it, but
   * only while the mechanic has not entered anything, so a saved work order is
   * never overwritten. Every seeded row is unpriced and unconfirmed.
   */
  const api=window.MobileMechanicParts;
  if(api?.isEmptyWorkOrder?.(wo)&&api.hasDiagnosis?.(row?.ai_workup)){
    const seeded=api.seedWorkOrder(row.ai_workup);
    if(seeded.seeded_from_ai){wo=seeded;wo.authorization={status:'',note:''};}
  }
  /*
   * Carry any AI hour/price guesses onto the lines as estimates. Safe to run on
   * a saved work order too: applyAiEstimates never touches a typed or attested
   * value, it only fills `line.estimate`.
   */
  const p=window.MobileMechanicPricing;
  if(p&&row?.ai_workup)wo=p.applyAiEstimates(wo,row.ai_workup);
  return {job,row,invoice,wo};
}

/*
 * An AI guess and a real number are never the same control. The estimate shows
 * as a muted chip beside the input; typing a real value takes over the line's
 * amount while the chip stays visible so the mechanic can see what was guessed.
 */
function estimateChip(line,kind){
  const p=window.MobileMechanicPricing;if(!p)return '';
  const guess=kind==='hours'?line.estimate?.hours:line.estimate?.price;
  if(guess===null||guess===undefined)return '';
  const real=kind==='hours'?line.hours:(line.price??line.cost);
  const live=real===null||real===undefined||real==='';
  const shown=kind==='hours'?p.formatHours(guess):p.formatMoney(guess);
  return `<span class="jwo-est ${live?'live':'beaten'}" title="${live?'Unconfirmed AI estimate. Check it yourself before quoting.':'AI estimated '+esc(shown)+'. Your entry is being used instead.'}">AI est. ${esc(shown)}</span>`;
}
function moneyCell(item,type,index){
  const p=window.MobileMechanicPricing;
  if(!p||!canEditWorkOrderMoney())return canSeeFinancials()&&item.price!==null&&item.price!==undefined?`<span class="jwo-price">${money(item.price)}</span>`:'';
  const rates=pricing();
  if(type==='parts'){
    const r=p.partAmount(item,rates);
    const entered=item.cost??item.price??'';
    const basis=r.basis==='marked_up'?`+${rates.partsMarkup}% markup`:r.basis==='price'?'price as entered':r.basis==='estimated'?'AI guess — not checked':'';
    return `<span class="jwo-money"><label class="jwo-inp"><span>Cost</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${esc(entered)}" data-jwo-cost data-jwo-index="${index}" placeholder="—"></label><span class="jwo-amt ${r.estimated?'est':''}">${esc(p.formatMoney(r.amount)||'—')}</span>${basis?`<small>${esc(basis)}</small>`:''}${estimateChip(item,'price')}${attestControl(item,'parts',index,r)}</span>`;
  }
  const r=p.laborAmount(item,rates);
  return `<span class="jwo-money"><label class="jwo-inp"><span>Hours</span><input type="number" min="0" step="0.1" inputmode="decimal" value="${esc(item.hours??'')}" data-jwo-hours data-jwo-index="${index}" placeholder="—"></label><span class="jwo-amt ${r.estimated?'est':''}">${esc(p.formatMoney(r.amount)||'—')}</span><small>@ ${esc(p.formatMoney(r.rate))}/hr</small>${estimateChip(item,'hours')}${attestControl(item,'work',index,r)}</span>`;
}
/*
 * The attestation control. A line with a real number but no signature shows an
 * amber "Not checked — sign off" button; a signed line shows who signed, when,
 * and against what source. Lines carrying only an AI guess cannot be signed at
 * all — you sign for a number you verified, not for the model's opinion.
 */
function attestControl(item,kind,index,r){
  const p=window.MobileMechanicPricing;
  if(!p||r.amount===null)return '';
  if(r.estimated)return `<span class="jwo-attest none">Enter a real ${kind==='parts'?'cost':'time'} to sign off</span>`;
  const a=p.attestationOf(item,kind==='parts'?'parts':'labor');
  if(a){
    const when=(()=>{try{return new Date(a.at).toLocaleDateString();}catch{return '';}})();
    return `<span class="jwo-attest ok" title="Checklist ${esc(a.checklist_version)} — source: ${esc(a.source)}">✓ Checked by ${esc(a.by_name||'technician')}${when?` · ${esc(when)}`:''} · ${esc(a.source)}<button type="button" class="jwo-relink" data-jwo-attest="${kind}" data-jwo-index="${index}">Redo</button></span>`;
  }
  return `<button type="button" class="jwo-attest pending" data-jwo-attest="${kind}" data-jwo-index="${index}">⚠ Not checked — sign off</button>`;
}
function rowMarkup(item,type,index){
  const task=type!=='parts';
  const options=task?taskOptions(item.status):partOptions(item.status);
  const detail=item.note||item.purpose||item.source||'';
  const cell=type==='tests'?'':moneyCell(item,type,index);
  return `<div class="jwo-row${cell?' jwo-row-money':''}"><div class="jwo-main"><b>${esc(item.name)}</b>${detail?`<small>${esc(detail)}</small>`:''}</div>${cell}<select data-jwo-status data-jwo-type="${type}" data-jwo-index="${index}">${options}</select></div>`;
}
/*
 * Two totals, never one. Confirmed is what may be quoted to a customer;
 * projected includes unconfirmed AI estimates and is a planning figure only.
 * The disclaimer is quoted from section 2 of terms.html rather than reworded.
 */
function totalsMarkup(wo){
  const p=window.MobileMechanicPricing;
  if(!p||!canEditWorkOrderMoney())return '';
  const t=p.totals(wo,pricing());
  if(t.counts.enteredLines===0&&t.counts.estimatedLines===0)return '';
  const line=(label,v,cls='')=>`<div class="jwo-total-row ${cls}"><span>${label}</span><b>${esc(v||'—')}</b></div>`;
  const a=t.attested,j=t.projected;
  const showProjected=j.total!==null&&j.total!==a.total;
  return `<div class="jwo-totals" data-jwo-totals>
    <div class="jwo-total-col ok">
      <div class="jwo-total-head">Checked &amp; signed — safe to quote</div>
      ${line('Parts',p.formatMoney(a.parts))}
      ${line('Labor'+(a.hours?` (${p.formatHours(a.hours)})`:''),p.formatMoney(a.labor))}
      ${a.tax?line('Tax',p.formatMoney(a.tax)):''}
      ${a.travel?line('Travel',p.formatMoney(a.travel)):''}
      ${line('Total',p.formatMoney(a.total),'grand')}
      <small>${a.total===null?'Nothing signed off yet — there is no quotable total.':'Every line here is signed for by a named technician.'}</small>
    </div>
    ${showProjected?`<div class="jwo-total-col est">
      <div class="jwo-total-head">Working figure — not quotable</div>
      ${line('Parts',p.formatMoney(j.parts))}
      ${line('Labor'+(j.hours?` (${p.formatHours(j.hours)})`:''),p.formatMoney(j.labor))}
      ${line('Total',p.formatMoney(j.total),'grand')}
      <small>${[t.counts.pendingLines?`${t.counts.pendingLines} line${t.counts.pendingLines===1?'':'s'} not signed off`:'',t.counts.estimatedLines?`${t.counts.estimatedLines} still on an AI estimate`:''].filter(Boolean).join(', ')}. Do not give this number to a customer.</small>
    </div>`:''}
    <p class="jwo-disclaimer">Per the Terms of Service: AI outputs, including labor estimates, are informational aids only and may be incomplete or incorrect. The shop and technician remain solely responsible for diagnosis, testing, repair decisions, labor times, parts selection and pricing. Check every labor time and part price yourself before quoting it.</p>
    ${t.counts.unpricedLines?`<p class="jwo-disclaimer plain">${t.counts.unpricedLines} line${t.counts.unpricedLines===1?'':'s'} have no cost or hours entered yet.</p>`:''}
  </div>`;
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
  ${totalsMarkup(wo)}
  ${canSeeFinancials()?financialMarkup(invoice,wo):''}
  ${wo.authorization?.note?`<div class="jwo-auth"><b>Authorization:</b> ${esc(wo.authorization.note)}</div>`:''}
</section>`;}

function css(){if(document.getElementById('job-work-order-style'))return;const s=document.createElement('style');s.id='job-work-order-style';s.textContent=`
.jwo{background:#10151b;border:1px solid #63262b;border-radius:15px;padding:14px;margin:10px 0 12px;box-shadow:0 0 18px rgba(239,42,49,.08)}
.jwo-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.jwo-top h2{font-size:18px;margin:2px 0}.jwo-complaint{background:#0a0e13;border:1px solid #303841;border-radius:10px;padding:11px;margin-bottom:10px}.jwo-complaint p{margin:5px 0 3px;line-height:1.35}.jwo-complaint small{display:block;color:#aeb6c0;margin-top:7px}.jwo-section{border-top:1px solid #2c343d;padding-top:10px;margin-top:10px}.jwo-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.jwo-section-head h3{font-size:13px;margin:0;text-transform:uppercase;letter-spacing:.04em}.jwo-add{padding:4px 8px!important;min-height:28px!important;font-size:11px!important}.jwo-list{display:grid;gap:6px}.jwo-row{display:grid;grid-template-columns:minmax(0,1fr) auto 118px;gap:8px;align-items:center;background:#0a0e13;border:1px solid #28313a;border-radius:9px;padding:8px 9px}.jwo-main{min-width:0}.jwo-main b{display:block;font-size:12px}.jwo-main small{display:block;color:#8e99a5;font-size:10px;margin-top:3px;line-height:1.25}.jwo-price{font-size:11px;font-weight:700}.jwo-row select{background:#111820;color:#f4f6f8;border:1px solid #39434d;border-radius:7px;padding:6px;font-size:10px;max-width:118px}.jwo-empty{font-size:11px;color:#8e99a5;padding:8px}.jwo-fin{margin-top:11px;background:#0a0e13;border:1px solid #34404a;border-radius:10px;padding:10px}.jwo-fin b,.jwo-fin span{display:block}.jwo-fin span{font-size:11px;color:#c5cbd2;margin-top:3px}.jwo-auth{font-size:11px;margin-top:8px;color:#c8ced5}.jwo-ai-wrap{margin-top:9px;border:1px solid #303841;border-radius:11px;background:#0b0f14}.jwo-ai-wrap>summary{cursor:pointer;padding:10px 12px;font-size:12px;font-weight:700}.jwo-ai-wrap>.work-white{margin:0!important;border:0!important;border-top:1px solid #303841!important;border-radius:0 0 11px 11px!important}
.jwo-row-money{grid-template-columns:minmax(0,1fr) minmax(190px,auto) 118px}
.jwo-money{display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:flex-end;max-width:280px}
.jwo-inp{display:flex;align-items:center;gap:5px;font-size:10px;color:#9aa4b0}.jwo-inp input{width:74px;background:#111820;color:#f4f6f8;border:1px solid #39434d;border-radius:7px;padding:5px 6px;font-size:11px}
.jwo-amt{font-size:12px;font-weight:700}.jwo-amt.est{color:#8e99a5;font-weight:600;font-style:italic}
.jwo-money>small{font-size:9px;color:#8e99a5;width:100%;text-align:right}
.jwo-est{font-size:9px;border-radius:6px;padding:2px 5px;border:1px dashed #4a5560;color:#9aa4b0}.jwo-est.beaten{opacity:.55;text-decoration:line-through}
.jwo-attest{width:100%;text-align:right;font-size:9px;border-radius:7px;padding:4px 6px;border:1px solid transparent}
.jwo-attest.pending{background:#2a2008;border-color:#7a5c12;color:#f0c04a;cursor:pointer;font-weight:700}
.jwo-attest.ok{background:#0d1c12;border-color:#2c5c3a;color:#7fd6a0;display:block}
.jwo-attest.none{color:#78828d;font-style:italic}
.jwo-relink{margin-left:6px;background:none;border:0;color:#9aa4b0;text-decoration:underline;font-size:9px;cursor:pointer}
.jwo-totals{margin-top:12px;display:grid;gap:9px;grid-template-columns:1fr 1fr}
.jwo-total-col{background:#0a0e13;border:1px solid #2c343d;border-radius:10px;padding:10px}
.jwo-total-col.ok{border-color:#2c5c3a}.jwo-total-col.est{border-color:#5a4a1e;opacity:.92}
.jwo-total-head{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#aeb6c0;margin-bottom:6px;font-weight:700}
.jwo-total-row{display:flex;justify-content:space-between;gap:8px;font-size:11px;padding:2px 0}.jwo-total-row.grand{border-top:1px solid #2c343d;margin-top:4px;padding-top:5px;font-size:13px}
.jwo-total-col small{display:block;margin-top:6px;font-size:9px;color:#8e99a5;line-height:1.35}
.jwo-disclaimer{grid-column:1/-1;margin:0;font-size:10px;line-height:1.45;color:#c9a24a;background:#1c1708;border:1px solid #5a4a1e;border-radius:9px;padding:8px 10px}
.jwo-disclaimer.plain{color:#8e99a5;background:#0a0e13;border-color:#2c343d}
.jwo-modal{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9999}
.jwo-modal-card{background:#10151b;border:1px solid #3a454f;border-radius:14px;padding:16px;max-width:460px;width:100%;max-height:88vh;overflow:auto}
.jwo-modal-card h3{margin:0 0 6px;font-size:15px}
.jwo-modal-amt{margin:0 0 8px;font-size:19px;font-weight:800}
.jwo-modal-guess{margin:0 0 8px;font-size:11px;color:#9aa4b0}
.jwo-modal-terms{margin:0 0 10px;font-size:10px;line-height:1.45;color:#c9a24a;background:#1c1708;border:1px solid #5a4a1e;border-radius:9px;padding:8px 10px}
.jwo-check{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:7px}
.jwo-check label{display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.4;cursor:pointer}
.jwo-check input{margin-top:2px;width:16px;height:16px;flex:none}
.jwo-src{display:block;font-size:10px;color:#9aa4b0}.jwo-src input{width:100%;margin-top:4px;background:#0a0e13;color:#f4f6f8;border:1px solid #39434d;border-radius:8px;padding:8px;font-size:12px}
.jwo-modal-sign{font-size:10px;color:#8e99a5;margin:9px 0 0;line-height:1.4}
.jwo-modal-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
.jwo-modal-err{margin:8px 0 0;font-size:11px;color:#ef6a6a}
@media(max-width:620px){.jwo-totals{grid-template-columns:1fr}.jwo-row-money{grid-template-columns:minmax(0,1fr) 108px}.jwo-money{max-width:none;justify-content:flex-start}.jwo{padding:11px}.jwo-row{grid-template-columns:minmax(0,1fr) 108px}.jwo-price{grid-column:1}.jwo-row select{grid-column:2;grid-row:1 / span 2}.jwo-top h2{font-size:16px}}
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
/*
 * Typing a number always drops any existing signature on that line. Someone
 * signed for $180; if the figure silently becomes $400 while still showing as
 * checked, the record is a lie. Re-entering means re-signing.
 */
function setMoney(kind,index,raw){
  const p=window.MobileMechanicPricing;if(!p||!currentState)return;
  if(kind==='cost'){
    const list=currentState.wo.parts;if(!list?.[index])return;
    list[index]=p.clearAttestation(p.confirmPartCost(list[index],raw));
  }else{
    const list=currentState.wo.work;if(!list?.[index])return;
    list[index]=p.clearAttestation(p.confirmLaborHours(list[index],raw,'entered'));
  }
  rerender();save();
}
function closeAttestModal(){document.querySelector('[data-jwo-attest-modal]')?.remove();}
function openAttestModal(kind,index){
  const p=window.MobileMechanicPricing;if(!p||!currentState)return;
  const listKey=kind==='parts'?'parts':'work';
  const item=currentState.wo[listKey]?.[index];if(!item)return;
  const user=currentUser();
  if(!user){toast('Sign in again before signing off — an attestation has to name a person.','bad');return;}
  const checkKind=kind==='parts'?'parts':'labor';
  const items=p.checklistFor(checkKind);
  const rates=pricing();
  const r=kind==='parts'?p.partAmount(item,rates):p.laborAmount(item,rates);
  const guess=kind==='parts'?item.estimate?.price:item.estimate?.hours;
  const guessText=guess===null||guess===undefined?'':(kind==='parts'?p.formatMoney(guess):p.formatHours(guess));
  closeAttestModal();
  const el=document.createElement('div');
  el.setAttribute('data-jwo-attest-modal','');
  el.className='jwo-modal';
  el.innerHTML=`<div class="jwo-modal-card" role="dialog" aria-modal="true" aria-label="Sign off on this number">
    <h3>Sign off: ${esc(item.name)}</h3>
    <p class="jwo-modal-amt">${esc(kind==='parts'?p.formatMoney(r.amount):`${p.formatHours(r.hours)} · ${p.formatMoney(r.amount)}`)}</p>
    ${guessText?`<p class="jwo-modal-guess">The AI estimated ${esc(guessText)}. You are signing for your own figure, not the AI's.</p>`:''}
    <p class="jwo-modal-terms">Terms of Service section 2: AI outputs, including labor estimates, are informational aids only and may be incomplete or incorrect. The shop and technician remain solely responsible for labor times, parts selection and pricing.</p>
    <form data-jwo-attest-form>
      <ul class="jwo-check">${items.map(x=>`<li><label><input type="checkbox" data-jwo-check="${esc(x.id)}"><span>${esc(x.text)}</span></label></li>`).join('')}</ul>
      <label class="jwo-src"><span>${kind==='parts'?'Supplier or quote reference':'Labor guide or measured source'}</span><input type="text" data-jwo-attest-source maxlength="200" placeholder="${kind==='parts'?'e.g. NAPA counter quote #4821':'e.g. Identifix 2.4 hr, verified'}" required></label>
      <p class="jwo-modal-sign">Signing as <b>${esc(user.name||'this account')}</b>. Your name, the time, this checklist version and the AI estimate are recorded on the work order.</p>
      <div class="jwo-modal-btns">
        <button type="button" class="btn btn-soft" data-jwo-attest-cancel>Cancel</button>
        <button type="submit" class="btn" data-jwo-attest-submit>I checked this myself — sign off</button>
      </div>
      <p class="jwo-modal-err" data-jwo-attest-err hidden></p>
    </form>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('[data-jwo-attest-source]')?.focus();
  el.addEventListener('click',ev=>{if(ev.target===el)closeAttestModal();});
  el.querySelector('[data-jwo-attest-cancel]')?.addEventListener('click',()=>closeAttestModal());
  el.querySelector('[data-jwo-attest-form]')?.addEventListener('submit',ev=>{
    ev.preventDefault();
    const ticked=[...el.querySelectorAll('[data-jwo-check]')].filter(c=>c.checked).map(c=>c.dataset.jwoCheck);
    const source=el.querySelector('[data-jwo-attest-source]')?.value||'';
    const res=p.attestLine(item,checkKind,{userId:user.id,userName:user.name,source,items:ticked,amount:r.amount,userAgent:navigator.userAgent});
    const err=el.querySelector('[data-jwo-attest-err]');
    if(!res.ok){
      if(err){err.hidden=false;err.textContent=res.needsSource?'Name the labor guide, supplier or quote you checked against.':`Check every box first — ${res.missing.length} still unticked.`;}
      return;
    }
    currentState.wo[listKey][index]=res.line;
    closeAttestModal();rerender();save();
    toast('Signed off and recorded.','good');
  });
}
function bindGlobal(){
  document.addEventListener('change',e=>{
    const el=e.target.closest?.('[data-jwo-status]');
    if(el&&currentState){const type=el.dataset.jwoType,i=Number(el.dataset.jwoIndex);if(currentState.wo[type]?.[i]){currentState.wo[type][i].status=el.value;save();}return;}
    const cost=e.target.closest?.('[data-jwo-cost]');
    if(cost){setMoney('cost',Number(cost.dataset.jwoIndex),cost.value);return;}
    const hours=e.target.closest?.('[data-jwo-hours]');
    if(hours){setMoney('hours',Number(hours.dataset.jwoIndex),hours.value);return;}
  },true);
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-jwo-add]');
    if(b){e.preventDefault();add(b.dataset.jwoAdd);return;}
    const a=e.target.closest?.('[data-jwo-attest]');
    if(a){e.preventDefault();openAttestModal(a.dataset.jwoAttest,Number(a.dataset.jwoIndex));return;}
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAttestModal();});
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
