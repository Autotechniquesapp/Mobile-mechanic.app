(() => {
'use strict';
const URL='https://rapcejqlydedceegbcrs.supabase.co';
const KEY='sb_publishable_w8kcE-A3iHqL9YHr_MiTNQ_WtkWaNJx';
const sb=window.supabase?.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let loading=false;
let lastOpenProvider='';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const dollars=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(Number(c||0)/100);
const bytes=n=>{n=Number(n||0);if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`;return `${(n/1073741824).toFixed(2)} GB`;};
function detail(i){
  const p=i.public_settings||{};
  if(i.status==='connected'&&p.monthly_platform_fee===0)return 'Built in / $0 platform fee';
  if(i.provider==='quickbooks')return 'Developer app required · Builder starts at $0';
  if(i.provider==='xero')return 'Developer app required · first 5 shop connections $0';
  if(i.provider==='microsoft')return 'Free Microsoft Entra app registration required';
  if(i.provider==='dropbox')return 'Free Dropbox developer app required';
  if(i.provider==='resend')return 'Optional transactional email · free tier starts at $0';
  if(i.provider==='sms')return 'Twilio + A2P registration required · 100-message pack is server-capped';
  if(i.provider==='carfax')return 'CARFAX Service Network / partner approval required';
  if(i.provider==='autozone_pro')return 'AutoZone Pro electronic-ordering approval required';
  if(i.provider==='oreilly_pro')return "O’Reilly Pro / First Call integration approval required";
  if(i.provider==='napa_prolink')return 'NAPA PROLink / integration approval · published PROLink fee $0';
  if(i.provider==='parts_suppliers')return 'Commercial supplier connections are tracked separately below';
  if(i.provider==='service_data')return 'Later: licensed service/specification data provider required';
  if(i.provider==='plate_lookup')return 'Later: licensed plate-data provider required';
  if(i.provider==='youtube')return 'Context-aware YouTube repair search · $0 / no API key';
  if(i.provider==='openai')return i.last_error||'OpenAI account needs attention';
  if(i.provider==='zapier')return 'Optional shop-owned automation connection';
  if(i.provider==='storage')return 'Included in current Supabase project';
  if(i.provider==='stripe')return i.mode==='live'?'Live subscription billing':'Sandbox ready · live catalog auto-creates when live secret is installed';
  return i.last_error||'';
}
function setupLink(i){const raw=i?.public_settings?.setup_url;if(!raw)return '';try{const u=new URL(raw);if(u.protocol!=='https:')return '';return `<a href="${esc(u.href)}" target="_blank" rel="noopener" class="admin-btn" style="display:inline-block;margin-top:6px;text-decoration:none">Open Setup</a>`;}catch{return '';}}
function styles(){if(document.getElementById('adminCostStyles'))return;const s=document.createElement('style');s.id='adminCostStyles';s.textContent='.cost-strip{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:10px 12px;border-bottom:1px solid #242b33}.cost-chip{background:#090d12;border:1px solid #252d36;border-radius:8px;padding:8px}.cost-chip b{display:block;font-size:14px}.cost-chip span{font-size:9px;color:#8e98a5;text-transform:uppercase;letter-spacing:.5px}.integration-cost-note{font-size:10px;color:#8e98a5;margin-top:3px}.integration-row{display:block}.integration-row .integration-dot.error{background:#ef2a31}.integration-row summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;touch-action:manipulation}.integration-row summary::-webkit-details-marker{display:none}.integration-row summary:after{content:"›";margin-left:auto;color:#8e98a5;font-size:22px}.integration-row[open] summary:after{transform:rotate(90deg)}.integration-admin-detail{width:100%;padding:10px 0 0 20px;border-top:1px solid #252d36;margin-top:9px;font-size:11px;color:#b8c0ca}';document.head.appendChild(s);}
function render(data){const list=document.querySelector('.integration-list');if(!list)return;const m=data.metrics||{};let strip=document.getElementById('platformCostStrip');if(!strip){strip=document.createElement('div');strip.id='platformCostStrip';strip.className='cost-strip';list.before(strip);}strip.innerHTML=`<div class="cost-chip"><span>AI cost this month</span><b>${dollars(m.ai_provider_cost_cents_mtd)}</b></div><div class="cost-chip"><span>AI calls</span><b>${Number(m.ai_calls_mtd||0)}</b></div><div class="cost-chip"><span>SMS sent</span><b>${Number(m.sms_sent_mtd||0)}</b></div><div class="cost-chip"><span>Storage used</span><b>${bytes(m.storage_bytes)}</b></div>`;
list.innerHTML=(data.integrations||[]).map(i=>`<details class="integration-row" data-provider="${esc(i.provider)}" ${lastOpenProvider===i.provider?'open':''}><summary><span class="integration-dot ${esc(i.status)}"></span><div><b>${esc(i.display_name)}</b><div class="muted">${esc(String(i.status||'').replaceAll('_',' '))} · ${esc(i.mode||'')}</div><div class="integration-cost-note">${esc(detail(i))}</div></div></summary><div class="integration-admin-detail"><b>Status:</b> ${esc(String(i.status||'unknown').replaceAll('_',' '))}<br><b>Mode:</b> ${esc(i.mode||'not set')}<br><b>Last checked:</b> ${i.last_checked_at?esc(new Date(i.last_checked_at).toLocaleString()):'Never'}<br><b>Problem:</b> ${esc(i.last_error||'No reported error')}${setupLink(i)}</div></details>`).join('')||'<div class="admin-card muted">No integration records.</div>';
list.querySelectorAll('details[data-provider]').forEach(row=>row.addEventListener('toggle',()=>{if(row.open)lastOpenProvider=row.dataset.provider||'';else if(lastOpenProvider===row.dataset.provider)lastOpenProvider='';}));
}
async function load(){if(loading||!sb||!document.querySelector('.integration-list'))return;loading=true;try{const {data:{session}}=await sb.auth.getSession();if(!session)return;const {data,error}=await sb.functions.invoke('platform-costs',{body:{}});if(error)throw error;if(data?.error)throw new Error(data.error);render(data);}catch(err){console.warn('Platform cost panel:',err.message||err);}finally{loading=false;}}
styles();
const waitForList=new MutationObserver(()=>{if(!document.querySelector('.integration-list'))return;waitForList.disconnect();setTimeout(load,40);});
if(document.querySelector('.integration-list'))setTimeout(load,40);else waitForList.observe(document.documentElement,{childList:true,subtree:true});
setInterval(load,30000);
})();
