(() => {
'use strict';
if(window.__MMANextInvoiceInitialized)return;
window.__MMANextInvoiceInitialized=true;
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
let state=null,mounting=false,squareDraft=null,squareBusy=false,tapBusy=false,saving=false,saveQueue=Promise.resolve(),importRows=[],importContext=null,importBusy=false;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find?.(j=>String(j.id)===String(db.session?.activeJobId))||null;return {db,sid,shop,job};}
function canManagePayments(){const {db,shop}=context(),user=shop?.users?.find?.(row=>String(row.id)===String(db.session?.userId));return ['owner','shop_owner','manager','service_writer'].includes(String(user?.role||''));}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function toast(msg,type=''){document.querySelector('.next-estimate-toast')?.remove();const d=document.createElement('div');d.className=`toast next-estimate-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3600);}
function shopRate(){return Number(context().shop?.settings?.laborRate||75);}
function pricing(){const s=context().shop||{};return {laborRate:Number(s.settings?.laborRate||s.laborRate||75),partsMarkup:Number(s.settings?.partsMarkup||s.partsMarkup||0),taxRate:Number(s.settings?.taxRate||s.taxRate||0),travelFee:Number(s.settings?.travelFee||s.travelFee||0)};}
function roundMoney(v){return Math.round((Number(v)||0)*100)/100;}
function blank(){const p=pricing();return {status:'draft',parts:[],labor:[],tax_rate:p.taxRate,tax_enabled:p.taxRate>0,travel_fee:p.travelFee,travel_enabled:p.travelFee>0,deposit_mode:'none',deposit_amount:null,deposit_percent:null};}
function partAmount(item){const p=window.MobileMechanicPricing;try{const r=p?.partAmount?.(item,pricing());if(r&&!r.estimated&&Number.isFinite(Number(r.amount)))return Number(r.amount);}catch{}const raw=item?.amount??item?.price??item?.cost;const n=Number(raw);return raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(n)&&n>=0?n:null;}
function laborFromWork(item){if(item?.flat_fee)return {name:String(item.name||'Labor'),flat_fee:true,hours:null,rate:null,amount:roundMoney(item.amount??0)};const rate=Number(item?.rate||shopRate()),hours=item?.hours??null;const p=window.MobileMechanicPricing;let amount=null;try{const r=p?.laborAmount?.(item,pricing());if(r&&!r.estimated&&Number.isFinite(Number(r.amount)))amount=Number(r.amount);}catch{}if(amount===null&&hours!==null&&hours!==''&&Number.isFinite(Number(hours)))amount=roundMoney(Number(hours)*rate);return {name:String(item?.name||'Labor'),hours,rate,amount};}
function seedFromWorkOrder(wo){const defaults=blank();const parts=(wo.parts||[]).map(x=>{const amount=partAmount(x),quantity=Math.max(1,Number(x?.quantity)||1);return {name:String(x?.name||'Part'),amount,quantity,unit_price:amount===null?null:roundMoney(amount/quantity)};}).filter(x=>x.amount!==null&&x.amount>=0);const labor=(wo.work||[]).map(laborFromWork).filter(x=>x.amount!==null&&x.amount>=0);return {...defaults,parts,labor};}
async function load(job){
  if(!sb||!job?.id)return blank();
  const {sid}=context();
  const {data,error}=await sb.from('jobs').select('ai_workup').eq('id',job.id).eq('shop_id',sid).maybeSingle();if(error)throw error;
  const wo=data?.ai_workup?.work_order||{};
  const saved=wo.additional_estimate||wo.next_invoice||null;
  const n=structuredClone(saved?{...blank(),...saved}:seedFromWorkOrder(wo));
  n.parts=Array.isArray(n.parts)?n.parts:[];n.labor=Array.isArray(n.labor)?n.labor:[];
  n.parts=n.parts.map(x=>{const quantity=Math.max(1,Number(x.quantity)||1),amount=x.amount===null||x.amount===undefined?null:roundMoney(x.amount);return {...x,quantity,amount,unit_price:x.unit_price===null||x.unit_price===undefined?(amount===null?null:roundMoney(amount/quantity)):roundMoney(x.unit_price)};});
  n.labor=n.labor.map(x=>{const row={...x,flat_fee:!!x.flat_fee,hours:x.hours??null,rate:x.flat_fee?null:Number(x.rate||shopRate()),amount:x.amount??null};recalc(row);return row;});
  n.tax_rate=Math.max(0,Number(n.tax_rate??pricing().taxRate)||0);
  n.travel_fee=Math.max(0,roundMoney(n.travel_fee??pricing().travelFee));
  n.tax_enabled=n.tax_enabled!==false;
  n.travel_enabled=n.travel_enabled!==false;
  n.deposit_mode=['none','fixed','percent'].includes(n.deposit_mode)?n.deposit_mode:Number(n.deposit_amount)>0?'fixed':'none';
  return n;
}
async function loadSquareDraft(job){if(!sb||!job?.id)return null;const {sid}=context();const {data,error}=await sb.from('invoices').select('*').eq('job_id',job.id).eq('shop_id',sid).order('created_at',{ascending:false}).limit(20);if(error)throw error;return (data||[]).find(x=>['additional_work_estimate','square_import'].includes(x?.processor_metadata?.source))||null;}
function recalc(item){if(item.flat_fee){item.amount=item.amount===null||item.amount===''?null:roundMoney(item.amount);return;}const h=Number(item.hours),r=Number(item.rate||shopRate());item.amount=Number.isFinite(h)&&h>=0&&item.hours!==null&&item.hours!==''?roundMoney(h*r):null;}
function partsTotal(){return roundMoney((state?.parts||[]).reduce((sum,x)=>sum+(Number(x.amount)||0),0));}
function laborTotal(){return roundMoney((state?.labor||[]).reduce((sum,x)=>sum+(Number(x.amount)||0),0));}
function travelTotal(){return state?.travel_enabled?roundMoney(Math.max(0,Number(state.travel_fee)||0)):0;}
function taxTotal(){return state?.tax_enabled?roundMoney((partsTotal()+laborTotal())*Math.max(0,Number(state.tax_rate)||0)/100):0;}
function subtotal(){return roundMoney(partsTotal()+laborTotal()+travelTotal());}
function estimateTotal(){return roundMoney(subtotal()+taxTotal());}
function chosenDeposit(){if(state?.deposit_mode==='none')return 0;if(state?.deposit_mode==='percent')return roundMoney(estimateTotal()*Math.max(0,Number(state.deposit_percent)||0)/100);return roundMoney(Math.max(0,Number(state?.deposit_amount)||0));}
function validDeposit(){const deposit=chosenDeposit(),total=estimateTotal();if(state?.deposit_mode==='none')return 0;if(!(deposit>0))throw new Error('Choose the deposit amount for this job.');if(deposit>=total)throw new Error('The deposit must be less than the total so a final balance remains.');return deposit;}
function financialsLocked(){return !!squareDraft?.processor_metadata?.square_invoice_id||!!squareDraft&&String(squareDraft.status||'draft').toLowerCase()!=='draft'||squareDraft?.processor_metadata?.source==='square_import';}
function vehicleText(v={}){return [v.year,v.make,v.model,v.trim].filter(Boolean).join(' ');}
function priorJobs(){const {shop,job}=context();if(!shop||!job)return[];const customerId=String(job.customerId||job.customer_id||''),vin=String(job.vehicle?.vin||'').trim().toLowerCase();return (shop.jobs||[]).filter(x=>String(x.id)!==String(job.id)&&((customerId&&String(x.customerId||x.customer_id||'')===customerId)||(vin&&String(x.vehicle?.vin||'').trim().toLowerCase()===vin))).sort((a,b)=>String(b.createdAt||b.created_at||'').localeCompare(String(a.createdAt||a.created_at||'')));}
function partLine(x,i){const locked=financialsLocked();return `<div class="nxe-edit-row"><label>Part / description<input type="text" data-nxe-name data-nxe-type="parts" data-nxe-index="${i}" value="${esc(x.name||'Part')}" ${locked?'disabled':''}></label><label>Quantity<input type="number" min="1" step="1" data-nxe-quantity data-nxe-index="${i}" value="${esc(x.quantity||1)}" ${locked?'disabled':''}></label><label>Unit price ($)<input type="number" min="0" step="0.01" inputmode="decimal" data-nxe-unit-price data-nxe-index="${i}" value="${esc(x.unit_price??'')}" ${locked?'disabled':''}></label><strong data-nxe-line-total="parts" data-nxe-index="${i}">${money(x.amount)}</strong>${locked?'':`<button type="button" class="nxe-remove" data-nxe-remove data-nxe-type="parts" data-nxe-index="${i}" aria-label="Remove part">×</button>`}</div>`;}
function laborLine(x,i){const locked=financialsLocked();return `<div class="nxe-edit-row"><label class="nxe-description">Labor / service<input type="text" data-nxe-name data-nxe-type="labor" data-nxe-index="${i}" value="${esc(x.name||'Labor')}" ${locked?'disabled':''}></label><label class="nxe-flat-check"><input type="checkbox" data-nxe-labor-kind data-nxe-index="${i}" ${x.flat_fee?'checked':''} ${locked?'disabled':''}> Flat rate</label>${x.flat_fee?`<label>Flat amount ($)<input type="number" min="0" step="0.01" inputmode="decimal" data-nxe-flat-amount data-nxe-index="${i}" value="${esc(x.amount??'')}" ${locked?'disabled':''}></label>`:`<label>Hours<input type="number" min="0" step="0.1" inputmode="decimal" data-nxe-hours data-nxe-index="${i}" value="${esc(x.hours??'')}" ${locked?'disabled':''}></label><label>Rate ($/hr)<input type="number" min="0" step="0.01" inputmode="decimal" data-nxe-rate data-nxe-index="${i}" value="${esc(x.rate??shopRate())}" ${locked?'disabled':''}></label>`}<strong data-nxe-line-total="labor" data-nxe-index="${i}">${money(x.amount)}</strong>${locked?'':`<button type="button" class="nxe-remove" data-nxe-remove data-nxe-type="labor" data-nxe-index="${i}" aria-label="Remove labor">×</button>`}</div>`;}
function group(title,type,items){return `<section class="nxe-group"><div class="nxe-head"><h4>${title}</h4>${financialsLocked()?'':`<button class="btn btn-soft" type="button" data-nxe-add="${type}">+ Add ${type==='parts'?'Part':'Labor'}</button>`}</div>${items.length?items.map((x,i)=>type==='parts'?partLine(x,i):laborLine(x,i)).join(''):`<div class="nxe-empty">No ${type} added.</div>`}</section>`;}
function squareActions(){
 const hasDraft=!!squareDraft?.processor_metadata?.square_invoice_id;
 if(hasDraft){const num=squareDraft?.processor_metadata?.square_invoice_number||'',meta=squareDraft?.processor_metadata||{},status=String(squareDraft?.processor_status||squareDraft?.status||'DRAFT').toUpperCase(),url=squareDraft?.processor_payment_url||squareDraft?.payment_links?.square||'',draft=status==='DRAFT',actions=[draft?`<button class="btn btn-primary" type="button" data-nxe-publish-square ${squareBusy?'disabled':''}>Publish Payment Link</button>`:'',url?`<button class="btn btn-primary" type="button" data-nxe-open-payment-link>Open Customer Link</button><button class="btn btn-soft" type="button" data-nxe-copy-payment-link>Copy Link</button>`:'',`<button class="btn btn-soft" type="button" data-nxe-refresh-square>Refresh</button>`].filter(Boolean).join('');return `<section class="nxe-square"><div><b>Square ${esc(status.replaceAll('_',' '))}</b>${num?`<small>Invoice ${esc(num)}</small>`:''}<small>${money(Number(meta.total_paid||0))} paid • ${money(Number(meta.remaining_calculated??Math.max(0,Number(squareDraft.total||0)-Number(meta.total_paid||0))))} remaining</small><small>To change a Square-linked invoice, cancel or revise it in Square first.</small></div><div class="nxe-square-actions">${actions}</div></section>`;}
 const total=estimateTotal(),deposit=chosenDeposit(),final=Math.max(0,total-deposit),mode=state.deposit_mode||'none';
 return `<section class="nxe-payment"><b>Deposit / payment terms</b><label>Deposit option<select data-nxe-deposit-mode><option value="none" ${mode==='none'?'selected':''}>No deposit, pay in full</option><option value="fixed" ${mode==='fixed'?'selected':''}>Fixed deposit ($)</option><option value="percent" ${mode==='percent'?'selected':''}>Percentage deposit (%)</option></select></label>${mode==='none'?'':`<label>${mode==='percent'?'Deposit percentage':'Deposit amount'}<span class="nxe-money-input"><input id="nxeDepositAmount" data-nxe-deposit-amount type="number" min="0" max="${mode==='percent'?99.99:Math.max(0,total-.01).toFixed(2)}" step="0.01" inputmode="decimal" value="${esc(mode==='percent'?(state.deposit_percent??''):(state.deposit_amount??''))}" placeholder="${mode==='percent'?'Percent':'Amount'}">${mode==='percent'?'%':'$'}</span></label>`}<div class="nxe-balance"><span>Deposit due</span><strong data-nxe-total="deposit">${money(deposit)}</strong></div><div class="nxe-balance"><span>Balance due</span><strong data-nxe-total="balance">${money(final)}</strong></div><div class="nxe-actions"><button class="btn btn-soft" type="button" data-nxe-save-draft ${saving?'disabled':''}>${saving?'Saving…':'Save Invoice Draft'}</button><button class="btn btn-primary" type="button" data-nxe-create-square ${squareBusy?'disabled':''}>Create Square Draft</button></div><small>Square does not charge or send anything until you publish or collect payment. No deposit is required.</small></section>`;
}
function tapAmount(){if(!squareDraft)return estimateTotal();const status=String(squareDraft.processor_status||squareDraft.status||'').toUpperCase();if(['PAID','CANCELED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED'].includes(status))return 0;return Math.max(0,Number(squareDraft.total||0)-Number(squareDraft.processor_metadata?.total_paid||0));}
function tapActions(){if(squareDraft?.processor_metadata?.source==='square_import')return '';const total=tapAmount();if(!(total>0))return '';return `<section class="nxe-tap"><div><b>In-person tap payment</b><small>Opens Square Point of Sale on this phone for card or wallet tap.</small></div><button class="btn btn-primary" type="button" data-nxe-tap-square ${tapBusy?'disabled':''}>${tapBusy?'Opening…':`Take Tap Payment ${money(total)}`}</button></section>`;}
function markup(){
 const pt=partsTotal(),lt=laborTotal(),tt=taxTotal(),tr=travelTotal(),imported=squareDraft?.processor_metadata?.source==='square_import',locked=financialsLocked();
 const total=locked?Number(squareDraft?.total||0):estimateTotal();
 return `<section class="nxe" data-next-invoice><div class="nxe-title"><div><div class="eyebrow">PAYMENT</div><h3>Square Invoice</h3><small>${imported?'Imported from your existing Square invoice.':'Uses the Parts and Labor entered in the work order above. Edit charges here for this job.'}</small></div></div>
 ${locked?`<section class="nxe-summary">${(squareDraft?.line_items||[]).map(item=>`<div><span>${esc(item.description)} × ${esc(item.quantity||1)}</span><strong>${money(item.amount)}</strong></div>`).join('')}<div><span>Tax</span><strong>${money(squareDraft?.tax)}</strong></div><div class="nxe-total"><span>Square invoice total</span><strong>${money(total)}</strong></div></section>`:`
 ${group('Labor / services','labor',state.labor)}
 ${group('Parts','parts',state.parts)}
 <section class="nxe-summary nxe-edit-totals">
 <div><span>Labor</span><strong data-nxe-total="labor">${money(lt)}</strong></div><div><span>Parts</span><strong data-nxe-total="parts">${money(pt)}</strong></div>
 <div class="nxe-adjust"><label><input type="checkbox" data-nxe-travel-enabled ${state.travel_enabled?'checked':''}> Travel charge</label><input aria-label="Travel charge" type="number" min="0" step="0.01" inputmode="decimal" data-nxe-travel-fee value="${esc(state.travel_fee??0)}" ${state.travel_enabled?'':'disabled'}></div>
 <div class="nxe-adjust"><label><input type="checkbox" data-nxe-tax-enabled ${state.tax_enabled?'checked':''}> Tax (%)</label><input aria-label="Tax percentage" type="number" min="0" max="100" step="0.01" inputmode="decimal" data-nxe-tax-rate value="${esc(state.tax_rate??0)}" ${state.tax_enabled?'':'disabled'}><strong data-nxe-total="tax">${money(tt)}</strong></div>
 <div><span>Travel</span><strong data-nxe-total="travel">${money(tr)}</strong></div><div class="nxe-total"><span>Invoice total</span><strong data-nxe-total="grand">${money(total)}</strong></div>
 </section>`}
 ${squareActions()}<div class="nxe-actions nxe-document-actions"><button class="btn btn-soft" type="button" data-invoice-print>Print / PDF</button><button class="btn btn-soft" type="button" data-invoice-sign>Customer Signature</button></div><button class="btn btn-soft btn-wide" type="button" data-nxe-import-square>Import existing Square invoice</button>${tapActions()}</section>`;
}
function css(){if(document.getElementById('next-estimate-style'))return;const s=document.createElement('style');s.id='next-estimate-style';s.textContent=`
.nxe-import-row{background:#0a0e13;border:1px solid #39434d;border-radius:9px;padding:10px;margin-top:9px}.nxe-import-row b,.nxe-import-row small,.nxe-import-row strong{display:block;margin-bottom:5px}.nxe-import-row small{color:#9da7b2}[data-nxe-import-search]{width:100%;box-sizing:border-box;margin:6px 0 10px}.nxe{background:#10151b;border:1px solid #63262b;border-radius:14px;padding:13px;margin:10px 0}.nxe-title,.nxe-head,.nxe-summary>div,.nxe-payment label,.nxe-balance,.nxe-square{display:flex;align-items:center;justify-content:space-between;gap:10px}.nxe-title h3{margin:2px 0 0;font-size:18px}.nxe-title small{display:block;color:#9da7b2;font-size:10px;margin-top:2px}.nxe-group{margin-top:12px}.nxe-head h4{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em}.nxe-head .btn{padding:5px 9px!important;min-height:30px!important;font-size:11px!important}.nxe-row{display:grid;gap:8px;align-items:center;background:#0a0e13;border:1px solid #28313a;border-radius:9px;padding:9px;margin-top:7px}.nxe-part{grid-template-columns:minmax(0,1fr) 128px 24px}.nxe-labor{grid-template-columns:minmax(0,1fr) 80px 110px 24px}.nxe-row>b{font-size:12px}.nxe-row label>span:first-child{display:block;font-size:9px;color:#8e99a5;margin-bottom:3px}.nxe-row input{width:100%;box-sizing:border-box;background:#111820;color:#fff;border:1px solid #39434d;border-radius:7px;padding:7px}.nxe-line-total{text-align:right}.nxe-line-total small,.nxe-line-total strong{display:block}.nxe-line-total small{font-size:9px;color:#8e99a5}.nxe-line-total strong{font-size:12px;margin-top:2px}.nxe-remove{border:0;background:transparent;color:#cbd2d9;font-size:20px;line-height:1;cursor:pointer}.nxe-empty{font-size:11px;color:#8e99a5;padding:9px}.nxe-summary{margin-top:12px;background:#0a0e13;border:1px solid #39434d;border-radius:9px;padding:10px}.nxe-summary>div{font-size:11px;padding:3px 0}.nxe-total{border-top:1px solid #39434d;margin-top:5px;padding-top:8px!important;font-size:14px!important}.nxe-payment{margin-top:10px;background:#0a0e13;border:1px solid #39434d;border-radius:9px;padding:10px}.nxe-payment label{font-size:12px}.nxe-money-input{display:flex;align-items:center;gap:4px}.nxe-money-input input{width:112px}.nxe-balance{font-size:11px;margin:8px 0 10px}.nxe-square{margin-top:10px;background:#0a0e13;border:1px solid #39434d;border-radius:9px;padding:10px}.nxe-square b,.nxe-square small{display:block}.nxe-square small{font-size:10px;color:#9da7b2;margin-top:2px}.nxe-square-actions{display:flex;gap:7px;flex-wrap:wrap}.nxe-history-link{width:100%;margin-top:10px;background:transparent;color:#f3f5f7;border:1px solid #303841;border-radius:9px;padding:10px 11px;display:flex;align-items:center;gap:8px;text-align:left;cursor:pointer}.nxe-history-link span{margin-left:auto;background:#232b33;border-radius:999px;padding:2px 7px;font-size:10px}.nxe-history-link strong{font-size:18px}.nxe-history-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px}.nxe-history-card{width:min(520px,100%);max-height:82vh;overflow:auto;background:#10151b;border:1px solid #3a454f;border-radius:14px;padding:14px}.nxe-history-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.nxe-history-head h3{margin:0}.nxe-history-close{border:0;background:transparent;color:#fff;font-size:24px}.nxe-history-row{display:block;width:100%;text-align:left;background:#0a0e13;color:#fff;border:1px solid #28313a;border-radius:9px;padding:9px;margin-top:7px}.nxe-history-row b,.nxe-history-row small{display:block}.nxe-history-row small{color:#9da7b2;margin-top:3px}
@media(max-width:620px){.nxe-part{grid-template-columns:minmax(0,1fr) 105px 22px}.nxe-labor{grid-template-columns:minmax(0,1fr) 65px 86px 22px}.nxe{padding:11px}.nxe-title h3{font-size:16px}.nxe-square{align-items:flex-start;flex-direction:column}.nxe-square-actions{width:100%}}
.nxe-tap{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;background:#0a0e13;border:1px solid #39434d;border-radius:9px;padding:10px}.nxe-tap b,.nxe-tap small{display:block}.nxe-tap small{font-size:10px;color:#9da7b2;margin-top:2px}
@media(max-width:620px){.nxe-tap{align-items:flex-start;flex-direction:column}.nxe-tap .btn{width:100%}}
.nxe-edit-row{display:flex;gap:8px;align-items:end;flex-wrap:wrap;background:#0a0e13;border:1px solid #29333d;border-radius:10px;padding:10px;margin:7px 0}
.nxe-edit-row label{display:flex;flex:1 1 100px;min-width:80px;gap:4px;flex-direction:column;color:#b5bdc7;font-size:11px}
.nxe-edit-row label.nxe-description{flex:3 1 220px}.nxe-edit-row input,.nxe-payment select,.nxe-payment input,.nxe-adjust input[type=number]{box-sizing:border-box;min-height:36px;width:100%;background:#111820;color:white;border:1px solid #39434d;border-radius:7px;padding:7px;font-size:14px}
.nxe-edit-row>strong{font-size:14px;min-width:70px;text-align:right}.nxe-flat-check{flex:0 0 78px!important;flex-direction:row!important;align-items:center}.nxe-flat-check input{min-height:auto;width:auto}
.nxe-edit-totals .nxe-adjust{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 0}
.nxe-adjust label{display:flex;align-items:center;gap:7px;min-width:120px}.nxe-adjust input[type=number]{max-width:130px}.nxe-adjust input[type=checkbox]{width:18px;height:18px}
.nxe-payment{display:grid;gap:10px}.nxe-payment label{display:flex;align-items:center;flex-wrap:wrap;justify-content:space-between;gap:10px}.nxe-payment select{max-width:230px}.nxe-payment small{color:#aeb6c0;font-size:10px}
.nxe-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.nxe-actions .btn{width:100%}
@media(max-width:620px){.nxe-edit-row label.nxe-description{flex-basis:100%}.nxe-actions{grid-template-columns:1fr}.nxe-adjust input[type=number]{max-width:100px}}
`;document.head.appendChild(s);}
async function save(silent=false){
 const {sid,job}=context();if(!sb||!job?.id||!state||financialsLocked())return;
 const snapshot=structuredClone(state);
 try{
  const {data,error}=await sb.from('jobs').select('ai_workup').eq('id',job.id).eq('shop_id',sid).single();if(error)throw error;
  const ai={...(data.ai_workup||{})},wo={...(ai.work_order||{})};
  wo.additional_estimate={...snapshot,updated_at:new Date().toISOString()};
  delete wo.next_invoice;ai.work_order=wo;
  const r=await sb.from('jobs').update({ai_workup:ai,updated_at:new Date().toISOString()}).eq('id',job.id).eq('shop_id',sid);if(r.error)throw r.error;
  if(squareDraft&&!squareDraft.processor_metadata?.square_invoice_id&&String(squareDraft.status||'draft')==='draft'){
   const lines=invoiceLines(),amount=subtotal(),tax=taxTotal(),deposit=chosenDeposit();
   const processor_metadata={...(squareDraft.processor_metadata||{}),source:'additional_work_estimate',tax_rate:state.tax_rate,tax_enabled:!!state.tax_enabled,travel_fee:travelTotal(),travel_enabled:!!state.travel_enabled,deposit_mode:state.deposit_mode,deposit_amount:deposit,deposit_percent:state.deposit_percent??null,final_balance_amount:roundMoney(estimateTotal()-deposit),balance_due_on_completion:deposit>0};
   const update=await sb.from('invoices').update({line_items:lines,subtotal:amount,tax,total:estimateTotal(),processor_metadata,updated_at:new Date().toISOString()}).eq('id',squareDraft.id).eq('shop_id',sid).eq('status','draft').select('*').single();
   if(update.error)throw update.error;squareDraft=update.data;
  }
  if(!silent)toast('Invoice draft saved.','good');
 }catch(e){toast(e.message||'Could not save invoice draft.','bad');throw e;}
}
function rerender(){const el=document.querySelector('[data-next-invoice]');if(el)el.outerHTML=markup();}
function add(type){
 if(!state||financialsLocked())return;
 if(type==='parts')state.parts.push({name:'New Part',amount:null,quantity:1,unit_price:null});
 else state.labor.push({name:'New Labor',flat_fee:true,hours:null,rate:null,amount:null});
 rerender();
 const list=document.querySelectorAll(`[data-nxe-name][data-nxe-type="${type}"]`);list[list.length-1]?.focus();
 queueInvoiceSave(true).catch(()=>{});
}
function estimateComplete(){return (state.parts.length+state.labor.length>0||travelTotal()>0)&&state.parts.every(x=>x.amount!==null&&Number(x.amount)>=0&&x.name?.trim())&&state.labor.every(x=>x.amount!==null&&Number(x.amount)>=0&&x.name?.trim())&&estimateTotal()>0;}
async function squareSyncRequest(body,sid=context().sid){const {data,error}=await sb.functions.invoke('square-sync',{body:{...body,shop_id:sid}});if(error){let detail='';try{detail=(await error.context?.json?.())?.error||'';}catch{}throw new Error(detail||error.message||'Square request failed.');}if(data?.error)throw new Error(data.error);return data;}
function closeImport(){document.querySelector('[data-nxe-import-modal]')?.remove();importContext=null;}
function renderImportRows(){const list=document.querySelector('[data-nxe-import-list]');if(!list||!importContext)return;const query=(document.querySelector('[data-nxe-import-search]')?.value||'').trim().toLowerCase(),digits=query.replace(/\D/g,''),rows=importRows.filter(row=>[row.customer_name,row.customer_email,row.customer_phone,row.invoice_number,row.title].some(value=>String(value||'').toLowerCase().includes(query))||(digits.length>=3&&String(row.customer_phone||'').replace(/\D/g,'').includes(digits)));list.innerHTML=rows.map(row=>{const other=row.job_id&&String(row.job_id)!==String(importContext.jobId),same=String(row.job_id||'')===String(importContext.jobId);return `<article class="nxe-import-row"><b>${esc(row.customer_name||row.customer_email||'Square customer')}</b><small>Invoice ${esc(row.invoice_number||row.external_id)} · ${esc(row.status.replaceAll('_',' '))}</small><small>${esc(row.title)}${row.created_at?' · '+esc(new Date(row.created_at).toLocaleDateString()):''}</small><strong>${money(row.total)} total · ${money(row.paid)} paid · ${money(row.balance)} remaining</strong><button class="btn btn-primary" type="button" data-nxe-import-id="${esc(row.external_id)}" ${other||importBusy?'disabled':''}>${other?'Attached to another job':same?'Already attached — refresh':'Attach to this job'}</button></article>`;}).join('')||'<p>No matching invoices. Search another name or invoice number, or refresh from Square.</p>';}
async function openImport(){const {sid,job}=context();if(!sb||!job?.id||!canManagePayments())return;closeImport();importContext={sid,jobId:job.id};const captured=importContext;importRows=[];document.body.insertAdjacentHTML('beforeend',`<div class="nxe-history-modal" data-nxe-import-modal><section class="nxe-history-card" role="dialog" aria-modal="true" aria-label="Import existing Square invoice"><header class="nxe-history-head"><h3>Import Square invoice</h3><button class="nxe-history-close" type="button" data-nxe-import-close aria-label="Close">×</button></header><p>Select the invoice you already made in Square for ${esc(job.customerName||'this job')}. Check the number and amount before attaching.</p><label>Search customer, phone, or invoice number<input type="search" data-nxe-import-search placeholder="Name or invoice number"></label><button class="btn btn-soft" type="button" data-nxe-import-reload>Refresh from Square</button><div data-nxe-import-list aria-live="polite">Loading from Square…</div></section></div>`);try{const data=await squareSyncRequest({action:'list_import_invoices'},sid);if(importContext!==captured)return;importRows=data.invoices||[];renderImportRows();document.querySelector('[data-nxe-import-search]')?.focus();}catch(error){if(importContext===captured){const list=document.querySelector('[data-nxe-import-list]');if(list)list.textContent=error.message;}}}
async function attachImport(externalId){if(importBusy||!importContext||!canManagePayments())return;const captured=importContext;importBusy=true;renderImportRows();try{const data=await squareSyncRequest({action:'import_invoice',job_id:captured.jobId,external_invoice_id:externalId},captured.sid);const current=context();if(String(current.sid)===String(captured.sid)&&String(current.job?.id)===String(captured.jobId)){squareDraft=data.invoice;rerender();}if(importContext===captured)closeImport();toast('Existing Square invoice attached to the job.','good');}catch(error){toast(error.message||'Could not attach the invoice.','bad');}finally{importBusy=false;renderImportRows();}}
function invoiceLines(){
 const parts=state.parts.filter(x=>x.amount!==null&&Number(x.amount)>=0).map(x=>({kind:'part',description:x.name,quantity:Math.max(1,Number(x.quantity)||1),unit_price:Number(x.unit_price)||0,amount:roundMoney(x.amount)}));
 const labor=state.labor.filter(x=>x.amount!==null&&Number(x.amount)>=0).map(x=>({kind:'labor',description:x.name,quantity:1,amount:roundMoney(x.amount),...(!x.flat_fee?{labor_hours:Number(x.hours||0),labor_rate:Number(x.rate||shopRate())}:{flat_fee:true})}));
 if(travelTotal()>0)labor.push({kind:'travel',description:'Mobile service travel',quantity:1,unit_price:travelTotal(),amount:travelTotal()});
 return [...parts,...labor];
}
function invoiceMeta(deposit){return {...(squareDraft?.processor_metadata||{}),source:'additional_work_estimate',estimate_snapshot_at:new Date().toISOString(),deposit_mode:state.deposit_mode,deposit_amount:deposit,deposit_percent:state.deposit_percent??null,final_balance_amount:roundMoney(estimateTotal()-deposit),balance_due_on_completion:deposit>0,tax_rate:state.tax_rate,tax_enabled:!!state.tax_enabled,travel_fee:travelTotal(),travel_enabled:!!state.travel_enabled};}
async function ensureLocalInvoice(deposit){
 const {sid,job}=context(),total=estimateTotal(),lines=invoiceLines(),processor_metadata=invoiceMeta(deposit);
 if(squareDraft){if(financialsLocked())throw new Error('This invoice is already connected to Square. Refresh or revise it there.');const {data,error}=await sb.from('invoices').update({line_items:lines,subtotal:subtotal(),tax:taxTotal(),total,processor_metadata}).eq('id',squareDraft.id).eq('shop_id',sid).eq('status','draft').select('*').single();if(error)throw error;squareDraft=data;return data;}
 const row={shop_id:sid,job_id:job.id,estimate_id:null,status:'draft',line_items:lines,subtotal:subtotal(),tax:taxTotal(),total,payment_links:{},payment_processor:'square',processor_metadata};
 const {data,error}=await sb.from('invoices').insert(row).select('*').single();if(error)throw error;squareDraft=data;return data;
}
async function ensureTapInvoice(){
 const {sid,job}=context(),total=estimateTotal(),lines=invoiceLines(),processor_metadata={...invoiceMeta(chosenDeposit()),pos_tap_payment:true,pos_tap_requested_at:new Date().toISOString()};
 if(squareDraft)return squareDraft;
 const row={shop_id:sid,job_id:job.id,estimate_id:null,status:'draft',line_items:lines,subtotal:subtotal(),tax:taxTotal(),total,payment_links:{},payment_processor:'square',processor_metadata};
 const {data,error}=await sb.from('invoices').insert(row).select('*').single();if(error)throw error;squareDraft=data;return data;
}
async function createSquareDraft(){if(squareBusy)return;if(!estimateComplete()){toast('Add a priced labor, part, or travel charge first.','bad');return;}let deposit;try{deposit=validDeposit();}catch(error){toast(error.message,'bad');return;}squareBusy=true;rerender();try{await save(true);const inv=await ensureLocalInvoice(deposit);const {data,error}=await sb.functions.invoke('square-invoice',{body:{action:'create_draft',invoice_id:inv.id,deposit_amount:deposit,balance_days_until_due:365}});if(error)throw new Error(error.message||'Could not create Square draft.');if(data?.error)throw new Error(data.error);squareDraft=await loadSquareDraft(context().job);toast(`Square draft created: ${money(data.deposit_amount||deposit)} deposit, ${money(data.final_balance_amount||estimateTotal()-deposit)} balance.`,'good');rerender();}catch(e){toast(e.message||'Could not create Square draft.','bad');}finally{squareBusy=false;rerender();}}
function paymentLink(){return squareDraft?.processor_payment_url||squareDraft?.payment_links?.square||'';}
function openPaymentLink(){const url=paymentLink();if(!url)return toast('Publish the Square invoice first.','bad');window.open(url,'_blank','noopener');}
async function copyPaymentLink(){const url=paymentLink();if(!url)return toast('Publish the Square invoice first.','bad');try{await navigator.clipboard.writeText(url);toast('Customer payment link copied.','good');}catch{toast(url,'good');}}
async function publishSquare(){if(squareBusy||!squareDraft?.id)return;squareBusy=true;rerender();try{const {data,error}=await sb.functions.invoke('square-invoice',{body:{action:'publish',invoice_id:squareDraft.id}});if(error)throw new Error(error.message||'Could not publish Square invoice.');if(data?.error)throw new Error(data.error);squareDraft=await loadSquareDraft(context().job);rerender();toast(data?.payment_url?'Square payment link is ready.':'Square invoice published.','good');}catch(e){toast(e.message||'Could not publish Square invoice.','bad');}finally{squareBusy=false;rerender();}}
async function refreshSquare(){if(!squareDraft?.id)return;try{if(squareDraft.processor_metadata?.source==='square_import'){const data=await squareSyncRequest({action:'import_invoice',job_id:context().job.id,external_invoice_id:squareDraft.processor_metadata.square_invoice_id});squareDraft=data.invoice;rerender();toast('Square invoice refreshed.','good');return;}const {data,error}=await sb.functions.invoke('square-invoice',{body:{action:'status',invoice_id:squareDraft.id}});if(error)throw new Error(error.message||'Could not refresh Square status.');if(data?.error)throw new Error(data.error);squareDraft=await loadSquareDraft(context().job);rerender();toast(`Square invoice is ${String(data.status||'updated').replaceAll('_',' ')}.`,'good');}catch(e){toast(e.message||'Could not refresh Square status.','bad');}}
function posCallbackUrl(){const url=new URL('square-pos-callback.html',location.href);url.search='';url.hash='';return url.toString();}
function posUrl(data){const ua=navigator.userAgent||'';if(/android/i.test(ua))return data.android_url;if(/iphone|ipad|ipod/i.test(ua))return data.ios_url;return data.ios_url||data.android_url;}
async function takeTapPayment(){if(tapBusy)return;if(!(tapAmount()>0)){toast('This invoice has no collectible balance.','bad');return;}tapBusy=true;rerender();try{await save(true);const inv=await ensureTapInvoice();if(window.MobileMechanicJobPaperwork&&!(await window.MobileMechanicJobPaperwork.prepareCardSignature(inv.id,tapAmount())))return;const {data,error}=await sb.functions.invoke('square-invoice',{body:{action:'pos_checkout_link',invoice_id:inv.id,amount:tapAmount(),callback_url:posCallbackUrl(),note:`Mobile Mechanic AI job ${context().job?.customerName||''}`.trim()}});if(error)throw new Error(error.message||'Could not open Square POS.');if(data?.error)throw new Error(data.error);const url=posUrl(data);if(!url)throw new Error('Square did not return a POS link.');toast('Opening Square Point of Sale for tap payment.','good');location.href=url;}catch(e){toast(e.message||'Could not open Square POS.','bad');}finally{tapBusy=false;rerender();}}
function openHistory(){document.querySelector('[data-nxe-history-modal]')?.remove();const jobs=priorJobs(),wrap=document.createElement('div');wrap.className='nxe-history-modal';wrap.dataset.nxeHistoryModal='1';wrap.innerHTML=`<div class="nxe-history-card"><div class="nxe-history-head"><h3>Previous Jobs</h3><button class="nxe-history-close" type="button" data-nxe-history-close aria-label="Close">×</button></div>${jobs.length?jobs.map(j=>`<div class="nxe-history-row"><b>${esc(vehicleText(j.vehicle)||'Vehicle')} • ${esc(j.status||'Job')}</b><small>${esc(j.complaint||'No complaint saved.')}</small></div>`).join(''):'<div class="nxe-empty">No previous jobs for this customer or vehicle.</div>'}</div>`;document.body.appendChild(wrap);}
function closeHistory(){document.querySelector('[data-nxe-history-modal]')?.remove();}
function refreshInvoiceAmounts(){
  const root=document.querySelector('[data-next-invoice]');
  if(!root||!state||financialsLocked())return;
  const display=(key,amount)=>{const node=root.querySelector('[data-nxe-total="'+key+'"]');if(node)node.textContent=money(amount);};
  display('parts',partsTotal());display('labor',laborTotal());
  display('tax',taxTotal());display('travel',travelTotal());display('grand',estimateTotal());
  display('deposit',chosenDeposit());display('balance',Math.max(0,roundMoney(estimateTotal()-chosenDeposit())));
  for(const type of ['parts','labor'])for(const [index,line] of state[type].entries()){
    const node=root.querySelector('[data-nxe-line-total="'+type+'"][data-nxe-index="'+index+'"]');
    if(node)node.textContent=money(line.amount);
  }
}
function queueInvoiceSave(silent=true){
  saveQueue=saveQueue.catch(()=>{}).then(()=>save(silent));
  return saveQueue;
}
function editInvoiceField(el){
 if(!state||financialsLocked())return false;
 const index=Number(el.dataset.nxeIndex);
 const type=el.dataset.nxeType;
 if(el.matches('[data-nxe-name]')){if(state[type]?.[index])state[type][index].name=el.value;return true;}
 if(el.matches('[data-nxe-unit-price],[data-nxe-quantity]')){
  const part=state.parts[index];if(!part)return false;
  if(el.matches('[data-nxe-quantity]'))part.quantity=Math.max(1,Math.floor(Number(el.value)||1));
  else part.unit_price=el.value===''?null:roundMoney(Math.max(0,Number(el.value)||0));
  part.amount=part.unit_price===null?null:roundMoney(part.unit_price*part.quantity);
  return true;
 }
 if(el.matches('[data-nxe-flat-amount],[data-nxe-hours],[data-nxe-rate],[data-nxe-labor-kind]')){
  const line=state.labor[index];if(!line)return false;
  if(el.matches('[data-nxe-labor-kind]')){
   line.flat_fee=el.checked;
   if(line.flat_fee)line.amount=line.amount??null;
   else{line.hours=line.hours??null;line.rate=line.rate??shopRate();}
  }else if(el.matches('[data-nxe-flat-amount]'))line.amount=el.value===''?null:roundMoney(Math.max(0,Number(el.value)||0));
  else if(el.matches('[data-nxe-hours]'))line.hours=el.value===''?null:Math.max(0,Number(el.value)||0);
  else line.rate=el.value===''?shopRate():Math.max(0,Number(el.value)||0);
  recalc(line);return true;
 }
 if(el.matches('[data-nxe-tax-enabled]')){state.tax_enabled=el.checked;return true;}
 if(el.matches('[data-nxe-tax-rate]')){state.tax_rate=el.value===''?0:Math.min(100,Math.max(0,Number(el.value)||0));return true;}
 if(el.matches('[data-nxe-travel-enabled]')){state.travel_enabled=el.checked;return true;}
 if(el.matches('[data-nxe-travel-fee]')){state.travel_fee=el.value===''?0:roundMoney(Math.max(0,Number(el.value)||0));return true;}
 if(el.matches('[data-nxe-deposit-mode]')){state.deposit_mode=el.value;return true;}
 if(el.matches('[data-nxe-deposit-amount]')){if(state.deposit_mode==='percent')state.deposit_percent=el.value===''?null:Math.min(100,Math.max(0,Number(el.value)||0));else state.deposit_amount=el.value===''?null:roundMoney(Math.max(0,Number(el.value)||0));return true;}
 return false;
}
function bind(){
 document.addEventListener('input',e=>{
   const el=e.target;
   if(el.matches?.('[data-nxe-import-search]')){renderImportRows();return;}
   if(!el.closest?.('[data-next-invoice]')||el.matches('select,[type="checkbox"]'))return;
   if(editInvoiceField(el))refreshInvoiceAmounts();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeImport();});
 document.addEventListener('change',e=>{
  const el=e.target;
  if(!el.closest?.('[data-next-invoice]'))return;
  if(editInvoiceField(el)){
    if(el.matches('select,[type="checkbox"]'))rerender();
    else refreshInvoiceAmounts(); // Do not destroy the Save/Print button during blur.
    queueInvoiceSave(true).catch(()=>{});
  }
 },true);
 document.addEventListener('click',e=>{
  if(e.target.closest?.('[data-nxe-import-square],[data-nxe-import-reload]')){e.preventDefault();openImport();return;}
  if(e.target.closest?.('[data-nxe-import-close]')||e.target.matches?.('[data-nxe-import-modal]')){e.preventDefault();closeImport();return;}
  const imported=e.target.closest?.('[data-nxe-import-id]');if(imported){e.preventDefault();attachImport(imported.dataset.nxeImportId);return;}
  const a=e.target.closest?.('[data-nxe-add]');if(a){e.preventDefault();add(a.dataset.nxeAdd);return;}
  const r=e.target.closest?.('[data-nxe-remove]');if(r&&state&&!financialsLocked()){e.preventDefault();state[r.dataset.nxeType].splice(Number(r.dataset.nxeIndex),1);rerender();queueInvoiceSave(true).catch(()=>{});return;}
  if(e.target.closest?.('[data-nxe-save-draft]')){e.preventDefault();if(saving)return;saving=true;queueInvoiceSave(false).catch(()=>{}).finally(()=>{saving=false;});return;}
  if(e.target.closest?.('[data-nxe-create-square]')){e.preventDefault();createSquareDraft();return;}
  if(e.target.closest?.('[data-nxe-publish-square]')){e.preventDefault();publishSquare();return;}
  if(e.target.closest?.('[data-nxe-open-payment-link]')){e.preventDefault();openPaymentLink();return;}
  if(e.target.closest?.('[data-nxe-copy-payment-link]')){e.preventDefault();copyPaymentLink();return;}
  if(e.target.closest?.('[data-nxe-refresh-square]')){e.preventDefault();refreshSquare();return;}
  if(e.target.closest?.('[data-nxe-tap-square]')){e.preventDefault();takeTapPayment();return;}
  if(e.target.closest?.('[data-nxe-history]')){e.preventDefault();openHistory();return;}
  if(e.target.closest?.('[data-nxe-history-close]')){e.preventDefault();closeHistory();return;}
  if(e.target.matches?.('[data-nxe-history-modal]'))closeHistory();
 },true);
}
async function mount(){if(mounting||document.querySelector('[data-next-invoice]'))return;const {db,job}=context();if(db.session?.role!=='shop'||!job||!canManagePayments())return;const work=document.querySelector('[data-job-work-order]');if(!work)return;mounting=true;try{css();state=await load(job);squareDraft=await loadSquareDraft(job);if(!work.isConnected||String(context().job?.id)!==String(job.id)||document.querySelector('[data-next-invoice]'))return;work.insertAdjacentHTML('afterend',markup());}finally{mounting=false;}}
bind();new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{state=null;squareDraft=null;closeHistory();closeImport();setTimeout(mount,150);});setTimeout(mount,900);
})();
