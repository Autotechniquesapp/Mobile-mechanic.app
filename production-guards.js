(() => {
'use strict';

function notice(message){
  document.querySelector('.production-guard-notice')?.remove();
  const d=document.createElement('div');
  d.className='toast production-guard-notice';
  d.textContent=message;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),4200);
}

function removeMechanicIntakeModules(){
  // Fleet, towing, and pre-purchase are customer intake request types,
  // not mechanic dashboard modules.
  ['fleet','roadside','inspection'].forEach(route=>{
    document.querySelectorAll(`[data-route="${route}"]`).forEach(el=>{
      if(el.closest('.customer-shell')) return;
      el.remove();
    });
  });
}

function intakeExtraFields(type){
  if(type==='Fleet Service'){
    return `
      <div class="row2">
        <div class="field"><label>Fleet / Company Name</label><input name="fleetCompany" placeholder="Company or fleet name"></div>
        <div class="field"><label>Unit Number</label><input name="fleetUnit" placeholder="Truck / van / unit #"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Driver / Contact</label><input name="fleetDriver" placeholder="Driver or contact name"></div>
        <div class="field"><label>Fleet Notes</label><input name="fleetNotes" placeholder="Diesel, semi, account notes, etc."></div>
      </div>`;
  }
  if(type==='Tow / Roadside'){
    return `
      <div class="row2">
        <div class="field"><label>Tow Destination</label><input name="towDestination" placeholder="Shop, home, dealer, etc."></div>
        <div class="field"><label>Vehicle Condition</label><select name="towCondition"><option value="">Select</option><option>Will not start</option><option>Will not move</option><option>Unsafe to drive</option><option>Accident / damage</option><option>Other</option></select></div>
      </div>
      <div class="field"><label>Tow / Roadside Notes</label><input name="towNotes" placeholder="Keys, access, parking, roadside details, etc."></div>`;
  }
  if(type==='Pre-Purchase Inspection'){
    return `
      <div class="row2">
        <div class="field"><label>Seller / Owner Name</label><input name="sellerName" placeholder="Seller or current owner"></div>
        <div class="field"><label>Seller Phone</label><input name="sellerPhone" type="tel" placeholder="Seller contact"></div>
      </div>
      <div class="field"><label>Vehicle / Seller Location</label><input name="ppiLocation" placeholder="Where the vehicle can be inspected"></div>`;
  }
  return '';
}

function renderIntakeExtras(form){
  if(!form || form.dataset.public!=='true') return;
  const selected=form.querySelector('input[name="requestType"]:checked')?.value || 'Repair / Diagnostic';
  let extra=form.querySelector('#customerRequestExtras');
  if(!extra){
    extra=document.createElement('section');
    extra.id='customerRequestExtras';
    extra.className='customer-card';
    const requestCard=[...form.querySelectorAll('.customer-card')].find(x=>x.querySelector('input[name="requestType"]'));
    requestCard?.insertAdjacentElement('afterend',extra);
  }
  if(!extra) return;
  const fields=intakeExtraFields(selected);
  extra.style.display=fields?'block':'none';
  extra.innerHTML=fields?`<h3>5 • ${selected} Details</h3>${fields}`:'';
}

function enhanceCustomerIntake(){
  const form=document.getElementById('intakeForm');
  if(!form || form.dataset.public!=='true' || form.dataset.intakeTypesEnhanced==='true') return;
  form.dataset.intakeTypesEnhanced='true';

  const requestCard=[...form.querySelectorAll('.customer-card')].find(x=>x.querySelector('input[name="requestType"]'));
  if(!requestCard) return;
  const row=requestCard.querySelector('.row2');
  if(!row) return;

  if(!form.querySelector('input[name="requestType"][value="Fleet Service"]')){
    row.insertAdjacentHTML('beforeend',`<label class="list-item"><input type="radio" name="requestType" value="Fleet Service"><div class="list-main"><b>Fleet Service</b><p>Fleet vehicle, unit, driver, or commercial service request.</p></div></label>`);
  }
  if(!form.querySelector('input[name="requestType"][value="Tow / Roadside"]')){
    row.insertAdjacentHTML('beforeend',`<label class="list-item"><input type="radio" name="requestType" value="Tow / Roadside"><div class="list-main"><b>Tow / Roadside</b><p>Vehicle disabled, unsafe to drive, or needs towing help.</p></div></label>`);
  }

  form.querySelectorAll('input[name="requestType"]').forEach(r=>r.addEventListener('change',()=>renderIntakeExtras(form)));
  renderIntakeExtras(form);
}

function appendSpecialIntakeDetails(form){
  if(!form || form.dataset.public!=='true') return;
  const type=form.querySelector('input[name="requestType"]:checked')?.value || 'Repair / Diagnostic';
  if(type==='Repair / Diagnostic') return;
  const complaint=form.querySelector('[name="complaint"]');
  if(!complaint) return;
  const fd=new FormData(form);
  const lines=[`Request Type: ${type}`];
  if(type==='Fleet Service'){
    if(fd.get('fleetCompany')) lines.push(`Fleet/Company: ${fd.get('fleetCompany')}`);
    if(fd.get('fleetUnit')) lines.push(`Unit: ${fd.get('fleetUnit')}`);
    if(fd.get('fleetDriver')) lines.push(`Driver/Contact: ${fd.get('fleetDriver')}`);
    if(fd.get('fleetNotes')) lines.push(`Fleet Notes: ${fd.get('fleetNotes')}`);
  }
  if(type==='Tow / Roadside'){
    if(fd.get('towDestination')) lines.push(`Tow Destination: ${fd.get('towDestination')}`);
    if(fd.get('towCondition')) lines.push(`Vehicle Condition: ${fd.get('towCondition')}`);
    if(fd.get('towNotes')) lines.push(`Tow Notes: ${fd.get('towNotes')}`);
  }
  if(type==='Pre-Purchase Inspection'){
    if(fd.get('sellerName')) lines.push(`Seller/Owner: ${fd.get('sellerName')}`);
    if(fd.get('sellerPhone')) lines.push(`Seller Phone: ${fd.get('sellerPhone')}`);
    if(fd.get('ppiLocation')) lines.push(`Inspection Location: ${fd.get('ppiLocation')}`);
  }
  if(!complaint.dataset.specialIntakeAdded){
    complaint.value=`${lines.join('\n')}\n\nCustomer Concern / Notes:\n${complaint.value}`;
    complaint.dataset.specialIntakeAdded='true';
  }
}

document.addEventListener('click',e=>{
  const plan=e.target.closest('[data-plan]');
  if(!plan)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  notice('Stripe billing is not connected yet. No subscription was charged or activated.');
},true);

document.addEventListener('submit',e=>{
  if(e.target?.id==='intakeForm') appendSpecialIntakeDetails(e.target);
},true);

const applyUiCorrections=()=>{
  removeMechanicIntakeModules();
  enhanceCustomerIntake();
};
new MutationObserver(applyUiCorrections).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',applyUiCorrections);
applyUiCorrections();
})();