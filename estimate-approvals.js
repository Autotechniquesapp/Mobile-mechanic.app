(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function readCache(){try{return JSON.parse(localStorage.getItem(DBKEY))||{};}catch{return {};}}
function getWorkspace(){const db=readCache(),sid=db.session?.shopId;return {db,shop:sid?db.shops?.[sid]:null};}
function vehicleText(v={}){return [v.year,v.make,v.model,v.trim||v.submodel].filter(Boolean).join(' ');}
function showStatus(message,type=''){
  document.querySelector('.estimate-toast')?.remove();
  const d=document.createElement('div');d.className=`toast estimate-toast ${type}`;d.textContent=message;document.body.appendChild(d);setTimeout(()=>d.remove(),5000);
}
function calculateEstimate(job,shop){
  if(job?.estimate)return job.estimate;
  const rate=Number(shop?.settings?.laborRate||75),partsMarkup=Number(shop?.settings?.partsMarkup||0),travel=Number(shop?.settings?.travelFee||0),taxRate=Number(shop?.settings?.taxRate||0);
  const calc=(parts,hours,mult=1)=>{const marked=parts*(1+partsMarkup/100),sub=marked+hours*rate+travel,tax=sub*taxRate/100;return Math.round((sub+tax)*mult*100)/100;};
  return {
    good:{title:'Good',price:calc(85,1.5,.9),summary:'Minimum appropriate repair based on confirmed findings.'},
    better:{title:'Better',price:calc(85*1.45,1.9,1),summary:'Recommended repair with related service items.'},
    best:{title:'Best',price:calc(85*2,2.3,1.02),summary:'Complete repair / preventive package where appropriate.'}
  };
}
function approvalUrl(token){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('approve',token);return u.toString();}

async function sendSecureEstimate(button){
  const sb=window.MobileMechanicSupabase;if(!sb)return showStatus('Secure estimate service is not ready.','bad');
  const {shop}=getWorkspace(),job=shop?.jobs?.find(j=>j.id===button.dataset.job);if(!shop||!job)return showStatus('Open a valid job before sending an estimate.','bad');
  const estimate=calculateEstimate(job,shop);button.disabled=true;
  try{
    const {data,error}=await sb.rpc('create_customer_estimate_link',{p_job_id:job.id,p_estimate:estimate,p_expires_hours:168});
    if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;if(!row?.token)throw new Error('Estimate link was not created.');
    const url=approvalUrl(row.token),text=`${shop.name} estimate for ${vehicleText(job.vehicle)}. Review and approve your repair option: ${url}`;
    if(navigator.share){try{await navigator.share({title:`Estimate from ${shop.name}`,text,url});}catch(err){if(err?.name!=='AbortError')throw err;}}
    else if(navigator.clipboard){await navigator.clipboard.writeText(text);showStatus(`Secure estimate v${row.estimate_version} copied. Link expires in 7 days.`,'good');}
    else showLinkModal(url,row.estimate_version);
  }catch(err){showStatus(err.message||'Could not create secure estimate link.','bad');}
  finally{button.disabled=false;}
}
function showLinkModal(url,version){
  const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>Secure Estimate v${esc(version)}</h2><button class="close-btn" type="button">×</button></div><p class="small muted">Send this link to the customer. It expires in 7 days and older pending links are automatically revoked.</p><div class="field"><input readonly value="${esc(url)}"></div></div>`;document.body.appendChild(wrap);wrap.querySelector('.close-btn').onclick=()=>wrap.remove();
}

// Register before supabase-production.js so this secure handler wins over the old prototype blocker.
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action="send-estimate"]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();sendSecureEstimate(b);
},true);

function logoMarkup(shop={}){
  if(shop.logo_url)return `<img src="${esc(shop.logo_url)}" alt="${esc(shop.name||'Shop')} logo">`;
  return `<div style="width:52px;height:52px;border-radius:14px;background:#0b0d10;border:1px solid #ef2a31;display:grid;place-items:center;font-weight:900;color:#fff">MM<span style="color:#ef2a31">AI</span></div>`;
}
function optionCards(estimate={},disabled=false,selected=''){
  return Object.entries(estimate).map(([key,o])=>`<label class="estimate-card ${esc(key)}" style="cursor:${disabled?'default':'pointer'};position:relative">
    ${disabled?'':`<input type="radio" name="customerOption" value="${esc(key)}" ${selected===key?'checked':''} style="position:absolute;right:12px;top:12px">`}
    <b>${esc(o?.title||key)}</b><strong>${money(o?.price)}</strong><p>${esc(o?.summary||'')}</p>
  </label>`).join('');
}
function renderMessage(title,text){
  const root=document.getElementById('app');root.innerHTML=`<section class="customer-shell"><div class="customer-frame"><div class="customer-body" style="padding:30px"><div class="customer-card" style="text-align:center"><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div></div></section>`;
}
function renderEstimate(data,token){
  const root=document.getElementById('app'),shop=data.shop||{},customer=data.customer||{},vehicle=data.vehicle||{},estimate=data.estimate||{},status=data.status||'pending';
  const vehicleName=vehicleText(vehicle),pending=status==='pending',approved=status==='approved',declined=status==='declined';
  const expires=data.expires_at?new Date(data.expires_at).toLocaleString():'';
  root.innerHTML=`<section class="customer-shell"><div class="customer-frame">
    <header class="customer-top">${logoMarkup(shop)}<div><h1>Mobile <span>Mechanic</span> AI</h1><p>Secure Estimate Approval</p></div><div class="customer-shop"><b>${esc(shop.name||'Repair Shop')}</b><span>${esc(shop.phone||'')}</span></div></header>
    <div class="customer-body">
      <div class="customer-alert">✓ <div><b>Estimate version ${esc(data.version)}</b><br>${pending?`This secure link expires ${esc(expires)}.`:`Decision status: ${esc(status)}.`}</div></div>
      <section class="customer-card"><h3>Vehicle / Request</h3><h2>${esc(vehicleName||'Vehicle')}</h2><p class="muted small">Customer: ${esc(customer.name||'')}</p></section>
      <section class="customer-card"><h3>${pending?'Choose Your Repair Option':'Estimate Options'}</h3><div class="estimate-options">${optionCards(estimate,!pending,data.selected_option||'')}</div></section>
      ${pending?`<section class="customer-card"><h3>Authorization</h3><div class="field"><label>Your Name</label><input id="secureApproveName" value="${esc(customer.name||'')}" autocomplete="name"></div><label class="list-item"><input id="secureApproveCheck" type="checkbox"><div class="list-main"><b>I authorize the selected repair option</b><p>I understand this approval applies to estimate version ${esc(data.version)} and the selected price/scope shown above. Any later price or scope change requires a revised authorization.</p></div></label><div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="secureApproveBtn">Approve Selected Repair</button><button class="btn btn-soft" id="secureDeclineBtn">Decline All / Contact Shop</button></div></section>`:`<section class="customer-card" style="text-align:center"><h2>${approved?'✓ Repair Approved':declined?'Estimate Declined':status==='expired'?'Estimate Link Expired':'Estimate No Longer Active'}</h2><p>${approved&&data.selected_option?`Selected option: <b>${esc(estimate[data.selected_option]?.title||data.selected_option)} — ${money(estimate[data.selected_option]?.price)}</b>`:'Contact the shop if you need another estimate link.'}</p>${data.decision_at?`<p class="small muted">Recorded ${esc(new Date(data.decision_at).toLocaleString())}</p>`:''}</section>`}
    </div>
  </div></section>`;
  if(pending){
    document.getElementById('secureApproveBtn').onclick=()=>submitDecision(token,'approved');
    document.getElementById('secureDeclineBtn').onclick=()=>submitDecision(token,'declined');
  }
}
async function submitDecision(token,decision){
  const sb=window.MobileMechanicSupabase;if(!sb)return;
  const approve=decision==='approved',option=document.querySelector('input[name="customerOption"]:checked')?.value||null,name=document.getElementById('secureApproveName')?.value.trim()||'';
  if(approve&&!option)return showStatus('Choose Good, Better, or Best first.','bad');
  if(approve&&!document.getElementById('secureApproveCheck')?.checked)return showStatus('Check the authorization box first.','bad');
  const buttons=document.querySelectorAll('#secureApproveBtn,#secureDeclineBtn');buttons.forEach(b=>b.disabled=true);
  try{
    const {error}=await sb.rpc('submit_customer_estimate_decision',{p_token:token,p_decision:decision,p_option:option,p_customer_name:name||null});if(error)throw error;
    const {data:updated,error:readError}=await sb.rpc('get_customer_estimate',{p_token:token});if(readError)throw readError;renderEstimate(updated,token);
  }catch(err){buttons.forEach(b=>b.disabled=false);showStatus(err.message||'Could not record your decision.','bad');}
}

window.MobileMechanicEstimatePublic=async function(){
  const token=new URLSearchParams(location.search).get('approve');if(!token)return false;
  window.MobileMechanicPublicHandled=true;
  const sb=window.MobileMechanicSupabase;if(!sb){renderMessage('Estimate unavailable','The secure estimate service could not load.');return true;}
  renderMessage('Loading estimate','Verifying the secure estimate link…');
  try{
    const {data,error}=await sb.rpc('get_customer_estimate',{p_token:token});if(error)throw error;
    if(!data){renderMessage('Estimate link not found','This link is invalid or no longer available. Ask the shop to send a new estimate.');return true;}
    renderEstimate(data,token);
  }catch(err){renderMessage('Estimate unavailable',err.message||'The secure estimate could not be loaded.');}
  return true;
};

})();