(() => {
'use strict';

const EDGE_URL='https://rapcejqlydedceegbcrs.supabase.co/functions/v1/customer-estimate';
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function vehicleText(v={}){return [v.year,v.make,v.model,v.submodel].filter(Boolean).join(' ');}
function toast(message,type=''){
  document.querySelector('.estimate-public-toast')?.remove();
  const d=document.createElement('div');d.className=`toast estimate-public-toast ${type}`;d.textContent=message;document.body.appendChild(d);setTimeout(()=>d.remove(),4500);
}
async function edge(action,payload={}){
  const r=await fetch(EDGE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
  let body={};try{body=await r.json();}catch{}
  if(!r.ok)throw new Error(body.error||'Estimate service request failed.');
  return body.data;
}
function logo(shop={}){
  if(shop.logo_url)return `<img src="${esc(shop.logo_url)}" alt="${esc(shop.name||'Shop')} logo">`;
  return `<div style="width:52px;height:52px;border-radius:14px;background:#0b0d10;border:1px solid #ef2a31;display:grid;place-items:center;font-weight:900;color:white">MM<span style="color:#ef2a31">AI</span></div>`;
}
function optionCards(estimate={},pending=true,selected=''){
  return Object.entries(estimate).map(([key,o])=>`<label class="estimate-card ${esc(key)}" style="position:relative;cursor:${pending?'pointer':'default'}">${pending?`<input type="radio" name="edgeCustomerOption" value="${esc(key)}" style="position:absolute;right:12px;top:12px">`:''}<b>${esc(o?.title||key)}</b><strong>${money(o?.price)}</strong><p>${esc(o?.summary||'')}</p>${!pending&&selected===key?'<span class="badge green">Selected</span>':''}</label>`).join('');
}
function message(title,text){document.getElementById('app').innerHTML=`<section class="customer-shell"><div class="customer-frame"><div class="customer-body" style="padding:30px"><div class="customer-card" style="text-align:center"><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div></div></section>`;}
function render(data,token){
  const root=document.getElementById('app'),shop=data.shop||{},customer=data.customer||{},vehicle=data.vehicle||{},estimate=data.estimate||{},status=data.status||'pending',pending=status==='pending';
  const expires=data.expires_at?new Date(data.expires_at).toLocaleString():'';
  root.innerHTML=`<section class="customer-shell"><div class="customer-frame"><header class="customer-top">${logo(shop)}<div><h1>Mobile <span>Mechanic</span> AI</h1><p>Secure Estimate Approval</p></div><div class="customer-shop"><b>${esc(shop.name||'Repair Shop')}</b><span>${esc(shop.phone||'')}</span></div></header><div class="customer-body"><div class="customer-alert">✓ <div><b>Estimate version ${esc(data.version)}</b><br>${pending?`Secure link expires ${esc(expires)}.`:`Status: ${esc(status)}.`}</div></div><section class="customer-card"><h3>Vehicle</h3><h2>${esc(vehicleText(vehicle)||'Vehicle')}</h2><p class="muted small">Customer: ${esc(customer.name||'')}</p></section><section class="customer-card"><h3>${pending?'Choose Your Repair Option':'Estimate Options'}</h3><div class="estimate-options">${optionCards(estimate,pending,data.selected_option||'')}</div></section>${pending?`<section class="customer-card"><h3>Authorization</h3><div class="field"><label>Your Name</label><input id="edgeCustomerName" value="${esc(customer.name||'')}" autocomplete="name"></div><label class="list-item"><input type="checkbox" id="edgeApprovalCheck"><div class="list-main"><b>I approve the selected repair option</b><p>This approval applies only to estimate version ${esc(data.version)} and the selected scope/price shown above. A later change requires a revised authorization.</p></div></label><div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="edgeApprove">Approve Selected Repair</button><button class="btn btn-soft" id="edgeDecline">Decline All / Contact Shop</button></div></section>`:`<section class="customer-card" style="text-align:center"><h2>${status==='approved'?'✓ Repair Approved':status==='declined'?'Estimate Declined':status==='expired'?'Estimate Link Expired':'Estimate No Longer Active'}</h2>${status==='approved'&&data.selected_option?`<p>Selected: <b>${esc(estimate[data.selected_option]?.title||data.selected_option)} — ${money(estimate[data.selected_option]?.price)}</b></p>`:'<p>Contact the shop if you need a new estimate.</p>'}${data.decision_at?`<p class="small muted">Recorded ${esc(new Date(data.decision_at).toLocaleString())}</p>`:''}</section>`}</div></div></section>`;
  if(pending){document.getElementById('edgeApprove').onclick=()=>decide(token,'approved');document.getElementById('edgeDecline').onclick=()=>decide(token,'declined');}
}
async function decide(token,decision){
  const approved=decision==='approved',option=document.querySelector('input[name="edgeCustomerOption"]:checked')?.value||null,name=document.getElementById('edgeCustomerName')?.value.trim()||'';
  if(approved&&!option)return toast('Choose Good, Better, or Best first.','bad');
  if(approved&&!document.getElementById('edgeApprovalCheck')?.checked)return toast('Check the authorization box first.','bad');
  document.querySelectorAll('#edgeApprove,#edgeDecline').forEach(b=>b.disabled=true);
  try{await edge('decision',{token,decision,option,customerName:name||null});const data=await edge('get',{token});render(data,token);}catch(err){document.querySelectorAll('#edgeApprove,#edgeDecline').forEach(b=>b.disabled=false);toast(err.message||'Could not save your decision.','bad');}
}

window.MobileMechanicEstimatePublic=async function(){
  const token=new URLSearchParams(location.search).get('approve');if(!token)return false;
  window.MobileMechanicPublicHandled=true;message('Loading estimate','Verifying the secure estimate link…');
  try{const data=await edge('get',{token});if(!data){message('Estimate link not found','This link is invalid or no longer available. Ask the shop to send a new estimate.');return true;}render(data,token);}catch(err){message('Estimate unavailable',err.message||'The secure estimate could not be loaded.');}
  return true;
};

})();