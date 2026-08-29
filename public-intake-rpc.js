(() => {
  'use strict';
  const sb = window.MobileMechanicSupabase;
  if (!sb) return;

  function toast(message, type='') {
    document.querySelector('.public-intake-rpc-toast')?.remove();
    const d=document.createElement('div');
    d.className=`toast public-intake-rpc-toast ${type}`;
    d.textContent=message;
    document.body.appendChild(d);
    setTimeout(()=>d.remove(),4500);
  }

  async function submit(form) {
    const d=Object.fromEntries(new FormData(form));
    const button=document.querySelector('.customer-submit');
    if(button){button.disabled=true;button.textContent='SENDING…';}

    const vehicle={
      year:d.year?Number(d.year):null,
      make:d.make||null,
      model:d.model||null,
      submodel:d.trim||null,
      engine:d.engine||null,
      drivetrain:d.drive||null,
      vin:(d.vin||'').trim().toUpperCase()||null,
      license_plate:(d.plate||'').trim()||null,
      mileage:d.mileage?Number(d.mileage):null,
      request_type:d.requestType||'Repair / Diagnostic'
    };

    try {
      const {error}=await sb.rpc('submit_public_intake',{
        p_shop_id:form.dataset.shop,
        p_customer_name:d.customerName||'',
        p_phone:d.phone||null,
        p_email:d.email||null,
        p_address:d.location||null,
        p_availability:d.availability||null,
        p_current_location:d.location?{raw:d.location}:null,
        p_vehicle:vehicle,
        p_customer_states:d.complaint||''
      });
      if(error) throw error;

      const shopName=document.querySelector('.customer-shop b')?.textContent||'the shop';
      const body=document.querySelector('.customer-body');
      if(body) body.innerHTML=`<div class="customer-card" style="text-align:center"><h2>✓ Request sent to ${shopName}</h2><p>Your request was received.</p><p class="muted small">The shop will review it and contact you with the next step.</p></div>`;
      document.querySelector('.customer-footer')?.remove();
      toast('Customer intake sent successfully.','good');
    } catch(err) {
      if(button){button.disabled=false;button.textContent=`SEND TO ${(document.querySelector('.customer-shop b')?.textContent||'SHOP').toUpperCase()}`;}
      toast(err?.message||'Could not submit intake.','bad');
      console.error('Public intake RPC failed',err);
    }
  }

  document.addEventListener('submit',e=>{
    const form=e.target;
    if(form?.id!=='intakeForm' || form.dataset.public!=='true') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    submit(form);
  },true);
})();
