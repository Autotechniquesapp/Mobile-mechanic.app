(() => {
'use strict';

const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
const SYNC_KEY='mma_square_last_sync_';
const AUTO_SYNC_MS=3*60*1000;
let syncing=false,modalOpen=false,statusLoading=false,lastStatusRead=0,dashboardRendering=false,lastDashboardRender=0;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId||null,shop=sid?db.shops?.[sid]:null,user=shop?.users?.find?.(row=>String(row.id)===String(db.session?.userId));return {db,sid,shop,user};}
function canView(){const {db,user}=context();return db.session?.role==='platform_owner'||['owner','manager','service_writer'].includes(String(user?.role||''));}
function esc(value=''){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function money(value){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value||0));}
function safeSquareUrl(value){try{const url=new URL(String(value||''));const host=url.hostname.toLowerCase();return url.protocol==='https:'&&(host==='squareup.com'||host.endsWith('.squareup.com')||host==='square.link'||host.endsWith('.square.link')||host==='square.site'||host.endsWith('.square.site'))?url.href:'';}catch{return '';}}
function toast(message,type=''){document.querySelector('.square-sync-toast')?.remove();const node=document.createElement('div');node.className=`toast square-sync-toast ${type}`;node.textContent=message;document.body.appendChild(node);setTimeout(()=>node.remove(),5000);}
function route(){return (location.hash||'#login').slice(1).split('?')[0];}
async function invoke(functionName,body){if(!sb)throw new Error('Square sync is unavailable.');const {sid}=context();const {data,error}=await sb.functions.invoke(functionName,{body:{...body,...(sid?{shop_id:sid}:{})}});if(error){let detail='';try{const payload=await error.context?.json?.();detail=String(payload?.error||'');}catch{}throw new Error(detail||error.message||'Square request failed.');}if(data?.error)throw new Error(data.error);return data;}

async function sync(force=false,showMessage=false){
  const {sid}=context();if(!sid||!canView()||syncing)return null;
  const last=Number(localStorage.getItem(`${SYNC_KEY}${sid}`)||0);
  if(!force&&Date.now()-last<AUTO_SYNC_MS)return null;
  syncing=true;updateSyncButtons(true);
  try{
    const data=await invoke('square-sync',{action:'sync_all'});
    localStorage.setItem(`${SYNC_KEY}${sid}`,String(Date.now()));
    if(showMessage){const customers=data.customers?.local??0,payments=data.payments?.completed??0;toast(`Square synced: ${customers} customers and ${payments} completed payments.`,`good`);}
    await Promise.all([renderDashboardSummary(true),renderProcessorStatus(data.status)]);
    return data;
  }catch(error){
    if(showMessage)toast(error.message||'Square sync failed.','bad');
    return null;
  }finally{syncing=false;updateSyncButtons(false);}
}

