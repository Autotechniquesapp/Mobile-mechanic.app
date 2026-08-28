(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
const names={stripe:'Stripe',square:'Square',paypal:'PayPal / Venmo'};
const detail={stripe:'Cards, hosted invoices, tax, Apple Pay / Google Pay where eligible.',square:'Cards, Square checkout links, invoices, Cash App Pay and wallets where eligible.',paypal:'PayPal checkout, Venmo for eligible U.S. merchants, and PayPal invoicing.'};
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.processor-toast')?.remove();const d=document.createElement('div');d.className=`toast processor-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5000);}
async function call(fn,body){if(!sb)throw new Error('Payment settings are not connected.');const {data,error}=await sb.functions.invoke(fn,{body});if(error)throw new Error(error.message||'Payment request failed.');if(data?.error)throw new Error(data.error);return data;}
function badge(p){const s=p.status||'not_connected';const label={connected:'Connected',connecting:'Connecting',needs_keys:'Needs setup',needs_attention:'Needs attention',disabled:'Disabled',not_connected:'Not connected'}[s]||s;return `<span class="badge ${s==='connected'?'green':s==='needs_attention'?'orange':'red'}">${esc(label)}</span>`;}
async function connect(provider){if(busy)return;busy=true;try{
  if(provider==='stripe'){
    const d=await call('stripe-connect',{action:'onboard',return_url:`${location.origin}/#settings`,refresh_url:`${location.origin}/#settings`});
    if(d?.url){location.href=d.url;return;}
  }
  if(provider==='square'){
    const d=await call('square-oauth',{return_url:`${location.origin}/#settings`});
    if(d?.url){location.href=d.url;return;}
  }
  if(provider==='paypal'){
    const d=await call('paypal-onboarding',{return_url:`${location.origin}/#settings`});
    if(d?.url){location.href=d.url;return;}
  }
  throw new Error(`${names[provider]||provider} did not return a connection link.`);
}catch(err){toast(err.message||'Could not connect payment processor.','bad');}finally{busy=false;}}
async function setDefault(provider){if(busy)return;busy=true;try{await call('payment-processors',{action:'set_default',provider});toast(`${names[provider]} is now the default customer payment processor.`,'good');await refresh();}catch(err){toast(err.message||'Could not change the default processor.','bad');}finally{busy=false;}}
async function refresh(){const old=document.querySelector('[data-payment-processors-panel]');old?.remove();await render();}
async function render(){
  if(location.hash.split('?')[0]!=='#settings')return;
  const main=document.querySelector('.content');if(!main||main.querySelector('[data-payment-processors-panel]')||!sb)return;
  const panel=document.createElement('section');panel.className='card card-pad';panel.dataset.paymentProcessorsPanel='1';panel.innerHTML='<div class="card-title">CUSTOMER PAYMENT PROCESSORS</div><div class="section-note">Each shop chooses where its repair-customer money goes. This does not change the Mobile Mechanic AI software subscription.</div><div class="divider"></div><div data-processor-body class="muted">Checking payment processors…</div>';
  main.prepend(panel);
  try{
    const d=await call('payment-processors',{action:'status'}),rows=d.processors||[];
    const by=Object.fromEntries(rows.map(x=>[x.provider,x]));
    panel.querySelector('[data-processor-body]').innerHTML=['stripe','square','paypal'].map(provider=>{
      const p=by[provider]||{provider,status:'not_connected',is_default:false};
      const connected=p.status==='connected';
      return `<div class="list-item"><div class="list-icon">${provider==='stripe'?'$':provider==='square'?'■':'P'}</div><div class="list-main"><b>${esc(names[provider])} ${badge(p)} ${p.is_default?'<span class="badge green">Default</span>':''}</b><p>${esc(detail[provider])}</p><div class="list-actions"><button class="btn ${connected?'btn-soft':'btn-primary'}" data-processor-connect="${provider}">${connected?'Manage / Reconnect':'Connect '+esc(names[provider])}</button>${connected&&!p.is_default?`<button class="btn btn-soft" data-processor-default="${provider}">Make Default</button>`:''}</div>${p.last_error?`<p class="small red">${esc(p.last_error)}</p>`:''}</div></div>`;
    }).join('')+`<div class="divider"></div><p class="small muted">Stripe is currently available for platform subscription billing. Square and PayPal/Venmo require their own developer credentials before their Connect buttons can complete authorization.</p><button class="btn btn-soft" data-processor-refresh>Refresh Processor Status</button>`;
  }catch(err){panel.querySelector('[data-processor-body]').innerHTML=`<div class="alert bad">${esc(err.message||'Could not load payment processors.')}</div><button class="btn btn-soft" data-processor-refresh>Try Again</button>`;}
}
document.addEventListener('click',e=>{const c=e.target.closest?.('[data-processor-connect]');if(c){e.preventDefault();connect(c.dataset.processorConnect);return;}const d=e.target.closest?.('[data-processor-default]');if(d){e.preventDefault();setDefault(d.dataset.processorDefault);return;}if(e.target.closest?.('[data-processor-refresh]')){e.preventDefault();refresh();}},true);
new MutationObserver(()=>setTimeout(render,0)).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>setTimeout(render,100));setTimeout(render,600);
})();