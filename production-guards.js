(() => {
'use strict';

function ensureMarketingAssets(){
  if(!document.querySelector('link[data-mma-cardata-style]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='cardata-inspired-landing.css?v=20260906-1';
    link.dataset.mmaCardataStyle='1';
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-mma-cardata-script]')){
    const script=document.createElement('script');
    script.src='cardata-inspired-landing.js?v=20260906-1';
    script.dataset.mmaCardataScript='1';
    document.head.appendChild(script);
  }
}
ensureMarketingAssets();

function notice(message){
  document.querySelector('.production-guard-notice')?.remove();
  const d=document.createElement('div');
  d.className='toast production-guard-notice';
  d.textContent=message;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),5200);
}

function removeMechanicIntakeModules(){
  ['fleet','roadside','inspection'].forEach(route=>{
    document.querySelectorAll(`[data-route="${route}"]`).forEach(el=>{
      if(el.closest('.customer-shell')) return;
      el.remove();
    });
  });
}

function intakeCards(form){
  const cards=[...form.querySelectorAll('.customer-card')];
  return {
    customer:cards.find(c=>c.querySelector('[name="customerName"]')),
    vehicle:cards.find(c=>c.querySelector('[name="year"]') && c.querySelector('[name="make"]')),
    concern:cards.find(c=>c.querySelector('[name="complaint"]')),
    request:cards.find(c=>c.querySelector('input[name="requestType"]'))
  };
}

function appendPpiDetails(form){
  if(!form || form.dataset.public!=='true') return;
  const type=form.querySelector('input[name="requestType"]:checked')?.value || 'Repair / Diagnostic';
  const complaint=form.querySelector('[name="complaint"]');
  if(!complaint) return;

  if(type!=='Pre-Purchase Inspection'){
    complaint.required=true;
    return;
  }

  const fd=new FormData(form);
  const lines=['Request Type: Pre-Purchase Inspection'];
  if(fd.get('sellerName')) lines.push(`Seller/Owner: ${fd.get('sellerName')}`);
  if(fd.get('sellerPhone')) lines.push(`Seller Phone: ${fd.get('sellerPhone')}`);
  if(fd.get('ppiLocation')) lines.push(`Inspection Location: ${fd.get('ppiLocation')}`);
  if(fd.get('ppiNotes')) lines.push(`Customer Inspection Notes: ${fd.get('ppiNotes')}`);
  complaint.required=false;
  complaint.value=lines.join('\n');
}

function renderPpiExtras(form){
  if(!form || form.dataset.public!=='true') return;
  const selected=form.querySelector('input[name="requestType"]:checked')?.value || 'Repair / Diagnostic';
  let extra=form.querySelector('#customerRequestExtras');
  const {vehicle,concern,request}=intakeCards(form);
  const complaint=concern?.querySelector('[name="complaint"]');

  if(!extra){
    extra=document.createElement('section');
    extra.id='customerRequestExtras';
    extra.className='customer-card';
  }

  if(selected==='Pre-Purchase Inspection'){
    if(request && vehicle && request.nextElementSibling!==vehicle) request.insertAdjacentElement('afterend',vehicle);
    if(vehicle && extra.previousElementSibling!==vehicle) vehicle.insertAdjacentElement('afterend',extra);
    if(concern) concern.style.display='none';
    if(complaint) complaint.required=false;
    if(vehicle){
      const h=vehicle.querySelector('h3');
      if(h) h.textContent='3 • Vehicle You Want Inspected';
    }
    extra.style.display='block';
    extra.innerHTML=`<h3>4 • Pre-Purchase Inspection Details</h3>
      <div class="row2">
        <div class="field"><label>Seller / Owner Name</label><input name="sellerName" placeholder="Seller or current owner"></div>
        <div class="field"><label>Seller Phone</label><input name="sellerPhone" type="tel" placeholder="Seller contact"></div>
      </div>
      <div class="field"><label>Where is the vehicle?</label><input name="ppiLocation" placeholder="Address or location where the vehicle can be inspected"></div>
      <div class="field"><label>Anything you want checked specifically?</label><textarea name="ppiNotes" placeholder="Optional concerns, seller claims, noises, warning lights, or anything you want the mechanic to pay extra attention to"></textarea></div>`;
  } else {
    if(request && vehicle && request.nextElementSibling!==vehicle) request.insertAdjacentElement('afterend',vehicle);
    if(vehicle && concern && vehicle.nextElementSibling!==concern) vehicle.insertAdjacentElement('afterend',concern);
    if(concern) concern.style.display='block';
    if(complaint) complaint.required=true;
    if(vehicle){
      const h=vehicle.querySelector('h3');
      if(h) h.textContent='3 • Your Vehicle';
    }
    if(concern){
      const h=concern.querySelector('h3');
      if(h) h.textContent='4 • Vehicle Concern';
    }
    extra.style.display='none';
    extra.innerHTML='';
  }
}