function updateSyncButtons(active){document.querySelectorAll('[data-square-sync-now]').forEach(button=>{button.disabled=active;button.textContent=active?'Syncing Square…':'Sync Square Now';});}
async function loadInvoiceRows(){
  const {sid}=context();if(!sid||!sb)return {open:[],drafts:[]};
  const [mirrorResult,localResult,paymentResult]=await Promise.all([
    sb.from('payment_processor_invoices').select('*').eq('shop_id',sid).eq('provider','square').order('provider_updated_at',{ascending:false}),
    sb.from('invoices').select('id,job_id,status,total,paid_at,processor_status,processor_payment_id,processor_payment_url,processor_metadata,payment_links,created_at').eq('shop_id',sid).eq('payment_processor','square').order('created_at',{ascending:false}),
    sb.from('payment_transactions').select('external_payment_id,local_invoice_id,external_order_id,status,amount,refunded,tip,processing_fee,receipt_url,paid_at').eq('shop_id',sid).eq('provider','square').order('paid_at',{ascending:false})
  ]);
  if(mirrorResult.error&&mirrorResult.error.code!=='42P01')throw mirrorResult.error;
  if(localResult.error)throw localResult.error;
  if(paymentResult.error&&paymentResult.error.code!=='42P01')throw paymentResult.error;
  const mirror=mirrorResult.data||[],local=localResult.data||[];
  const payments=paymentResult.data||[];
  const paymentsByInvoice=new Map(),paymentsByOrder=new Map();
  for(const payment of payments){
    const refundable=String(payment.status||'').toUpperCase()==='COMPLETED'?Math.max(0,Number(payment.amount||0)-Number(payment.refunded||0)):0;
    const item={id:payment.external_payment_id,refundable,paidAt:payment.paid_at};
    if(payment.local_invoice_id){const key=String(payment.local_invoice_id),list=paymentsByInvoice.get(key)||[];list.push(item);paymentsByInvoice.set(key,list);}
    if(payment.external_order_id){const key=String(payment.external_order_id),list=paymentsByOrder.get(key)||[];list.push(item);paymentsByOrder.set(key,list);}
  }
  const mirroredLocal=new Set(mirror.map(row=>String(row.local_invoice_id||'')).filter(Boolean));
  const customerIds=[...new Set(mirror.map(row=>row.local_customer_id).filter(Boolean))];
  let customers=[];
  if(customerIds.length){const result=await sb.from('customers').select('id,name').eq('shop_id',sid).in('id',customerIds);if(!result.error)customers=result.data||[];}
  const customerNames=new Map(customers.map(row=>[String(row.id),row.name]));
  const rows=mirror.map(row=>{
    const matchedPayments=paymentsByInvoice.get(String(row.local_invoice_id||''))||paymentsByOrder.get(String(row.external_order_id||''))||[];
    return {source:'mirror',localId:row.local_invoice_id||null,externalId:row.external_invoice_id,externalOrderId:row.external_order_id||null,
    invoiceNumber:row.invoice_number||'',customerName:customerNames.get(String(row.local_customer_id||''))||'',
    status:String(row.status||'DRAFT').toUpperCase(),total:Number(row.total||0),paid:Number(row.paid||0),
    balance:Number(row.balance||0),refundable:matchedPayments.reduce((sum,payment)=>sum+payment.refundable,0),payments:matchedPayments,
    url:safeSquareUrl(row.public_url),updatedAt:row.provider_updated_at||row.updated_at};
  });
  for(const row of local){
    if(mirroredLocal.has(String(row.id)))continue;
    const paid=Number(row.processor_metadata?.total_paid||0),total=Number(row.total||0);
    rows.push({source:'local',localId:row.id,externalId:row.processor_payment_id||row.processor_metadata?.square_invoice_id||null,
      invoiceNumber:row.processor_metadata?.square_invoice_number||'',customerName:'',status:String(row.processor_status||row.status||'DRAFT').toUpperCase(),
      total,paid,balance:Math.max(0,Number(row.processor_metadata?.remaining_calculated??(total-paid))),refundable:0,payments:[],
      url:safeSquareUrl(row.processor_payment_url||row.payment_links?.square),updatedAt:row.created_at});
  }
  const openStatuses=new Set(['UNPAID','PARTIALLY_PAID','PAYMENT_PENDING','SCHEDULED','SENT','DEPOSIT_DUE']);
  const recentPayments=payments.map(payment=>({id:payment.external_payment_id,status:String(payment.status||'UNKNOWN').toUpperCase(),amount:Number(payment.amount||0),refunded:Number(payment.refunded||0),tip:Number(payment.tip||0),fee:Number(payment.processing_fee||0),receiptUrl:safeSquareUrl(payment.receipt_url),paidAt:payment.paid_at}));
  return {open:rows.filter(row=>openStatuses.has(row.status)&&row.balance>0),drafts:rows.filter(row=>row.status==='DRAFT'),payments:recentPayments};
}

async function renderDashboardSummary(force=false){
  const summary=document.querySelector('[data-open-invoices-summary]');if(!summary||!canView())return;
  if(dashboardRendering||(!force&&Date.now()-lastDashboardRender<5000))return;
  dashboardRendering=true;lastDashboardRender=Date.now();
  try{const {open}=await loadInvoiceRows(),due=open.reduce((sum,row)=>sum+Number(row.balance||0),0);summary.textContent=open.length?`${open.length} customer invoice${open.length===1?'':'s'} • ${money(due)} due`:'No unpaid customer invoices';}
  catch{summary.textContent='View customer invoices';}
  finally{dashboardRendering=false;}
}

