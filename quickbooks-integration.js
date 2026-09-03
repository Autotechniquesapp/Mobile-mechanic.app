(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
const REOPEN_KEY='mm_open_business_integrations';
const DBKEY='mobile_mechanic_ai_approved_v7';
const PARTS_PORTALS=[
  {name:'AutoZone Pro',initials:'AZ',url:'https://www.autozonepro.com/',note:'Open AutoZone Pro and sign in with this shop\'s commercial account.'},
  {name:'O\'Reilly First Call',initials:'OR',url:'https://www.firstcallonline.com/',note:'Open First Call and sign in with this shop\'s O\'Reilly professional account.'},
  {name:'NAPA PROLink',initials:'NP',url:'https://www.napaprolink.com/',note:'Open NAPA PROLink and sign in with this shop\'s commercial account.'},
  {name:'Advance Professional',initials:'AP',url:'https://my.advancepro.com/',note:'Open MyAdvance and sign in with this shop\'s Advance Professional account.'}
];
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.biz-toast')?.remove();const d=document.createElement('div');d.className=`toast biz-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5200);}
async function invoke(fn,body){if(!sb)throw new Error('Business integrations are not available.');const {data,error}=await sb.functions.invoke(fn,{body});if(error)throw new Error(error.message||'Integration request failed.');if(data?.error)throw new Error(data.error);return data;}
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
function isZapierRow(row){return row?.provider==='zapier_make'||row?.provider==='zapier'||/^Zapier\s*\/\s*Make$/i.test(row?.name||'');}
function isOneDriveRow(row){return row?.provider==='dropbox'||row?.provider==='onedrive';}
function displayRow(row){if(row.provider==='google_maps')return {...row,name:'OpenStreetMap / Leaflet',status:'connected',configured:true,always_on:true,display_name:'Built-in free maps',last_error:null,note:'Free built-in maps, GPS location and nearby parts-store lookup. No Google Maps API key required.'};if(row.provider==='carfax')return {...row,name:'CARFAX',status:'under_review',configured:true,last_error:null,note:'We are looking into connecting to CARFAX.'};if(isZapierRow(row))return {...row,status:'optional',configured:true,last_error:null,note:'Optional automation service. Tap Learn More if this shop wants help connecting other apps.'};if(isOneDriveRow(row))return {...row,name:'Microsoft OneDrive',status:'optional',configured:true,last_error:null,display_name:null,note:'Optional Microsoft file storage for invoices, receipts and reports. Tap Learn More to request setup.'};return row;}
function badge(raw){const row=displayRow(raw);let status=row.status||'not_connected';if(status==='not_connected'&&!row.configured)status='needs_keys';const label={connected:'Connected',connecting:'Connecting',needs_keys:'Needs setup',needs_attention:'Needs attention',disabled:'Disabled',not_connected:'Not connected',optional:'Optional',under_review:'Under review'}[status]||status;const cls=status==='connected'?'green':status==='needs_attention'||status==='optional'||status==='under_review'?'orange':'red';return `<span class="badge ${cls}">${esc(label)}</span>`;}
function pageMarkup(){return `<div class="page-title"><button class="back-btn" type="button" data-business-integrations-back>‹</button><div><h2>Business Integrations</h2><p>Connect the services each shop wants to use.</p></div></div><section class="card card-pad" data-business-integrations-panel><div class="card-title">SHOP INTEGRATIONS</div><div class="section-note">These are separate from customer payment processing and the Mobile Mechanic AI subscription.</div><div class="divider"></div><div data-business-integrations-body class="muted">Checking integrations…</div></section>`;}
async function openIntegrationsPage(){const main=settingsMain();if(!main||!sb)return;main.dataset.businessIntegrationsPage='1';main.dataset.paymentProcessingPage='1';main.innerHTML=pageMarkup();await renderIntegrations();}
function actionButton(raw){const row=displayRow(raw);
  if(row.provider==='carfax')return `<span class="small muted">No setup required right now</span>`;
  if(isZapierRow(row))return `<button class="btn btn-soft" data-zapier-learn-more>Learn More</button>`;
  if(isOneDriveRow(row))return `<button class="btn btn-soft" data-onedrive-learn-more>Learn More</button>`;
  if(row.always_on)return `<span class="small muted">Built in</span>`;
  const connected=row.status==='connected';
  if(connected)return `<button class="btn btn-soft" data-business-disconnect="${esc(row.provider)}">Disconnect</button>`;
  if(!row.configured)return `<button class="btn btn-soft" data-business-connect="${esc(row.provider)}">Setup Required</button>`;
  return `<button class="btn btn-primary" data-business-connect="${esc(row.provider)}">Connect ${esc(row.name)}</button>`;
}
function rowMarkup(raw){const row=displayRow(raw);return `<div class="list-item"><div class="list-icon">${esc((row.name||'?').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase())}</div><div class="list-main"><b>${esc(row.name)} ${badge(row)}</b><p>${esc(row.note||'Business service integration.')}</p>${row.display_name?`<p class="small muted">Connected account: ${esc(row.display_name)}</p>`:''}${row.last_error?`<p class="small red">${esc(row.last_error)}</p>`:''}<div class="list-actions">${actionButton(row)}${row.provider==='quickbooks'&&row.status==='connected'?'<button class="btn btn-soft" data-quickbooks-check>Check Company</button>':''}</div></div></div>`;}
function partsPortalMarkup(){return `<div class="section-note" style="margin:10px 0 4px">Parts ordering opens each supplier's secure website. Each shop signs in with its own commercial account; Mobile Mechanic AI does not store supplier passwords.</div>${PARTS_PORTALS.map(portal=>`<div class="list-item"><div class="list-icon">${esc(portal.initials)}</div><div class="list-main"><b>${esc(portal.name)} <span class="badge green">Website</span></b><p>${esc(portal.note)}</p><div class="list-actions"><button class="btn btn-primary" data-open-parts-portal="${esc(portal.url)}">Open ${esc(portal.name)}</button></div></div></div>`).join('')}`;}
function isCombinedPartsRow(row){return row?.provider==='commercial_parts'||row?.provider==='commercial_parts_ordering'||row?.name==='Commercial Parts Ordering';}
async function renderIntegrations(){
  const body=document.querySelector('[data-business-integrations-body]');if(!body||!sb)return;body.innerHTML='Checking integrations…';
  try{
    const d=await invoke('business-integrations',{action:'status'}),rows=d.integrations||[];
    const order=['Accounting','Calendar','Communication','Location & Vehicle','Parts & Automation','Files'];
    body.innerHTML=order.map(category=>{const seen=new Set(),items=rows.filter(x=>x.category===category&&!isCombinedPartsRow(x)).filter(x=>{const key=isOneDriveRow(x)?'onedrive':x.provider;if(seen.has(key))return false;seen.add(key);return true;});if(category==='Parts & Automation')return `<div class="integration-group"><div class="card-title" style="margin-top:8px">PARTS ORDERING & AUTOMATION</div>${partsPortalMarkup()}${items.map(rowMarkup).join('')}<div class="divider"></div></div>`;if(!items.length)return '';return `<div class="integration-group"><div class="card-title" style="margin-top:8px">${esc(category.toUpperCase())}</div>${items.map(rowMarkup).join('')}<div class="divider"></div></div>`;}).join('')+`<p class="small muted">A service marked “Needs setup” has its app wiring ready but still needs that provider's production credentials or authorized account before it can go live.</p><button class="btn btn-soft" data-business-refresh>Refresh Status</button>`;
  }catch(err){body.innerHTML=`<div class="alert bad">${esc(err.message||'Could not load business integrations.')}</div><button class="btn btn-soft" data-business-refresh>Try Again</button>`;}
}
async function connect(provider){if(busy)return;busy=true;try{
  const status=await invoke('business-integrations',{action:'status'});const raw=(status.integrations||[]).find(x=>x.provider===provider);const row=raw?displayRow(raw):null;if(!row)throw new Error('Unknown integration.');
  if(row.always_on){toast(`${row.name} is already built in and live.`,'good');return;}
  if(!row.configured){toast(`${row.name} is built into Settings, but its provider credentials still need to be added before it can connect.`,'bad');return;}
  if(!row.connector){await invoke('business-integrations',{action:'enable',provider});toast(`${row.name} enabled for this shop.`,'good');await renderIntegrations();return;}
  let d;if(row.connector==='quickbooks-oauth')d=await invoke('quickbooks-oauth',{action:'connect',return_url:returnUrl()});
  else if(row.connector==='xero-oauth')d=await invoke('xero-oauth',{return_url:returnUrl()});
  else d=await invoke(row.connector,{provider,return_url:returnUrl()});
  if(d?.url){sessionStorage.setItem(REOPEN_KEY,'1');location.assign(d.url);return;}throw new Error(`${row.name} did not return an authorization link.`);
 }catch(err){toast(err.message||'Could not connect integration.','bad');}finally{busy=false;}}
async function disconnect(provider){if(busy)return;const status=await invoke('business-integrations',{action:'status'}).catch(()=>({integrations:[]})),row=(status.integrations||[]).find(x=>x.provider===provider),name=row?.name||provider;if(!confirm(`Disconnect ${name} from this shop? Automatic syncing through this service will stop until it is reconnected.`))return;busy=true;try{await invoke('business-integrations',{action:'disconnect',provider});toast(`${name} disconnected from this shop.`,'good');await renderIntegrations();}catch(err){toast(err.message||'Could not disconnect integration.','bad');}finally{busy=false;}}
async function checkQuickBooks(){if(busy)return;busy=true;try{const d=await invoke('quickbooks-oauth',{action:'company'});toast(d.company?.CompanyName?`QuickBooks connected: ${d.company.CompanyName}`:'QuickBooks company connection is working.','good');}catch(err){toast(err.message||'Could not read QuickBooks company.','bad');}finally{busy=false;}}
function shopContext(){try{const data=JSON.parse(localStorage.getItem(DBKEY)||'{}'),shopId=data.session?.shopId,shop=shopId?data.shops?.[shopId]:null;return {shopId,shop};}catch{return {shopId:null,shop:null};}}
async function requestIntegrationHelp(name,requestType){if(busy)return;busy=true;try{
  if(!sb)throw new Error('Setup requests are not available.');
  const {data:{user},error:userError}=await sb.auth.getUser();if(userError||!user)throw new Error('Please sign in again before requesting help.');
  const {shopId,shop}=shopContext();if(!shopId||!shop)throw new Error('Open your shop workspace before requesting help.');
  const message=`Shop requested information and setup help for ${name}.`;
  const payload={shop_id:shopId,user_id:user.id,category:'feature_request',message,route:'settings/business-integrations',metadata:{shop_name:shop.name||null,shop_email:shop.email||null,shop_phone:shop.phone||null,plan:shop.plan||null,request_type:requestType}};
  const {error}=await sb.from('feedback_requests').insert(payload);if(error)throw error;
  toast(`Request sent. The Mobile Mechanic AI team will contact this shop about ${name} setup.`,'good');
 }catch(err){toast(err.message||'Could not send the setup request.','bad');}finally{busy=false;}}
function back(){sessionStorage.removeItem(REOPEN_KEY);location.reload();}
document.addEventListener('click',e=>{
  const portal=e.target.closest?.('[data-open-parts-portal]');if(portal){e.preventDefault();window.open(portal.dataset.openPartsPortal,'_blank','noopener,noreferrer');return;}
  if(e.target.closest?.('[data-zapier-learn-more]')){e.preventDefault();requestIntegrationHelp('Zapier / Make automation','zapier_setup_interest');return;}
  if(e.target.closest?.('[data-onedrive-learn-more]')){e.preventDefault();requestIntegrationHelp('Microsoft OneDrive','onedrive_setup_interest');return;}
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
