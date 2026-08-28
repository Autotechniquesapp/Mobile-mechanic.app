(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
const REOPEN_KEY='mm_open_business_integrations';
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.biz-toast')?.remove();const d=document.createElement('div');d.className=`toast biz-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5200);}
async function invoke(fn,body){
  if(!sb)throw new Error('Business integrations are not available.');
  const {data,error}=await sb.functions.invoke(fn,{body});
  if(error){
    let detail;
    try{detail=await error.context?.clone().json();}catch{}
    throw new Error(typeof detail?.error==='string'?detail.error:error.message||'Integration request failed.');
  }
  if(data?.error)throw new Error(data.error);
  return data;
}
function settingsMain(){if(location.hash.split('?')[0]!=='#settings')return null;return document.querySelector('.content');}
function returnUrl(){return `${location.origin}${location.pathname}#settings`;}
function launcherMarkup(){return `<section class="card card-pad" data-business-integrations-launcher style="margin-top:18px"><div class="card-title">BUSINESS INTEGRATIONS</div><div class="section-note">Accounting, calendar, email, texting, maps, vehicle data, CARFAX, parts and file services.</div><div class="divider"></div><button class="btn btn-soft btn-wide" data-open-business-integrations>Manage Business Integrations</button></section>`;}
function renderLauncher(){
  const main=settingsMain();if(!main||!sb||main.dataset.paymentProcessingPage==='1'||main.dataset.businessIntegrationsPage==='1')return;
  let launcher=main.querySelector('[data-business-integrations-launcher]');
  if(!launcher){const payment=main.querySelector('[data-payment-processing-launcher]');if(payment)payment.insertAdjacentHTML('beforebegin',launcherMarkup());else main.insertAdjacentHTML('beforeend',launcherMarkup());launcher=main.querySelector('[data-business-integrations-launcher]');}
  const payment=main.querySelector('[data-payment-processing-launcher]');if(payment&&launcher&&launcher.nextElementSibling!==payment)main.insertBefore(launcher,payment);
  if(sessionStorage.getItem(REOPEN_KEY)==='1'){sessionStorage.removeItem(REOPEN_KEY);setTimeout(openIntegrationsPage,80);}
}
function badge(row){let status=row.status||'not_connected';if(status==='not_connected'&&!row.configured)status='needs_keys';const label={connected:'Connected',connecting:'Connecting',needs_keys:'Needs setup',needs_attention:'Needs attention',disabled:'Disabled',not_connected:'Not connected'}[status]||status;const cls=status==='connected'?'green':status==='needs_attention'?'orange':'red';return `<span class="badge ${cls}">${esc(label)}</span>`;}
function pageMarkup(){return `<div class="page-title"><button class="back-btn" type="button" data-business-integrations-back>‹</button><div><h2>Business Integrations</h2><p>Connect the services each shop wants to use.</p></div></div><section class="card card-pad" data-business-integrations-panel><div class="card-title">SHOP INTEGRATIONS</div><div class="section-note">These are separate from customer payment processing and the Mobile Mechanic AI subscription.</div><div class="divider"></div><div data-business-integrations-body class="muted">Checking integrations…</div></section>`;}
async function openIntegrationsPage(){const main=settingsMain();if(!main||!sb)return;main.dataset.businessIntegrationsPage='1';main.dataset.paymentProcessingPage='1';main.innerHTML=pageMarkup();await renderIntegrations();}
function actionButton(row){
  const connected=row.status==='connected';
  if(connected)return `<button class="btn btn-soft" data-business-disconnect="${esc(row.provider)}">Disconnect</button>`;
  if(!row.configured)return `<button class="btn btn-soft" data-business-connect="${esc(row.provider)}">Setup Required</button>`;
  return `<button class="btn btn-primary" data-business-connect="${esc(row.provider)}">Connect ${esc(row.name)}</button>`;
}
function rowMarkup(row){return `<div class="list-item"><div class="list-icon">${esc((row.name||'?').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase())}</div><div class="list-main"><b>${esc(row.name)} ${badge(row)}</b><p>${esc(row.note||'Business service integration.')}</p>${row.display_name?`<p class="small muted">Connected account: ${esc(row.display_name)}</p>`:''}${row.last_error?`<p class="small red">${esc(row.last_error)}</p>`:''}<div class="list-actions">${actionButton(row)}${row.provider==='quickbooks'&&row.status==='connected'?'<button class="btn btn-soft" data-quickbooks-check>Check Company</button>':''}</div></div></div>`;}
async function renderIntegrations(){
  const body=document.querySelector('[data-business-integrations-body]');if(!body||!sb)return;body.innerHTML='Checking integrations…';
  try{
    const d=await invoke('business-integrations',{action:'status'}),rows=d.integrations||[];
    const order=['Accounting','Calendar','Communication','Location & Vehicle','Parts & Automation','Files'];
    body.innerHTML=order.map(category=>{const items=rows.filter(x=>x.category===category);if(!items.length)return '';return `<div class="integration-group"><div class="card-title" style="margin-top:8px">${esc(category.toUpperCase())}</div>${items.map(rowMarkup).join('')}<div class="divider"></div></div>`;}).join('')+`<p class="small muted">A service marked “Needs setup” has its app wiring ready but still needs that provider's production credentials or authorized account before it can go live.</p><button class="btn btn-soft" data-business-refresh>Refresh Status</button>`;
  }catch(err){body.innerHTML=`<div class="alert bad">${esc(err.message||'Could not load business integrations.')}</div><button class="btn btn-soft" data-business-refresh>Try Again</button>`;}
}
async function connect(provider){if(busy)return;busy=true;try{
  const status=await invoke('business-integrations',{action:'status'});const row=(status.integrations||[]).find(x=>x.provider===provider);if(!row)throw new Error('Unknown integration.');
  if(!row.configured){toast(`${row.name} is built into Settings, but its provider credentials still need to be added before it can connect.`,'bad');return;}
  if(!row.connector){await invoke('business-integrations',{action:'enable',provider});toast(`${row.name} enabled for this shop.`,'good');await renderIntegrations();return;}
  let d;if(row.connector==='quickbooks-oauth')d=await invoke('quickbooks-oauth',{action:'connect',return_url:returnUrl()});
  else if(row.connector==='xero-oauth')d=await invoke('xero-oauth',{return_url:returnUrl()});
  else d=await invoke(row.connector,{provider,return_url:returnUrl()});
  if(d?.url){sessionStorage.setItem(REOPEN_KEY,'1');location.assign(d.url);return;}throw new Error(`${row.name} did not return an authorization link.`);
 }catch(err){toast(err.message||'Could not connect integration.','bad');}finally{busy=false;}}
async function disconnect(provider){if(busy)return;busy=true;try{await invoke('business-integrations',{action:'disconnect',provider});toast('Integration disconnected.','good');await renderIntegrations();}catch(err){toast(err.message||'Could not disconnect integration.','bad');}finally{busy=false;}}
async function checkQuickBooks(){if(busy)return;busy=true;try{const d=await invoke('quickbooks-oauth',{action:'company'});toast(d.company?.CompanyName?`QuickBooks connected: ${d.company.CompanyName}`:'QuickBooks company connection is working.','good');}catch(err){toast(err.message||'Could not read QuickBooks company.','bad');}finally{busy=false;}}
function back(){sessionStorage.removeItem(REOPEN_KEY);location.reload();}
document.addEventListener('click',e=>{
  if(e.target.closest?.('[data-open-business-integrations]')){e.preventDefault();openIntegrationsPage();return;}
  if(e.target.closest?.('[data-business-integrations-back]')){e.preventDefault();back();return;}
  const c=e.target.closest?.('[data-business-connect]');if(c){e.preventDefault();connect(c.dataset.businessConnect);return;}
  const d=e.target.closest?.('[data-business-disconnect]');if(d){e.preventDefault();disconnect(d.dataset.businessDisconnect);return;}
  if(e.target.closest?.('[data-quickbooks-check]')){e.preventDefault();checkQuickBooks();return;}
  if(e.target.closest?.('[data-business-refresh]')){e.preventDefault();renderIntegrations();}
},true);
new MutationObserver(()=>setTimeout(renderLauncher,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(renderLauncher,100));
setTimeout(renderLauncher,700);
})();
