(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
const REOPEN_KEY='mm_open_payment_processing';
const names={stripe:'Stripe',square:'Square',paypal:'PayPal / Venmo'};
const detail={stripe:'Cards, hosted invoices, tax, Apple Pay / Google Pay where eligible.',square:'Cards, Square checkout links, invoices, Cash App Pay and wallets where eligible.',paypal:'PayPal checkout, Venmo for eligible U.S. merchants, and PayPal invoicing.'};
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.processor-toast')?.remove();const d=document.createElement('div');d.className=`toast processor-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5000);}
async function call(fn,body){if(!sb)throw new Error('Payment settings are not connected.');const {data,error}=await sb.functions.invoke(fn,{body});if(error)throw new Error(error.message||'Payment request failed.');if(data?.error)throw new Error(data.error);return data;}
function badge(p){const s=p.status||'not_connected';const label={connected:'Connected',connecting:'Connecting',needs_keys:'Needs setup',needs_attention:'Needs attention',disabled:'Disabled',not_connected:'Not connected'}[s]||s;return `<span class="badge ${s==='connected'?'green':s==='needs_attention'?'orange':'red'}">${esc(label)}</span>`;}
function returnUrl(){return `${location.origin}${location.pathname}#settings`;}
async function connect(provider){if(busy)return;busy=true;try{
  let d;
  if(provider==='stripe')d=await call('stripe-connect',{action:'onboard',return_url:returnUrl(),refresh_url:returnUrl()});
  else if(provider==='square')d=await call('square-oauth',{return_url:returnUrl()});
  else if(provider==='paypal')d=await call('paypal-onboarding',{return_url:returnUrl()});
  if(d?.url){sessionStorage.setItem(REOPEN_KEY,'1');location.assign(d.url);return;}
  throw new Error(`${names[provider]||provider} did not return a connection link.`);
}catch(err){toast(err.message||'Could not connect payment processor.','bad');}finally{busy=false;}}
async function setDefault(provider){if(busy)return;busy=true;try{await call('payment-processors',{action:'set_default',provider});toast(`${names[provider]} is now the default customer payment processor.`,'good');await renderProcessorList();}catch(err){toast(err.message||'Could not change the default processor.','bad');}finally{busy=false;}}
function settingsMain(){if(location.hash.split('?')[0]!=='#settings')return null;return document.querySelector('.content');}
function removeOldTopPaymentUi(main){
  if(!main)return;
  [...main.children].forEach(el=>{
    if(el.matches?.('[data-payment-processing-launcher],[data-payment-processors-panel]'))return;
    const text=(el.textContent||'').replace(/\s+/g,' ').trim();
    const heading=(el.querySelector?.('.card-title,h2,h3')?.textContent||'').replace(/\s+/g,' ').trim();
    const oldCustomerPaymentCard=/^customer payments?$/i.test(heading)||/^customer payment processors$/i.test(heading);
    const oldDisconnectedBanner=/(square|stripe|paypal).{0,60}(not connected|isn.?t connected)|customer payments?.{0,80}(not connected|needs setup)/i.test(text);
    if(oldCustomerPaymentCard||oldDisconnectedBanner)el.remove();
  });
}
function launcherMarkup(){return `<section class="card card-pad" data-payment-processing-launcher style="margin-top:18px"><div class="card-title">PAYMENT PROCESSING</div><div class="section-note">Choose where your shop's customer repair payments go.</div><div class="divider"></div><button class="btn btn-soft btn-wide" data-open-payment-processing>Manage Payment Processing</button></section>`;}
function renderLauncher(){
  const main=settingsMain();if(!main||!sb||main.dataset.paymentProcessingPage==='1')return;
  main.querySelector('[data-payment-processors-panel]')?.remove();
  removeOldTopPaymentUi(main);
  let launcher=main.querySelector('[data-payment-processing-launcher]');
  if(!launcher){main.insertAdjacentHTML('beforeend',launcherMarkup());launcher=main.querySelector('[data-payment-processing-launcher]');}
  if(launcher&&launcher!==main.lastElementChild)main.appendChild(launcher);
  if(sessionStorage.getItem(REOPEN_KEY)==='1'){
    sessionStorage.removeItem(REOPEN_KEY);
    setTimeout(openPaymentPage,80);
  }
}
function processorPageMarkup(){return `<div class="page-title"><button class="back-btn" type="button" data-payment-back>‹</button><div><h2>Payment Processing</h2><p>Connect the payment service your shop wants to use for customer payments.</p></div></div><section class="card card-pad" data-payment-processors-panel><div class="card-title">CUSTOMER PAYMENT PROCESSORS</div><div class="section-note">This is separate from the Mobile Mechanic AI software subscription, which remains on Stripe.</div><div class="divider"></div><div data-processor-body class="muted">Checking payment processors…</div></section>`;}
async function openPaymentPage(){
  const main=settingsMain();if(!main||!sb)return;
  main.dataset.paymentProcessingPage='1';
  main.innerHTML=processorPageMarkup();
  await renderProcessorList();
}
async function renderProcessorList(){
  const panel=document.querySelector('[data-payment-processors-panel]');if(!panel||!sb)return;
  const body=panel.querySelector('[data-processor-body]');if(!body)return;
  body.innerHTML='Checking payment processors…';
  try{
    const d=await call('payment-processors',{action:'status'}),rows=d.processors||[];
    const by=Object.fromEntries(rows.map(x=>[x.provider,x]));
    body.innerHTML=['stripe','square','paypal'].map(provider=>{
      const p=by[provider]||{provider,status:'not_connected',is_default:false};
      const connected=p.status==='connected';
      return `<div class="list-item"><div class="list-icon">${provider==='stripe'?'$':provider==='square'?'■':'P'}</div><div class="list-main"><b>${esc(names[provider])} ${badge(p)} ${p.is_default?'<span class="badge green">Default</span>':''}</b><p>${esc(detail[provider])}</p><div class="list-actions"><button class="btn ${connected?'btn-soft':'btn-primary'}" data-processor-connect="${provider}">${connected?'Manage / Reconnect':'Connect '+esc(names[provider])}</button>${connected&&!p.is_default?`<button class="btn btn-soft" data-processor-default="${provider}">Make Default</button>`:''}</div>${p.last_error?`<p class="small red">${esc(p.last_error)}</p>`:''}</div></div>`;
    }).join('')+`<div class="divider"></div><p class="small muted">Each shop can choose Square, Stripe, or PayPal / Venmo for its own customer payments. You can change the default later.</p><button class="btn btn-soft" data-processor-refresh>Refresh Status</button>`;
  }catch(err){body.innerHTML=`<div class="alert bad">${esc(err.message||'Could not load payment processors.')}</div><button class="btn btn-soft" data-processor-refresh>Try Again</button>`;}
}
function backToSettings(){sessionStorage.removeItem(REOPEN_KEY);location.reload();}
document.addEventListener('click',e=>{
  if(e.target.closest?.('[data-open-payment-processing]')){e.preventDefault();openPaymentPage();return;}
  if(e.target.closest?.('[data-payment-back]')){e.preventDefault();backToSettings();return;}
  const c=e.target.closest?.('[data-processor-connect]');if(c){e.preventDefault();connect(c.dataset.processorConnect);return;}
  const d=e.target.closest?.('[data-processor-default]');if(d){e.preventDefault();setDefault(d.dataset.processorDefault);return;}
  if(e.target.closest?.('[data-processor-refresh]')){e.preventDefault();renderProcessorList();}
},true);
new MutationObserver(()=>setTimeout(renderLauncher,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(renderLauncher,100));
setTimeout(renderLauncher,600);
})();