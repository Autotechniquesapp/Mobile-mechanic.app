(() => {
'use strict';
const ROOT=document.getElementById('adminApp');
const SUPABASE_URL='https://rapcejqlydedceegbcrs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_w8kcE-A3iHqL9YHr_MiTNQ_WtkWaNJx';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const date=v=>v?new Date(v).toLocaleDateString():'—';
let current=null;

async function call(body){
  const {data,error}=await sb.functions.invoke('platform-admin',{body});
  if(error) throw new Error(error.message||'Admin request failed.');
  if(data?.error) throw new Error(data.error);
  return data;
}
function note(msg,type=''){const el=document.getElementById('adminNote');if(!el)return;el.className=type;el.textContent=msg||'';}

function loginScreen(msg=''){
  ROOT.innerHTML=`<div class="login-wrap"><div class="login-card"><h1>Mobile <span style="color:#ef2a31">Mechanic</span> AI</h1><p class="muted">Platform Admin</p>${msg?`<p class="error">${esc(msg)}</p>`:''}<form id="adminLogin"><div class="field"><label>Email</label><input name="email" type="email" autocomplete="username" required></div><div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div><button class="admin-btn primary" type="submit">Log In</button></form><p class="muted" style="font-size:12px;margin-top:16px">Use the same account you use for your shop. If you have not created it yet, create your shop account first.</p><a href="/#signup" style="color:#ef2a31">Create shop account</a></div></div>`;
  document.getElementById('adminLogin').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const {error}=await sb.auth.signInWithPassword({email:d.email,password:d.password});if(error)return loginScreen(error.message);await boot();});
}
function bootstrapScreen(){
  ROOT.innerHTML=`<div class="login-wrap"><div class="login-card"><h1>Platform Owner Setup</h1><p class="muted">Your account is signed in, but Platform Owner has not been claimed yet.</p><p>Enter the one-time owner setup code.</p><form id="bootstrapForm"><div class="field"><label>Owner setup code</label><input name="code" required autocomplete="off"></div><button class="admin-btn primary" type="submit">Attach Platform Owner + Autotechniques</button></form><p id="adminNote"></p><button id="bootstrapLogout" class="admin-btn">Log Out</button></div></div>`;
  document.getElementById('bootstrapForm').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));note('Securing owner account…');try{await call({action:'bootstrap',code:d.code});note('Platform Owner attached.','success');setTimeout(boot,250);}catch(err){note(err.message,'error');}});
  document.getElementById('bootstrapLogout').onclick=async()=>{await sb.auth.signOut();loginScreen();};
}
function noAccessScreen(){ROOT.innerHTML=`<div class="login-wrap"><div class="login-card"><h1>Admin Access Required</h1><p>This login is not a Platform Admin.</p><a class="admin-btn" href="/">Open Shop Workspace</a><button id="noAccessLogout" class="admin-btn">Log Out</button></div></div>`;document.getElementById('noAccessLogout').onclick=async()=>{await sb.auth.signOut();loginScreen();};}

