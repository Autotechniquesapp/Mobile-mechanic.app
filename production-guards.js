(() => {
'use strict';

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

function renderPpiExtras(form){
  if(!form || form.dataset.public!=='true') return;
  const selected=form.querySelector('input[name="requestType"]:checked')?.value || 'Repair / Diagnostic';
  let extra=form.querySelector('#customerRequestExtras');
  const {vehicle,concern,request}=intakeCards(form);

  if(!extra){
    extra=document.createElement('section');
    extra.id='customerRequestExtras';
    extra.className='customer-card';
  }

  if(selected==='Pre-Purchase Inspection'){
    if(request && vehicle && request.nextElementSibling!==vehicle) request.insertAdjacentElement('afterend',vehicle);
    if(vehicle && extra.previousElementSibling!==vehicle) vehicle.insertAdjacentElement('afterend',extra);
    if(concern) concern.style.display='none';
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

function enhanceCustomerIntake(){
  const form=document.getElementById('intakeForm');
  if(!form || form.dataset.public!=='true' || form.dataset.intakeTypesEnhanced==='true') return;
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

function appendPpiDetails(form){
  if(!form || form.dataset.public!=='true') return;
  const type=form.querySelector('input[name="requestType"]:checked')?.value || 'Repair / Diagnostic';
  if(type!=='Pre-Purchase Inspection') return;
  const complaint=form.querySelector('[name="complaint"]');
  if(!complaint) return;
  const fd=new FormData(form);
  const lines=['Request Type: Pre-Purchase Inspection'];
  if(fd.get('sellerName')) lines.push(`Seller/Owner: ${fd.get('sellerName')}`);
  if(fd.get('sellerPhone')) lines.push(`Seller Phone: ${fd.get('sellerPhone')}`);
  if(fd.get('ppiLocation')) lines.push(`Inspection Location: ${fd.get('ppiLocation')}`);
  if(fd.get('ppiNotes')) lines.push(`Customer Inspection Notes: ${fd.get('ppiNotes')}`);
  complaint.required=false;
  complaint.value=lines.join('\n');
}

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