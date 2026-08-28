(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
const REOPEN_KEY='mm_open_quickbooks';
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.qb-toast')?.remove();const d=document.createElement('div');d.className=`toast qb-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5000);}
async function call(action,extra={}){if(!sb)throw new Error('QuickBooks integration is not available.');const {data,error}=await sb.functions.invoke('quickbooks-oauth',{body:{action,...extra}});if(error)throw new Error(error.message||'QuickBooks request failed.');if(data?.error)throw new Error(data.error);return data;}
function settingsMain(){if(location.hash.split('?')[0]!=='#settings')return null;return document.querySelector('.content');}
function returnUrl(){return `${location.origin}${location.pathname}#settings`;}
function launcherMarkup(){return `<section class="card card-pad" data-business-integrations-launcher style="margin-top:18px"><div class="card-title">BUSINESS INTEGRATIONS</div><div class="section-note">Connect accounting and other business services used by your shop.</div><div class="divider"></div><button class="btn btn-soft btn-wide" data-open-business-integrations>Manage Business Integrations</button></section>`;}
function renderLauncher(){
  const main=settingsMain();if(!main||!sb||main.dataset.paymentProcessingPage==='1'||main.dataset.businessIntegrationsPage==='1')return;
  let launcher=main.querySelector('[data-business-integrations-launcher]');
  if(!launcher){
    const payment=main.querySelector('[data-payment-processing-launcher]');
    if(payment)payment.insertAdjacentHTML('beforebegin',launcherMarkup());
    else main.insertAdjacentHTML('beforeend',launcherMarkup());
    launcher=main.querySelector('[data-business-integrations-launcher]');
  }
  const payment=main.querySelector('[data-payment-processing-launcher]');
  if(payment&&launcher&&launcher.nextElementSibling!==payment)main.insertBefore(launcher,payment);
  if(sessionStorage.getItem(REOPEN_KEY)==='1'){
    sessionStorage.removeItem(REOPEN_KEY);
    setTimeout(openIntegrationsPage,80);
  }
}
function badge(status){const label={connected:'Connected',connecting:'Connecting',needs_keys:'Needs setup',needs_attention:'Needs attention',disabled:'Disabled',not_connected:'Not connected'}[status]||status;const cls=status==='connected'?'green':status==='needs_attention'?'orange':'red';return `<span class="badge ${cls}">${esc(label)}</span>`;}
function pageMarkup(){return `<div class="page-title"><button class="back-btn" type="button" data-business-integrations-back>‹</button><div><h2>Business Integrations</h2><p>Connect accounting and business services for this shop.</p></div></div><section class="card card-pad" data-quickbooks-panel><div class="card-title">ACCOUNTING</div><div class="section-note">QuickBooks Online can receive shop customers, invoices and payment records once connected.</div><div class="divider"></div><div data-quickbooks-body class="muted">Checking QuickBooks…</div></section>`;}
async function openIntegrationsPage(){
  const main=settingsMain();if(!main||!sb)return;
  main.dataset.businessIntegrationsPage='1';
  main.dataset.paymentProcessingPage='1';
  main.innerHTML=pageMarkup();
  await renderQuickBooks();
}
async function renderQuickBooks(){
  const body=document.querySelector('[data-quickbooks-body]');if(!body||!sb)return;
  body.innerHTML='Checking QuickBooks…';
  try{
    const d=await call('status');
    const q=d.integration||{status:'not_connected'};
    const connected=q.status==='connected';
    const configured=!!d.configured;
    body.innerHTML=`<div class="list-item"><div class="list-icon">QB</div><div class="list-main"><b>QuickBooks Online ${badge(q.status)}</b><p>${connected?`Connected to ${esc(q.display_name||'QuickBooks Online')}.`:configured?'Ready to connect this shop to QuickBooks Online.':'The app side is ready. Intuit production credentials still need to be added before a shop can authorize QuickBooks.'}</p>${q.last_error?`<p class="small red">${esc(q.last_error)}</p>`:''}<p class="small muted">Environment: ${esc(d.environment||'sandbox')}</p><div class="list-actions"><button class="btn ${connected?'btn-soft':'btn-primary'}" data-quickbooks-connect>${connected?'Reconnect QuickBooks':'Connect QuickBooks'}</button>${connected?'<button class="btn btn-soft" data-quickbooks-check>Check Company</button><button class="btn btn-soft" data-quickbooks-disconnect>Disconnect</button>':''}</div></div></div><div class="divider"></div><p class="small muted">First sync target: customers, invoices and payment records. Expense/parts mappings can be added after the base connection is proven.</p>`;
  }catch(err){body.innerHTML=`<div class="alert bad">${esc(err.message||'Could not load QuickBooks status.')}</div><button class="btn btn-soft" data-quickbooks-refresh>Try Again</button>`;}
}
async function connect(){if(busy)return;busy=true;try{const d=await call('connect',{return_url:returnUrl()});if(d.url){sessionStorage.setItem(REOPEN_KEY,'1');location.assign(d.url);return;}throw new Error('QuickBooks did not return an authorization link.');}catch(err){toast(err.message||'Could not start QuickBooks connection.','bad');}finally{busy=false;}}
async function checkCompany(){if(busy)return;busy=true;try{const d=await call('company');toast(d.company?.CompanyName?`QuickBooks connected: ${d.company.CompanyName}`:'QuickBooks company connection is working.','good');await renderQuickBooks();}catch(err){toast(err.message||'Could not read QuickBooks company.','bad');}finally{busy=false;}}
async function disconnect(){if(busy)return;busy=true;try{await call('disconnect');toast('QuickBooks disconnected from this shop.','good');await renderQuickBooks();}catch(err){toast(err.message||'Could not disconnect QuickBooks.','bad');}finally{busy=false;}}
function back(){sessionStorage.removeItem(REOPEN_KEY);location.reload();}
document.addEventListener('click',e=>{
  if(e.target.closest?.('[data-open-business-integrations]')){e.preventDefault();openIntegrationsPage();return;}
  if(e.target.closest?.('[data-business-integrations-back]')){e.preventDefault();back();return;}
  if(e.target.closest?.('[data-quickbooks-connect]')){e.preventDefault();connect();return;}
  if(e.target.closest?.('[data-quickbooks-check]')){e.preventDefault();checkCompany();return;}
  if(e.target.closest?.('[data-quickbooks-disconnect]')){e.preventDefault();disconnect();return;}
  if(e.target.closest?.('[data-quickbooks-refresh]')){e.preventDefault();renderQuickBooks();}
},true);
new MutationObserver(()=>setTimeout(renderLauncher,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(renderLauncher,100));
setTimeout(renderLauncher,700);
})();