function render(data){
  current=data;
  const m=data.metrics||{};const owner=data.role==='platform_owner';
  ROOT.innerHTML=`<div class="admin-shell"><header class="admin-top"><div class="admin-brand">Mobile <span>Mechanic</span> AI — Platform Admin</div><span class="status active">${esc(data.role)}</span><div class="admin-spacer"></div><a class="admin-btn primary" href="/">My Shop — Autotechniques</a><button class="admin-btn" id="refreshAdmin">Refresh</button><button class="admin-btn" id="logoutAdmin">Log Out</button></header><p id="adminNote"></p>
  <div class="admin-grid"><div class="admin-card metric red"><small>Total Shops</small><b>${m.total_shops||0}</b></div><div class="admin-card metric"><small>Trials</small><b>${m.trialing||0}</b></div><div class="admin-card metric"><small>Paying</small><b>${m.paying||0}</b></div><div class="admin-card metric"><small>MRR</small><b>${money(m.mrr)}</b></div><div class="admin-card metric"><small>Past Due</small><b>${m.past_due||0}</b></div><div class="admin-card metric"><small>Suspended</small><b>${m.suspended||0}</b></div></div>
  <section class="section"><h2>Shops</h2><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Shop</th><th>Referral</th><th>Plan</th><th>Status</th><th>Trial Ends</th><th>Users</th><th>Actions</th></tr></thead><tbody>${(data.shops||[]).map(s=>shopRow(s,owner)).join('')}</tbody></table></div></section>
  <section class="section"><h2>Sales / Referral Tracking</h2><div class="ref-grid">${(data.referrals||[]).length?(data.referrals||[]).map(r=>`<div class="admin-card"><b>${esc(r.source)}</b><div style="margin-top:8px"><strong>${r.signups}</strong> signup${r.signups===1?'':'s'} · <strong>${r.paying}</strong> paying</div></div>`).join(''):'<div class="admin-card muted">No referral signups yet.</div>'}</div></section>
  <section class="section"><h2>Admin Activity</h2><div class="activity">${(data.activity||[]).length?(data.activity||[]).map(a=>`<div class="activity-row"><b>${esc(a.action)}</b> <span class="muted">${new Date(a.created_at).toLocaleString()}</span><div class="muted">${esc(a.actor_role||'admin')}${a.affected_shop_id?` · ${esc(a.affected_shop_id)}`:''}</div></div>`).join(''):'<div class="admin-card muted">No admin actions recorded yet.</div>'}</div></section></div>`;
  document.getElementById('refreshAdmin').onclick=loadOverview;
  document.getElementById('logoutAdmin').onclick=async()=>{await sb.auth.signOut();loginScreen();};
  bindActions();
}
function shopRow(s,owner){
  const own=s.slug==='autotechniques';
  const source=s.referral_code||s.referred_by_name||'—';
  const planNames={solo:'Solo',shop:'Shop',pro_fleet:'Pro / Fleet'};
  return `<tr><td><b>${esc(s.name)}</b>${own?'<br><span class="owner-shop">OWNER SHOP · NON-EXPIRING</span>':''}<br><span class="muted">${esc(s.slug)}</span></td><td>${esc(source)}</td><td>${owner&&!own?`<select class="admin-select plan-select" data-shop="${esc(s.shop_id)}"><option value="solo" ${s.plan==='solo'?'selected':''}>Solo — $69</option><option value="shop" ${s.plan==='shop'?'selected':''}>Shop — $149</option><option value="pro_fleet" ${s.plan==='pro_fleet'?'selected':''}>Pro / Fleet — $249</option></select>`:`${esc(planNames[s.plan]||s.plan)}`}</td><td><span class="status ${esc(s.billing_status)}">${esc(s.billing_status)}</span></td><td>${own?'Non-expiring':date(s.trial_expires_at)}</td><td>${Number(s.active_members||0)}</td><td><div class="admin-actions">${owner&&!own?`<button class="admin-btn" data-admin-action="extend" data-shop="${esc(s.shop_id)}">+30 Days</button>${s.billing_status==='suspended'?`<button class="admin-btn" data-admin-action="status" data-status="active" data-shop="${esc(s.shop_id)}">Reactivate</button>`:`<button class="admin-btn danger" data-admin-action="status" data-status="suspended" data-shop="${esc(s.shop_id)}">Suspend</button>`}<button class="admin-btn" data-admin-action="status" data-status="comped" data-shop="${esc(s.shop_id)}">Comp</button>`:'<span class="muted">Protected</span>'}</div></td></tr>`;
}
function bindActions(){
  document.querySelectorAll('.plan-select').forEach(el=>el.addEventListener('change',async()=>{note('Updating plan…');try{await call({action:'set_plan',shop_id:el.dataset.shop,plan:el.value});await loadOverview();note('Plan updated.','success');}catch(err){note(err.message,'error');}}));
  document.querySelectorAll('[data-admin-action]').forEach(btn=>btn.addEventListener('click',async()=>{const a=btn.dataset.adminAction;note('Applying change…');try{if(a==='extend')await call({action:'extend_trial',shop_id:btn.dataset.shop,days:30});if(a==='status')await call({action:'set_status',shop_id:btn.dataset.shop,status:btn.dataset.status});await loadOverview();note('Shop updated.','success');}catch(err){note(err.message,'error');}}));
}
async function loadOverview(){try{const data=await call({action:'overview'});render(data);}catch(err){note(err.message,'error');}}
async function boot(){
  const {data:{session}}=await sb.auth.getSession();if(!session)return loginScreen();
  try{const status=await call({action:'status'});if(status.is_admin)return loadOverview();if(status.bootstrap_available)return bootstrapScreen();return noAccessScreen();}catch(err){loginScreen(err.message);}
}
boot();
})();
