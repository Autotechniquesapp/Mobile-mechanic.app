(() => {
'use strict';
const methods={cash:'Cash',zelle:'Zelle',cash_app:'Cash App'},key='mobile_mechanic_ai_approved_v7';
let busy=false,dialog=null;
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(){try{const db=JSON.parse(localStorage.getItem(key)||'{}'),s=db.session||{},u=db.shops?.[s.shopId]?.users?.find(x=>x.id===s.userId);return {sid:s.shopId,jobId:s.activeJobId,allowed:s.role==='shop'&&u?.active!==false&&['owner','shop_owner','manager','service_writer'].includes(u?.role)};}catch{return {};}}
function mount(){
 const root=document.querySelector('[data-next-invoice]');if(!root||!context().allowed)return;
 const inv=window.MobileMechanicInvoiceEditor?.current?.(),meta=inv?.processor_metadata||{};
 const signature=JSON.stringify([inv?.id,inv?.status,inv?.total,meta.total_paid,meta.manual_payments]);
 const old=root.querySelector('[data-manual-payment-panel]');if(old?.dataset.signature===signature)return;
 old?.remove();const paid=Number(meta.total_paid||0),balance=Math.max(0,Number(inv?.total||0)-paid);
 const closed=['paid','void','cancelled','canceled','refunded','partially_refunded'].includes(String(inv?.status||''));
 const card=document.createElement('section');card.className='nxe-payment';card.dataset.manualPaymentPanel='1';card.dataset.signature=signature;
 card.innerHTML=`<b>Record a payment received</b>${inv?`<small>${money(paid)} paid · ${money(balance)} remaining</small>`:''}${closed?'':`<div class="btn-row">${Object.entries(methods).map(([id,label])=>`<button type="button" class="btn btn-primary" data-manual-payment-method="${id}">${label}</button>`).join('')}</div>`}<small>Record money you already received. This does not charge the customer.</small>${(meta.manual_payments||[]).map(p=>`<p>${esc(methods[p.method]||p.method)} · ${money(p.amount)} · ${esc(new Date(p.paid_at).toLocaleString())}</p>`).join('')}${meta.square_invoice_id&&Number(meta.manual_total_paid)>0?'<small>Recorded in this app. Update this invoice in Square separately before collecting or sending another payment request.</small>':''}`;
 root.querySelector('.nxe-title')?.insertAdjacentElement('afterend',card);
}
function close(){if(busy)return;document.querySelector('[data-manual-payment-modal]')?.remove();dialog=null;}
async function open(method){
 if(busy||!methods[method]||!context().allowed)return;
 busy=true;const captured=context();
 try{
  await window.MobileMechanicInvoiceEditor?.flushSave?.();
  if(context().sid!==captured.sid||context().jobId!==captured.jobId)throw new Error('Job changed. Reopen the invoice.');
  const inv=window.MobileMechanicInvoiceEditor?.current?.();
  if(!inv?.id)throw new Error('Enter and save the invoice charges first.');
  const balance=Math.round((Number(inv.total)-Number(inv.processor_metadata?.total_paid||0))*100)/100;
  if(!(balance>0)||['paid','void','cancelled','canceled','refunded','partially_refunded'].includes(inv.status))throw new Error('This invoice is paid or closed.');
  document.querySelector('[data-manual-payment-modal]')?.remove();
  dialog={...captured,invoiceId:inv.id,method,balance,requestId:crypto.randomUUID()};
  document.body.insertAdjacentHTML('beforeend',`<div class="nxe-history-modal" data-manual-payment-modal><form class="nxe-history-card" data-manual-payment-form role="dialog" aria-modal="true" aria-label="Record ${methods[method]} payment"><h3>${methods[method]} payment received</h3><label>Amount received ($)<input name="amount" type="number" inputmode="decimal" min="0.01" max="${balance.toFixed(2)}" step="0.01" value="${balance.toFixed(2)}" required style="width:100%;box-sizing:border-box"></label><p>${money(balance)} remaining. Change the amount for a partial payment.</p><p role="alert" data-manual-payment-error></p><div class="btn-row"><button type="submit" class="btn btn-primary">Record ${methods[method]} payment</button><button type="button" class="btn btn-soft" data-manual-payment-close>Cancel</button></div></form></div>`);
 }catch(error){message(error.message);}finally{busy=false;mount();}
}
function message(text){document.querySelector('[data-manual-payment-message]')?.remove();const el=document.createElement('div');el.className='toast';el.dataset.manualPaymentMessage='1';el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),5000);}
async function submit(event){
 event.preventDefault();if(busy||!dialog||!context().allowed)return;
 const captured=dialog,form=event.target,errorEl=form.querySelector('[data-manual-payment-error]'),amount=Number(form.elements.amount.value);
 if(!Number.isFinite(amount)||amount<=0||amount>captured.balance||Math.abs(amount-Math.round(amount*100)/100)>0.000001){errorEl.textContent='Enter a valid amount up to the balance due.';return;}
 if(context().sid!==captured.sid||context().jobId!==captured.jobId){errorEl.textContent='Job changed. Reopen its invoice.';return;}
 if(captured.amount!==undefined&&captured.amount!==amount){errorEl.textContent='Retry the same amount, or cancel and reopen for a different payment.';return;}
 captured.amount=amount;busy=true;errorEl.textContent='';form.querySelectorAll('input,button').forEach(el=>el.disabled=true);
 try{
  const {data,error}=await window.MobileMechanicSupabase.rpc('record_manual_job_payment',{p_invoice_id:captured.invoiceId,p_method:captured.method,p_amount:amount,p_request_id:captured.requestId});
  if(error)throw error;if(!data?.invoice)throw new Error('Payment not confirmed. Retry to check it.');
  form.parentElement.remove();dialog=null;
  if(context().sid===captured.sid&&context().jobId===captured.jobId){try{await window.MobileMechanicInvoiceEditor.refresh();}catch(error){console.warn('Invoice refresh',error);}}
  try{await window.MobileMechanicRefreshJobStatuses?.();}catch{}
  window.dispatchEvent(new Event('mobile-mechanic-jobs-updated'));
  message(`${methods[captured.method]} payment recorded.${data.job_completed?' Job moved to Completed.':''}`);
 }catch(error){errorEl.textContent=error.message||'Could not confirm payment. Try again.';}
 finally{busy=false;form.querySelectorAll('input,button').forEach(el=>el.disabled=false);mount();}
}
document.addEventListener('click',e=>{const method=e.target.closest?.('[data-manual-payment-method]');if(method){e.preventDefault();open(method.dataset.manualPaymentMethod);}if(e.target.closest?.('[data-manual-payment-close]')||e.target.matches?.('[data-manual-payment-modal]'))close();});
document.addEventListener('submit',e=>{if(e.target.matches?.('[data-manual-payment-form]'))submit(e);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
window.addEventListener('hashchange',close);
let queued=false;new MutationObserver(()=>{if(!queued){queued=true;setTimeout(()=>{queued=false;mount();},50);}}).observe(document.documentElement,{childList:true,subtree:true});
mount();
})();
