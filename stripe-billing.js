(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
let busy=false,subscriptionPresent=false;
function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function ctx(){const c=cache(),sid=c.session?.shopId;return {sid,shop:sid?c.shops?.[sid]:null};}
function toast(msg,type=''){document.querySelector('.stripe-ui-toast')?.remove();const d=document.createElement('div');d.className=`toast stripe-ui-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4500);}
function selectedPlan(){return document.querySelector('input[name="billingPlan"]:checked')?.value||ctx().shop?.plan||'shop';}
async function shopStripeState(){const {sid}=ctx();if(!sb||!sid)return null;const {data,error}=await sb.from('shops').select('stripe_customer_id,stripe_subscription_id,billing_status,stripe_subscription_status').eq('shop_id',sid).single();if(error)return null;subscriptionPresent=Boolean(data?.stripe_subscription_id);return data;}
async function call(action,plan=selectedPlan()){
  if(!sb)throw new Error('Billing service is not connected.');
  const {data,error}=await sb.functions.invoke('stripe-billing',{body:{action,plan,return_url:`${location.origin}/#billing`}});
  if(error)throw new Error(error.message||'Stripe billing request failed.');
  if(data?.error)throw new Error(data.error);
  return data;
}
async function checkout(){if(busy)return;busy=true;const btn=document.querySelector('[data-stripe-checkout]');const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent=subscriptionPresent?'Updating…':'Opening Stripe…';}try{const data=await call('checkout');if(data?.url){location.href=data.url;return;}toast(data?.kind==='updated'?'Subscription updated.':'Billing updated.','good');setTimeout(()=>location.reload(),650);}catch(err){toast(err.message||'Could not open Stripe billing.','bad');}finally{busy=false;if(btn){btn.disabled=false;btn.textContent=old||'Set Up Automatic Billing';}}}
async function portal(){if(busy)return;busy=true;try{const data=await call('portal');if(data?.url){location.href=data.url;return;}throw new Error('Stripe portal did not return a link.');}catch(err){toast(err.message||'Could not open billing portal.','bad');}finally{busy=false;}}
async function syncAfterAddon(){if(!subscriptionPresent)return;setTimeout(async()=>{try{await call('sync');toast('Subscription add-ons updated.','good');}catch(err){console.warn('Stripe add-on sync:',err.message||err);}},1100);}
async function enhance(){
  const billingRadio=document.querySelector('input[name="billingPlan"]');if(!billingRadio)return;
  const button=document.querySelector('button[data-action="not-connected"],button[data-stripe-checkout]');if(!button)return;
  button.dataset.stripeCheckout='1';button.textContent='Set Up Automatic Billing';
  const section=button.closest('section');const note=section?.querySelector('.section-note');if(note)note.textContent='Stripe Checkout securely collects the payment method. If trial time remains, the first monthly charge occurs when the trial ends.';
  const state=await shopStripeState();if(state?.stripe_subscription_id){button.textContent='Update Subscription';if(!section.querySelector('[data-stripe-portal]')){const portalBtn=document.createElement('button');portalBtn.type='button';portalBtn.className='btn btn-soft';portalBtn.style.marginLeft='8px';portalBtn.dataset.stripePortal='1';portalBtn.textContent='Manage Card / Cancel';button.after(portalBtn);}}
}
document.addEventListener('click',e=>{const checkoutBtn=e.target.closest?.('[data-stripe-checkout]');if(checkoutBtn){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();checkout();return;}const portalBtn=e.target.closest?.('[data-stripe-portal]');if(portalBtn){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();portal();return;}if(e.target.closest?.('[data-action="toggle-addon"]'))syncAfterAddon();},true);
new MutationObserver(()=>setTimeout(enhance,0)).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>setTimeout(enhance,50));setTimeout(enhance,350);
})();