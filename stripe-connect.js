(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
let busy=false;
function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function ctx(){const c=cache(),sid=c.session?.shopId;return {sid,shop:sid?c.shops?.[sid]:null};}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.stripe-connect-toast')?.remove();const d=document.createElement('div');d.className=`toast stripe-connect-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4500);}
async function call(action){if(!sb)throw new Error('Stripe Connect is not available.');const {data,error}=await sb.functions.invoke('stripe-connect',{body:{action,return_url:`${location.origin}/#settings`,refresh_url:`${location.origin}/#settings`}});if(error)throw new Error(error.message||'Stripe Connect request failed.');if(data?.error)throw new Error(data.error);return data;}
function label(s){if(s==='active')return 'Ready to accept card payments';if(s==='needs_information')return 'More information required';if(s==='onboarding')return 'Onboarding in progress';if(s==='pending')return 'Verification pending';return 'Not connected';}
function pill(s){return `<span class="status-chip ${s==='active'?'good':s==='needs_information'?'warn':''}">${label(s)}</span>`;}
function taxLabel(st){if(st.tax_enabled)return '<span class="status-chip good">Automatic tax ON</span>';if(st.tax_status==='active')return '<span class="status-chip">Tax ready — off</span>';if(st.tax_status==='pending')return '<span class="status-chip warn">Tax setup incomplete</span>';return '<span class="status-chip">Tax not configured</span>';}
function taxBlock(st){
  if(st.status!=='active')return '';
  return `<div class="divider"></div><div class="list-item"><div class="list-main"><b>Stripe Tax ${taxLabel(st)}</b><p>${st.tax_status==='active'?'Stripe says this shop’s Tax settings are ready. Automatic tax can be applied to Stripe repair invoices.':'Complete the shop’s tax address, tax code, and any required registrations in Stripe before automatic tax can be enabled.'}</p></div></div><div class="btn-row">${st.tax_status==='active'?`<button class="btn ${st.tax_enabled?'btn-soft':'btn-primary'}" data-connect-tax-toggle="${st.tax_enabled?'off':'on'}">${st.tax_enabled?'Turn Off Automatic Tax':'Turn On Automatic Tax'}</button>`:''}<button class="btn btn-soft" data-connect-tax-check>Check Tax Setup</button><button class="btn btn-soft" data-connect-dashboard>Open Stripe Tax Settings</button></div>`;
}
async function renderPanel(){
  if(location.hash.split('?')[0]!=='#settings')return;
  const main=document.querySelector('.content');if(!main||main.querySelector('[data-stripe-connect-panel]'))return;
  const {sid}=ctx();if(!sid||!sb)return;
  const panel=document.createElement('section');panel.className='card';panel.dataset.stripeConnectPanel='1';panel.innerHTML=`<div class="section-head"><div><div class="eyebrow">CUSTOMER PAYMENTS</div><h3>Stripe for Your Shop</h3><p class="section-note">Connect your shop's own Stripe account so repair customers pay your business directly. This is separate from your Mobile Mechanic AI subscription.</p></div></div><div data-connect-body><div class="muted">Checking Stripe status…</div></div>`;
  main.prepend(panel);
  try{
    const st=await call('status');
    const body=panel.querySelector('[data-connect-body]');
    if(!st.connected){body.innerHTML=`<div class="list-item"><div class="list-main"><b>Not connected yet</b><p>Stripe securely collects your business, identity, banking, and payout information. Mobile Mechanic AI never stores your bank or card details.</p></div></div><button class="btn btn-primary" data-connect-onboard>Connect Stripe to My Shop</button>`;return;}
    body.innerHTML=`<div class="list-item"><div class="list-main"><b>${pill(st.status)}</b><p>Card payments: <strong>${esc(st.card_payments_status||'pending')}</strong> · Payouts: <strong>${esc(st.payouts_status||'pending')}</strong>${st.requirements_due?` · ${st.requirements_due} item${st.requirements_due===1?'':'s'} still needed`:''}</p></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-connect-onboard>${st.status==='active'?'Review / Update Stripe':'Continue Stripe Setup'}</button><button class="btn btn-soft" data-connect-refresh>Refresh Status</button>${st.status==='active'?`<button class="btn btn-soft" data-connect-dashboard>Open Stripe Dashboard</button>`:''}</div>${taxBlock(st)}`;
  }catch(err){panel.querySelector('[data-connect-body]').innerHTML=`<div class="alert bad">${esc(err.message||err)}</div><button class="btn btn-soft" data-connect-refresh>Try Again</button>`;}
}
async function onboard(){if(busy)return;busy=true;const b=document.querySelector('[data-connect-onboard]');const old=b?.textContent;if(b){b.disabled=true;b.textContent='Opening Stripe…';}try{const d=await call('onboard');if(d.url){location.href=d.url;return;}throw new Error('Stripe did not return an onboarding link.');}catch(err){toast(err.message||'Could not start Stripe onboarding.','bad');}finally{busy=false;if(b){b.disabled=false;b.textContent=old||'Continue Stripe Setup';}}}
async function refresh(){const p=document.querySelector('[data-stripe-connect-panel]');p?.remove();await renderPanel();}
async function taxToggle(on){if(busy)return;busy=true;try{const d=await call(on?'tax_enable':'tax_disable');toast(d.tax_enabled?'Automatic Stripe Tax enabled for this shop.':'Automatic Stripe Tax disabled for this shop.','good');await refresh();}catch(err){toast(err.message||'Could not update Stripe Tax.','bad');}finally{busy=false;}}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-connect-onboard]')){e.preventDefault();onboard();return;}if(e.target.closest?.('[data-connect-refresh]')||e.target.closest?.('[data-connect-tax-check]')){e.preventDefault();refresh();return;}const t=e.target.closest?.('[data-connect-tax-toggle]');if(t){e.preventDefault();taxToggle(t.dataset.connectTaxToggle==='on');return;}if(e.target.closest?.('[data-connect-dashboard]')){e.preventDefault();window.open('https://dashboard.stripe.com/','_blank','noopener');}},true);
new MutationObserver(()=>setTimeout(renderPanel,0)).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>setTimeout(renderPanel,80));setTimeout(renderPanel,500);
})();