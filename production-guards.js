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
  ['fleet','roadside','inspection'].forEach(route=>{
    document.querySelectorAll(`[data-route="${route}"]`).forEach(el=>{
      if(el.closest('.customer-shell')) return;
      el.remove();
    });
  });
}

function renderPpiExtras(form){
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
  if(selected!=='Pre-Purchase Inspection'){
    extra.style.display='none';
    extra.innerHTML='';
    return;
  }
  extra.style.display='block';
  extra.innerHTML=`<h3>5 • Pre-Purchase Inspection Details</h3>
    <div class="row2">
      <div class="field"><label>Seller / Owner Name</label><input name="sellerName" placeholder="Seller or current owner"></div>
      <div class="field"><label>Seller Phone</label><input name="sellerPhone" type="tel" placeholder="Seller contact"></div>
    </div>
    <div class="field"><label>Where is the vehicle?</label><input name="ppiLocation" placeholder="Address or location where the vehicle can be inspected"></div>`;
}

function enhanceCustomerIntake(){
  const form=document.getElementById('intakeForm');
  if(!form || form.dataset.public!=='true' || form.dataset.intakeTypesEnhanced==='true') return;
  form.dataset.intakeTypesEnhanced='true';

  const requestCard=[...form.querySelectorAll('.customer-card')].find(x=>x.querySelector('input[name="requestType"]'));
  if(!requestCard) return;
  const title=requestCard.querySelector('h3');
  if(title) title.textContent='4 • What do you need?';

  // For now the customer chooses only normal repair/diagnostic or pre-purchase inspection.
  form.querySelectorAll('input[name="requestType"][value="Fleet Service"],input[name="requestType"][value="Tow / Roadside"]').forEach(input=>input.closest('label')?.remove());

  const ppi=form.querySelector('input[name="requestType"][value="Pre-Purchase Inspection"]')?.closest('label');
  if(ppi){
    const p=ppi.querySelector('p');
    if(p) p.textContent='Inspection of a vehicle before you buy it.';
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
  if(!complaint.dataset.specialIntakeAdded){
    complaint.value=`${lines.join('\n')}\n\nCustomer Notes:\n${complaint.value}`;
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