function enhanceVinField(form){
  const vin=form.querySelector('[name="vin"]');
  if(!vin || vin.dataset.customerVinEnhanced==='1') return;
  vin.dataset.customerVinEnhanced='1';
  vin.placeholder='VIN (optional, 17 characters)';
  vin.autocapitalize='characters';
  vin.autocomplete='off';
  vin.spellcheck=false;
  const label=vin.closest('.field')?.querySelector('label');
  if(label) label.textContent='VIN (optional)';

  vin.addEventListener('input',()=>{
    const cleaned=vin.value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,17);
    if(vin.value!==cleaned) vin.value=cleaned;
  });

  const result=form.querySelector('#vinResult');
  if(result && !result.textContent.trim()){
    result.textContent='VIN is optional. Type or paste it if you have it. You do not have to decode the VIN to send the request.';
  }

  const scan=form.querySelector('[data-action="scan-placeholder"]');
  if(scan) scan.setAttribute('aria-label','Open camera to scan the VIN barcode');
}

function wireSubmitFeedback(form){
  if(form.querySelector('[data-intake-submit-proxy]')) return;
  const external=document.querySelector('.customer-footer .customer-submit[form="intakeForm"]');
  if(!external) return;

  const proxy=document.createElement('button');
  proxy.type='submit';
  proxy.hidden=true;
  proxy.className='customer-submit';
  proxy.dataset.intakeSubmitProxy='1';
  proxy.textContent=external.textContent;
  form.appendChild(proxy);

  const sync=()=>{
    external.disabled=proxy.disabled;
    external.textContent=proxy.textContent;
  };
  new MutationObserver(sync).observe(proxy,{attributes:true,childList:true,subtree:true,characterData:true});
  sync();
}

function enhanceCustomerIntake(){
  const form=document.getElementById('intakeForm');
  if(!form || form.dataset.public!=='true') return;

  wireSubmitFeedback(form);
  enhanceVinField(form);

  if(form.dataset.intakeTypesEnhanced==='true') return;
  form.dataset.intakeTypesEnhanced='true';

  const {customer,vehicle,request}=intakeCards(form);
  if(!request) return;

  if(customer && customer.nextElementSibling!==request) customer.insertAdjacentElement('afterend',request);

  const customerTitle=customer?.querySelector('h3');
  if(customerTitle) customerTitle.textContent='1 • Your Information';
  const requestTitle=request.querySelector('h3');
  if(requestTitle) requestTitle.textContent='2 • What do you need?';

  form.querySelectorAll('input[name="requestType"][value="Fleet Service"],input[name="requestType"][value="Tow / Roadside"]').forEach(input=>input.closest('label')?.remove());

  const repair=form.querySelector('input[name="requestType"][value="Repair / Diagnostic"]')?.closest('label');
  if(repair){
    const p=repair.querySelector('p');
    if(p) p.textContent='I need diagnosis or repair on my vehicle.';
  }
  const ppi=form.querySelector('input[name="requestType"][value="Pre-Purchase Inspection"]')?.closest('label');
  if(ppi){
    const p=ppi.querySelector('p');
    if(p) p.textContent='I want a vehicle inspected before I buy it.';
  }

  if(vehicle){
    const h=vehicle.querySelector('h3');
    if(h) h.textContent='3 • Your Vehicle';
  }

  form.querySelectorAll('input[name="requestType"]').forEach(r=>r.addEventListener('change',()=>renderPpiExtras(form)));
  renderPpiExtras(form);
}

function fieldLabel(el){
  return el?.closest('.field')?.querySelector('label')?.textContent?.trim() || el?.name || 'required field';
}

document.addEventListener('click',e=>{
  const submit=e.target.closest('.customer-submit[form="intakeForm"]');
  if(submit){
    const form=document.getElementById('intakeForm');
    if(form?.dataset.public==='true') appendPpiDetails(form);
    return;
  }

  const plan=e.target.closest('[data-plan]');
  if(!plan)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  notice('Stripe billing is not connected yet. No subscription was charged or activated.');
},true);

document.addEventListener('invalid',e=>{
  const el=e.target;
  const form=el?.form;
  if(form?.id!=='intakeForm' || form.dataset.public!=='true') return;
  notice(form.dataset.lang==='es'?`Complete el campo ${fieldLabel(el)} antes de enviar la solicitud.`:`Please fill in ${fieldLabel(el)} before sending the request.`);
},true);

document.addEventListener('submit',e=>{
  if(e.target?.id==='intakeForm') appendPpiDetails(e.target);
},true);

const applyUiCorrections=()=>{
  removeMechanicIntakeModules();
  enhanceCustomerIntake();
};
new MutationObserver(applyUiCorrections).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',applyUiCorrections);
applyUiCorrections();
})();
