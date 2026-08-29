(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
let busy=false;

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function ctx(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));return {db,shop,job};}
function toast(msg,type=''){document.querySelector('.aiq-toast')?.remove();const d=document.createElement('div');d.className=`toast aiq-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5200);}
async function invoke(fn,body){if(!sb)throw new Error('App connection is not ready.');const {data,error}=await sb.functions.invoke(fn,{body});if(error)throw new Error(error.message||'Request failed.');if(data?.error)throw new Error(data.error);return data;}
function approvalUrl(token){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('approve',token);return u.toString();}
function cleanPhone(v=''){const raw=String(v).trim();const plus=raw.startsWith('+')?'+':'';return plus+raw.replace(/\D/g,'');}
function nativeSms(to,text){const phone=cleanPhone(to);if(!phone)throw new Error('Customer phone number is missing.');location.href=`sms:${phone}?body=${encodeURIComponent(text)}`;}

function css(){if(document.getElementById('aiq-style'))return;const s=document.createElement('style');s.id='aiq-style';s.textContent=`
.aiq-panel{margin:14px 0;border:1px solid #5c2227;background:#11161c;border-radius:14px;padding:14px;box-shadow:0 0 18px rgba(239,42,49,.08)}
.aiq-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.aiq-head b{font-size:13px}.aiq-head span{font-size:10px;color:#929ca8}
.aiq-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}.aiq-grid .field{margin:0}.aiq-grid textarea{min-height:74px}
.aiq-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.aiq-actions .btn{flex:1 1 150px}
.aiq-options{display:grid;gap:9px;margin-top:12px}.aiq-option{border:1px solid #303a45;border-radius:11px;padding:10px;background:#0b0f14}.aiq-option-top{display:grid;grid-template-columns:1fr 130px;gap:8px}.aiq-option textarea{width:100%;min-height:70px;margin-top:8px}.aiq-option input,.aiq-panel input,.aiq-panel textarea{background:#080c10;color:#f5f6f8;border:1px solid #303945;border-radius:8px;padding:9px 10px;outline:none}.aiq-option input:focus,.aiq-panel input:focus,.aiq-panel textarea:focus{border-color:#b52b31}.aiq-breakdown{font-size:9px;color:#8f99a5;margin-top:5px}.aiq-warning{font-size:10px;color:#ffb9bc;border-left:3px solid #ef2a31;padding:7px 9px;margin-top:10px;background:#1a1012;border-radius:7px}.aiq-sms{margin-top:12px;padding-top:12px;border-top:1px solid #2a323b}.aiq-sms textarea{width:100%;min-height:70px}
@media(max-width:620px){.aiq-grid{grid-template-columns:1fr}.aiq-option-top{grid-template-columns:1fr 110px}.aiq-actions .btn{flex:1 1 100%}}
`;document.head.appendChild(s);}

function panelMarkup(job){return `<section class="aiq-panel" data-aiq-panel>
  <div class="aiq-head"><div><b>AI QUOTE + CUSTOMER SMS</b><br><span>Mechanic review required before anything is sent.</span></div><span class="badge red">DRAFT ONLY</span></div>
  <div class="aiq-grid">
    <div class="field"><label>Known parts cost (optional)</label><input inputmode="decimal" data-aiq-parts placeholder="0.00"></div>
    <div class="field"><label>Extra quote notes (optional)</label><textarea data-aiq-notes placeholder="Example: customer requested OEM option, include coolant, 2.5 labor hours already verified..."></textarea></div>
  </div>
  <div class="aiq-actions"><button class="btn btn-primary" type="button" data-aiq-generate>Generate AI Quote</button></div>
  <div data-aiq-results></div>
  <div class="aiq-sms">
    <div class="field"><label>Quick SMS to customer</label><textarea data-aiq-sms-text>${esc(`Hi ${job?.customerName||''}, this is your mechanic. I'll send your estimate here when it's ready.`)}</textarea></div>
    <div class="aiq-actions"><button class="btn btn-soft" type="button" data-aiq-text-customer>Text Customer</button></div>
  </div>
</section>`;}

function findMount(){const send=document.querySelector('[data-action="send-estimate"]');if(!send)return null;return send.closest('section,.card,[class*="card"]')||send.parentElement;}
function mount(){css();const {db,job}=ctx();if(db.session?.role!=='shop'||!job||document.querySelector('[data-aiq-panel]'))return;const target=findMount();if(!target)return;target.insertAdjacentHTML('beforebegin',panelMarkup(job));}

function optionHtml(key,o,b={}){return `<div class="aiq-option" data-aiq-option="${key}"><div class="aiq-option-top"><input data-aiq-title value="${esc(o?.title||key)}"><input data-aiq-price inputmode="decimal" value="${Number(o?.price||0).toFixed(2)}"></div><textarea data-aiq-summary>${esc(o?.summary||'')}</textarea><div class="aiq-breakdown">AI draft: labor ${Number(b.hours||0).toFixed(1)} hr • parts cost ${money(b.parts_cost)} • marked parts ${money(b.marked_parts)} • labor ${money(b.labor)} • travel ${money(b.travel)} • tax ${money(b.tax)}</div></div>`;}
function renderDraft(data){const root=document.querySelector('[data-aiq-results]');if(!root)return;root.innerHTML=`<div class="aiq-warning">${esc(data.warning||'AI-generated draft. Verify scope, labor, parts pricing, tax and totals before sending.')}</div><div class="aiq-options">${['good','better','best'].map(k=>optionHtml(k,data.estimate?.[k],data.breakdown?.[k])).join('')}</div><div class="aiq-actions"><button class="btn btn-soft" type="button" data-aiq-save>Save Draft</button><button class="btn btn-primary" type="button" data-aiq-save-text>Save + Text Estimate</button></div>`;}
function collect(){const out={};for(const el of document.querySelectorAll('[data-aiq-option]')){const k=el.dataset.aiqOption;out[k]={title:el.querySelector('[data-aiq-title]')?.value.trim()||k,price:Number(el.querySelector('[data-aiq-price]')?.value||0),summary:el.querySelector('[data-aiq-summary]')?.value.trim()||''};}return out;}
async function generate(){if(busy)return;const {job}=ctx();if(!job)return toast('Open a job first.','bad');busy=true;const b=document.querySelector('[data-aiq-generate]');if(b){b.disabled=true;b.textContent='Generating…';}try{const parts=document.querySelector('[data-aiq-parts]')?.value||'',notes=document.querySelector('[data-aiq-notes]')?.value||'';const d=await invoke('ai-quote',{action:'generate',job_id:job.id,parts_cost:parts,notes});renderDraft(d);toast('AI quote draft created. Review it before saving.','good');}catch(err){toast(err.message||'AI quote failed.','bad');}finally{busy=false;if(b){b.disabled=false;b.textContent='Generate AI Quote';}}}
async function saveDraft(){const {job}=ctx();const estimate=collect();if(!job||!estimate.good)return null;await invoke('ai-quote',{action:'save',job_id:job.id,estimate});return estimate;}
async function createLink(estimate){const {shop,job}=ctx();if(!shop||!job)throw new Error('Open a valid job first.');const {data,error}=await sb.rpc('create_customer_estimate_link',{p_job_id:job.id,p_estimate:estimate,p_expires_hours:168});if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(!row?.token)throw new Error('Secure estimate link was not created.');return {url:approvalUrl(row.token),version:row.estimate_version};}
async function sendSms(to,text){try{const d=await invoke('integration-actions',{action:'twilio.send_sms',to,text});toast('SMS sent to customer.','good');return {sent:true,provider:'twilio',data:d};}catch(err){nativeSms(to,text);toast('Automatic SMS is not connected yet, so I opened your phone Messages app with the text filled in.','');return {sent:false,provider:'device',error:err?.message||''};}}
async function saveOnly(){if(busy)return;busy=true;try{await saveDraft();toast('AI quote saved to this job.','good');setTimeout(()=>location.reload(),700);}catch(err){toast(err.message||'Could not save quote.','bad');}finally{busy=false;}}
async function saveAndText(){if(busy)return;busy=true;try{const {shop,job}=ctx();if(!job?.phone)throw new Error('Customer phone number is missing.');const estimate=await saveDraft();const link=await createLink(estimate);const vehicle=[job.vehicle?.year,job.vehicle?.make,job.vehicle?.model].filter(Boolean).join(' ');const text=`${shop?.name||'Your mechanic'} estimate${vehicle?` for ${vehicle}`:''}: ${link.url}`;await sendSms(job.phone,text);}catch(err){toast(err.message||'Could not text estimate.','bad');}finally{busy=false;}}
async function quickText(){if(busy)return;const {job}=ctx();if(!job?.phone)return toast('Customer phone number is missing.','bad');const text=document.querySelector('[data-aiq-sms-text]')?.value.trim();if(!text)return toast('Enter a message first.','bad');busy=true;try{await sendSms(job.phone,text);}catch(err){toast(err.message||'Could not open SMS.','bad');}finally{busy=false;}}

document.addEventListener('click',e=>{if(e.target.closest('[data-aiq-generate]')){e.preventDefault();generate();return;}if(e.target.closest('[data-aiq-save]')){e.preventDefault();saveOnly();return;}if(e.target.closest('[data-aiq-save-text]')){e.preventDefault();saveAndText();return;}if(e.target.closest('[data-aiq-text-customer]')){e.preventDefault();quickText();}},true);
new MutationObserver(()=>mount()).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,80));
setTimeout(mount,700);
})();
