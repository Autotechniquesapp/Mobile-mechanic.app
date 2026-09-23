(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
if(!sb)return;
let busy=false,timer=null;
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.mcp-toast')?.remove();const d=document.createElement('div');d.className=`toast mcp-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5000);}
async function call(action,provider=''){const {data,error}=await sb.functions.invoke('mcp-connections',{body:{action,...(provider?{provider}:{})}});if(error)throw new Error(error.message||'Connected-app request failed.');if(data?.error)throw new Error(data.error);return data;}
function main(){if(!location.hash.startsWith('#settings'))return null;return document.querySelector('.content');}
function badge(status){const map={connected:['Connected','green'],connecting:['Connecting','orange'],needs_attention:['Needs attention','orange'],not_connected:['Not connected','red'],disabled:['Disabled','red']};const [label,cls]=map[status]||[status||'Not connected','red'];return `<span class="badge ${cls}">${esc(label)}</span>`;}
function cardMarkup(c){const connected=c.status==='connected';const working=c.status==='connecting';return `<div class="list-item" data-mcp-provider="${esc(c.provider)}"><div class="list-icon">↔</div><div class="list-main"><b>${esc(c.name)} ${badge(c.status)} <span class="badge">MCP</span></b><p>${esc(c.notes||'Connect an existing account without pasting API keys.')}</p>${c.last_error?`<p class="small red">${esc(c.last_error)}</p>`:''}<div class="list-actions">${connected?`<button class="btn btn-soft" data-mcp-test="${esc(c.provider)}">Check Connection</button><button class="btn btn-danger" data-mcp-disconnect="${esc(c.provider)}">Disconnect</button>`:`<button class="btn btn-primary" data-mcp-connect="${esc(c.provider)}" ${working?'disabled':''}>${working?'Connecting…':'Connect '+esc(c.name)}</button>`}</div></div></div>`;}
function sectionMarkup(){return `<section class="card card-pad" data-mcp-connections-panel style="margin-top:18px"><div class="card-title">CONNECTED APPS</div><div class="section-note">Connect the shop's existing accounts. No API keys to paste into Mobile Mechanic AI.</div><div class="divider"></div><div data-mcp-connections-body class="muted">Checking available connections…</div><div class="divider"></div><p class="small muted">MCP connections are separate from Mobile Mechanic AI subscription billing and from the shop's customer payment processing.</p></section>`;}
async function render(){
  const host=main();if(!host)return;
  let panel=host.querySelector('[data-mcp-connections-panel]');
  if(!panel){const payment=host.querySelector('[data-payment-processing-launcher]');if(payment)payment.insertAdjacentHTML('beforebegin',sectionMarkup());else host.insertAdjacentHTML('beforeend',sectionMarkup());panel=host.querySelector('[data-mcp-connections-panel]');}
  const body=panel?.querySelector('[data-mcp-connections-body]');if(!body||busy)return;
  try{const data=await call('status');const rows=data.connectors||[];body.innerHTML=rows.length?rows.map(cardMarkup).join(''):'<p>No approved MCP connections are available yet.</p>';}catch(err){body.innerHTML=`<div class="alert bad">${esc(err.message||'Could not load connected apps.')}</div><button class="btn btn-soft" data-mcp-refresh>Try Again</button>`;}
}
async function connect(provider){if(busy)return;busy=true;try{const d=await call('start',provider);if(!d?.url)throw new Error('The connector did not return a sign-in link.');location.assign(d.url);}catch(err){toast(err.message||'Could not start account connection.','bad');busy=false;render();}}
async function test(provider){if(busy)return;busy=true;try{const d=await call('test',provider);toast(`Connection works${Number.isFinite(d?.tool_count)?` · ${d.tool_count} tools available`:''}.`,'good');}catch(err){toast(err.message||'Connection check failed.','bad');}finally{busy=false;render();}}
async function disconnect(provider){if(busy)return;if(!confirm('Disconnect this shop account from Mobile Mechanic AI?'))return;busy=true;try{await call('disconnect',provider);toast('Connected app removed.','good');}catch(err){toast(err.message||'Could not disconnect the account.','bad');}finally{busy=false;render();}}
document.addEventListener('click',e=>{const c=e.target.closest?.('[data-mcp-connect]');if(c){e.preventDefault();connect(c.dataset.mcpConnect);return;}const t=e.target.closest?.('[data-mcp-test]');if(t){e.preventDefault();test(t.dataset.mcpTest);return;}const d=e.target.closest?.('[data-mcp-disconnect]');if(d){e.preventDefault();disconnect(d.dataset.mcpDisconnect);return;}if(e.target.closest?.('[data-mcp-refresh]')){e.preventDefault();render();}},true);
function callbackToast(){const q=new URLSearchParams(location.search);const result=q.get('mcp');if(!result)return;if(result==='connected')toast('Account connected.','good');else toast(q.get('message')||'Account connection failed.','bad');q.delete('mcp');q.delete('provider');q.delete('message');const qs=q.toString();history.replaceState(null,'',location.pathname+(qs?`?${qs}`:'')+location.hash);}
function schedule(){clearTimeout(timer);timer=setTimeout(render,120);}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);
callbackToast();
setTimeout(render,650);
})();