function invoiceRow(row){
  const title=row.invoiceNumber?`Invoice #${esc(row.invoiceNumber)}`:'Square invoice';
  const customer=row.customerName?`<small>${esc(row.customerName)}</small>`:'';
  const actions=[];
  if(row.url)actions.push(`<button class="btn btn-primary" data-square-open-url="${esc(row.url)}">Open Invoice</button>`,`<button class="btn btn-soft" data-square-share-url="${esc(row.url)}">Share Payment Link</button>`);
  else actions.push('<button class="btn btn-soft" data-square-dashboard>Open Square</button>');
  if(row.localId&&row.status==='DRAFT')actions.push(`<button class="btn btn-primary" data-square-publish="${esc(row.localId)}">Publish After Review</button>`);
  if(row.localId&&['UNPAID','PARTIALLY_PAID','PAYMENT_PENDING','SCHEDULED','SENT'].includes(row.status))actions.push(`<button class="btn btn-danger" data-square-cancel="${esc(row.localId)}">Cancel</button>`);
  if(row.localId&&row.refundable>0)actions.push(`<button class="btn btn-soft" data-square-refund="${esc(row.localId)}" data-square-refundable="${Math.max(0,row.refundable).toFixed(2)}">Refund</button>`);
  return `<article class="square-invoice-row"><div><b>${title}</b>${customer}<small>${esc(row.status.replaceAll('_',' '))} · ${money(row.total)} total</small><strong>${money(row.paid)} paid · ${money(row.balance)} remaining</strong></div><div class="square-invoice-actions">${actions.join('')}</div></article>`;
}
function paymentRow(row){const when=row.paidAt?new Date(row.paidAt).toLocaleString():'Date unavailable',net=Math.max(0,row.amount-row.refunded),details=[`${money(net)} after refunds`,row.tip>0?`${money(row.tip)} tip`:null,row.fee>0?`${money(row.fee)} Square fee`:null].filter(Boolean).join(' · '),receipt=row.receiptUrl?`<button class="btn btn-soft" data-square-open-url="${esc(row.receiptUrl)}">View Receipt</button>`:'';return `<article class="square-invoice-row"><div><b>${money(row.amount)} payment</b><small>${esc(when)} · ${esc(row.status.replaceAll('_',' '))}</small><strong>${esc(details)}</strong></div>${receipt?`<div class="square-invoice-actions">${receipt}</div>`:''}</article>`;}
async function openInvoices(){
  if(!canView())return;
  modalOpen=true;
  document.querySelector('[data-square-invoices-modal]')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div class="square-modal-backdrop" data-square-invoices-modal><section class="square-modal" role="dialog" aria-modal="true" aria-label="Square invoices"><header><div><h2>Square Invoices</h2><p>These are customer balances owed to your shop—not bills you owe Square.</p></div><button type="button" data-square-close aria-label="Close">×</button></header><div class="square-modal-tools"><button class="btn btn-primary" data-square-sync-now>Sync Square Now</button><button class="btn btn-soft" data-square-dashboard>Open Square Dashboard</button></div><div data-square-invoice-list class="muted">Loading invoices…</div></section></div>`);
  await refreshInvoiceModal();
}
async function refreshInvoiceModal(){
  const list=document.querySelector('[data-square-invoice-list]');if(!list)return;
  try{const {open,drafts,payments}=await loadInvoiceRows();list.innerHTML=`<div class="square-list-heading"><b>UNPAID CUSTOMER INVOICES</b><span>${open.length}</span></div>${open.map(invoiceRow).join('')||'<div class="square-empty">No unpaid customer invoices.</div>'}<div class="square-list-heading"><b>DRAFTS — NOT SENT</b><span>${drafts.length}</span></div>${drafts.map(invoiceRow).join('')||'<div class="square-empty">No Square drafts.</div>'}<div class="square-list-heading"><b>RECENT SQUARE PAYMENTS</b><span>${payments.length}</span></div>${payments.slice(0,20).map(paymentRow).join('')||'<div class="square-empty">No synchronized Square payments yet.</div>'}`;}
  catch(error){list.innerHTML=`<div class="alert bad">${esc(error.message||'Could not load Square invoices.')}</div>`;}
}
function closeInvoices(){modalOpen=false;document.querySelector('[data-square-invoices-modal]')?.remove();}

async function renderProcessorStatus(status=null){
  const card=document.querySelector('[data-processor-card="square"]');if(!card||!canView())return;
  let box=card.querySelector('[data-square-sync-panel]');
  if(!box){card.insertAdjacentHTML('beforeend','<div class="square-sync-panel" data-square-sync-panel><b>Customer & payment sync</b><p data-square-sync-summary>Customers, invoices, payments and refunds sync with this shop’s Square account.</p><button class="btn btn-primary" data-square-sync-now>Sync Square Now</button></div>');box=card.querySelector('[data-square-sync-panel]');}
  if(!status){
    if(statusLoading||Date.now()-lastStatusRead<5000)return;
    statusLoading=true;lastStatusRead=Date.now();
    try{status=await invoke('square-sync',{action:'status'});}catch{return;}finally{statusLoading=false;}
  }
  const summary=box?.querySelector('[data-square-sync-summary]');
  if(summary&&status){const when=status.last_synced_at?new Date(status.last_synced_at).toLocaleString():'Not synced yet';summary.textContent=`${status.invoices?.open||0} unpaid · ${money(status.invoices?.open_balance||0)} due · ${status.payments?.completed||0} paid · Last sync ${when}`;}
}

async function invoiceAction(action,invoiceId,extra={}){
  try{const data=await invoke('square-invoice',{action,invoice_id:invoiceId,...extra});await sync(true,false);await refreshInvoiceModal();await renderDashboardSummary(true);return data;}
  catch(error){toast(error.message||`Square ${action} failed.`,'bad');return null;}
}

document.addEventListener('click',async event=>{
  const openTile=event.target.closest?.('[data-open-invoices]');
  if(openTile){event.preventDefault();event.stopImmediatePropagation();await openInvoices();return;}
  if(event.target.closest?.('[data-square-close]')||event.target.matches?.('[data-square-invoices-modal]')){event.preventDefault();closeInvoices();return;}
  if(event.target.closest?.('[data-square-sync-now]')){event.preventDefault();await sync(true,true);if(modalOpen)await refreshInvoiceModal();return;}
  if(event.target.closest?.('[data-square-dashboard]')){event.preventDefault();window.open('https://squareup.com/dashboard/sales/invoices','_blank','noopener');return;}
  const link=event.target.closest?.('[data-square-open-url]');if(link){event.preventDefault();window.open(link.dataset.squareOpenUrl,'_blank','noopener');return;}
  const share=event.target.closest?.('[data-square-share-url]');if(share){event.preventDefault();const url=share.dataset.squareShareUrl||'';try{if(navigator.share)await navigator.share({title:'Square invoice',text:'Here is your repair invoice and secure payment link.',url});else{await navigator.clipboard.writeText(url);toast('Square payment link copied.','good');}}catch(error){if(error?.name!=='AbortError')toast('Could not share the Square payment link.','bad');}return;}
  const publish=event.target.closest?.('[data-square-publish]');if(publish){event.preventDefault();if(!confirm('Publish this Square draft and make it payable? This does not automatically email or text the customer; share the payment link after publishing.'))return;const data=await invoiceAction('publish',publish.dataset.squarePublish);if(data)toast('Square invoice published. Share its payment link with the customer.','good');return;}
  const cancel=event.target.closest?.('[data-square-cancel]');if(cancel){event.preventDefault();if(!confirm('Cancel this Square invoice? The customer will no longer be able to pay it.'))return;const data=await invoiceAction('cancel',cancel.dataset.squareCancel);if(data)toast('Square invoice canceled.','good');return;}
  const refund=event.target.closest?.('[data-square-refund]');if(refund){event.preventDefault();const maximum=Number(refund.dataset.squareRefundable||0),raw=prompt(`Refund amount (maximum ${money(maximum)}):`,maximum.toFixed(2));if(raw===null)return;const amount=Number(raw);if(!(amount>0)||amount>maximum){toast('Enter a valid refund amount.','bad');return;}if(!confirm(`Refund ${money(amount)} through Square?`))return;const idempotency_key=window.crypto?.randomUUID?.()||`refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;const data=await invoiceAction('refund',refund.dataset.squareRefund,{amount,idempotency_key});if(data)toast(`Square refund ${data.status||'submitted'}.`,'good');return;}
},true);

function mount(){
  if(!canView())return;
  if(route()==='dashboard'){renderDashboardSummary();sync(false,false);}
  if(route()==='settings')setTimeout(()=>renderProcessorStatus(),100);
}
new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,150));
window.addEventListener('focus',()=>{if(route()==='dashboard')sync(false,false);});
setInterval(()=>{if(document.visibilityState==='visible'&&['dashboard','settings'].includes(route()))sync(false,false);},AUTO_SYNC_MS);
setTimeout(mount,900);
window.MobileMechanicSquareSync={sync,openInvoices,refreshDashboard:renderDashboardSummary};
})();
