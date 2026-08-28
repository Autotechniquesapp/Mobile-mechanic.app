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
let activeFilter='all';

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
  ROOT.innerHTML=`<div class="admin-shell"><header class="admin-top"><div class="admin-mark">MM</div><div class="admin-title"><div class="admin-brand">Mobile <span>Mechanic</span> AI</div><div class="admin-sub">Platform command center</div></div><div class="admin-spacer"></div><div class="admin-actions-top"><span class="status active">${esc(data.role).replace('_',' ')}</span><a class="admin-btn primary" href="/#dashboard">My Shop</a><button class="admin-btn" id="refreshAdmin">Refresh</button><button class="admin-btn" id="logoutAdmin">Log Out</button></div></header><p id="adminNote"></p>
  <div class="admin-grid"><button class="admin-card metric red" data-filter="all"><small>Total Shops</small><b>${m.total_shops||0}</b></button><button class="admin-card metric" data-filter="trialing"><small>Trials</small><b>${m.trialing||0}</b></button><button class="admin-card metric" data-filter="active"><small>Paying</small><b>${m.paying||0}</b></button><button class="admin-card metric" data-filter="mrr"><small>MRR</small><b>${money(m.mrr)}</b></button><button class="admin-card metric" data-filter="past_due"><small>Past Due</small><b>${m.past_due||0}</b></button><button class="admin-card metric" data-filter="suspended"><small>Suspended</small><b>${m.suspended||0}</b></button></div>
  <div class="admin-main"><section class="section admin-panel"><div class="panel-head"><div><h2 id="shopSectionTitle">Shops</h2><p id="shopSectionHelp">Manage trials, plans, status, and protected owner access.</p></div></div><div class="bulk-bar"><label><input id="selectVisibleShops" class="admin-check" type="checkbox"> Select visible</label><span id="selectedCount" class="muted">0 selected</span><div class="bulk-actions"><button class="admin-btn" data-bulk-action="extend">+30 Days</button><button class="admin-btn" data-bulk-action="comped">Comp</button><button class="admin-btn danger" data-bulk-action="suspended">Suspend</button><button class="admin-btn" data-bulk-action="active">Reactivate</button><button class="admin-btn" data-bulk-action="message">Thank-you / Reminder</button></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th class="check-cell"></th><th>Shop</th><th>Referral</th><th>Plan</th><th>Status</th><th>Trial</th><th>Users</th><th>Actions</th></tr></thead><tbody>${(data.shops||[]).map(s=>shopRow(s,owner)).join('')}</tbody></table><div id="shopEmpty" class="admin-empty"></div></div></section>
  <aside class="side-stack"><section class="section admin-panel"><div class="panel-head"><div><h2>Referrals</h2><p>Signup source tracking.</p></div></div><div class="ref-grid" style="padding:12px">${(data.referrals||[]).length?(data.referrals||[]).map(r=>`<div class="admin-card"><b>${esc(r.source)}</b><div class="muted" style="margin-top:6px">${r.signups} signup${r.signups===1?'':'s'} · ${r.paying} paying</div></div>`).join(''):'<div class="admin-card muted">No referral signups yet.</div>'}</div></section>
  <section class="section admin-panel"><div class="panel-head"><div><h2>Activity</h2><p>Recent admin actions.</p></div></div><div class="activity">${(data.activity||[]).length?(data.activity||[]).slice(0,8).map(a=>`<div class="activity-row"><b>${esc(a.action)}</b><div class="muted">${new Date(a.created_at).toLocaleString()}</div><div class="muted">${esc(a.actor_role||'admin')}${a.affected_shop_id?` · ${esc(a.affected_shop_id)}`:''}</div></div>`).join(''):'<div class="admin-card muted">No admin actions recorded yet.</div>'}</div></section></aside></div></div>`;
  document.getElementById('refreshAdmin').onclick=loadOverview;
  document.getElementById('logoutAdmin').onclick=async()=>{await sb.auth.signOut();loginScreen();};
  bindMetricFilters();
  bindBulkActions();
  applyShopFilter(activeFilter);
  updateSelectionCount();
  bindActions();
}
function shopRow(s,owner){
  const own=s.slug==='autotechniques';
  const source=s.referral_code||s.referred_by_name||'—';
  const planNames={solo:'Solo',shop:'Shop',pro_fleet:'Pro / Fleet'};
  return `<tr data-shop-status="${esc(s.billing_status)}" data-shop-id="${esc(s.shop_id)}" data-protected="${own?'true':'false'}"><td class="check-cell" data-label="Select"><input class="admin-check shop-check" type="checkbox" data-shop="${esc(s.shop_id)}" ${own?'disabled title="Protected owner shop"':''}></td><td data-label="Shop"><div class="shop-name">${esc(s.name)}</div>${own?'<div class="owner-shop">Owner shop · non-expiring</div>':''}<div class="shop-slug">${esc(s.slug)}</div></td><td data-label="Referral">${esc(source)}</td><td data-label="Plan">${owner&&!own?`<select class="admin-select plan-select" data-shop="${esc(s.shop_id)}"><option value="solo" ${s.plan==='solo'?'selected':''}>Solo · $29.99</option><option value="shop" ${s.plan==='shop'?'selected':''}>Shop · $69.99</option><option value="pro_fleet" ${s.plan==='pro_fleet'?'selected':''}>Pro / Fleet · $129.99</option></select>`:`${esc(planNames[s.plan]||s.plan)}`}</td><td data-label="Status"><span class="status ${esc(s.billing_status)}">${esc(s.billing_status)}</span></td><td data-label="Trial">${own?'Non-expiring':date(s.trial_expires_at)}</td><td data-label="Users">${Number(s.active_members||0)}</td><td data-label="Actions"><div class="admin-actions">${owner&&!own?`<button class="admin-btn" data-admin-action="extend" data-shop="${esc(s.shop_id)}">+30 Days</button>${s.billing_status==='suspended'?`<button class="admin-btn" data-admin-action="status" data-status="active" data-shop="${esc(s.shop_id)}">Reactivate</button>`:`<button class="admin-btn danger" data-admin-action="status" data-status="suspended" data-shop="${esc(s.shop_id)}">Suspend</button>`}<button class="admin-btn" data-admin-action="status" data-status="comped" data-shop="${esc(s.shop_id)}">Comp</button>`:'<span class="muted">Protected</span>'}</div></td></tr>`;
}
function bindMetricFilters(){
  document.querySelectorAll('[data-filter]').forEach(tile=>{
    tile.addEventListener('click',()=>{
      activeFilter=tile.dataset.filter||'all';
      applyShopFilter(activeFilter);
      document.querySelector('.admin-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    tile.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();tile.click();}
    });
  });
}
function applyShopFilter(filter='all'){
  const labels={all:['Shops','All platform shops.'],trialing:['Trial Shops','Shops currently in the trial period.'],active:['Paying Shops','Active paid shops.'],mrr:['MRR Shops','Shops counted toward monthly recurring revenue.'],past_due:['Past Due','Shops with failed or overdue billing.'],suspended:['Suspended Shops','Accounts currently paused.']};
  document.querySelectorAll('[data-filter]').forEach(tile=>tile.classList.toggle('active',tile.dataset.filter===filter));
  document.querySelectorAll('[data-shop-status]').forEach(row=>{
    const status=row.dataset.shopStatus;
    const show=filter==='all'||status===filter||(filter==='mrr'&&status==='active');
    row.style.display=show?'':'none';
  });
  const visible=[...document.querySelectorAll('[data-shop-status]')].filter(row=>row.style.display!=='none').length;
  document.querySelectorAll('.shop-check').forEach(check=>{if(check.closest('tr')?.style.display==='none')check.checked=false;});
  updateSelectionCount();
  const [title,help]=labels[filter]||labels.all;
  const t=document.getElementById('shopSectionTitle'),h=document.getElementById('shopSectionHelp');
  if(t)t.textContent=`${title} (${visible})`;
  if(h)h.textContent=help;
  const empty=document.getElementById('shopEmpty');
  if(empty){
    empty.textContent=visible?'' : `No shops in ${title.toLowerCase()} right now.`;
    empty.classList.toggle('show',!visible);
  }
}
function selectedShopIds(){
  return [...document.querySelectorAll('.shop-check:checked')].map(x=>x.dataset.shop).filter(Boolean);
}
function visibleSelectableChecks(){
  return [...document.querySelectorAll('.shop-check:not(:disabled)')].filter(x=>x.closest('tr')?.style.display!=='none');
}
function updateSelectionCount(){
  const count=selectedShopIds().length;
  const label=document.getElementById('selectedCount');
  if(label)label.textContent=`${count} selected`;
  const selectAll=document.getElementById('selectVisibleShops');
  const visible=visibleSelectableChecks();
  if(selectAll){
    selectAll.checked=visible.length>0&&visible.every(x=>x.checked);
    selectAll.indeterminate=visible.some(x=>x.checked)&&!selectAll.checked;
  }
}
function bindBulkActions(){
  document.getElementById('selectVisibleShops')?.addEventListener('change',e=>{
    visibleSelectableChecks().forEach(check=>{check.checked=e.target.checked;});
    updateSelectionCount();
  });
  document.querySelectorAll('.shop-check').forEach(check=>check.addEventListener('change',updateSelectionCount));
  document.querySelectorAll('[data-bulk-action]').forEach(btn=>btn.addEventListener('click',async()=>{
    const ids=selectedShopIds();
    if(!ids.length){note('Select at least one shop first.','error');return;}
    const action=btn.dataset.bulkAction;
    if(action==='message'){note('Thank-you and reminder messages need email/SMS connected before sending.','error');return;}
    note('Applying bulk action...');
    try{
      for(const shop_id of ids){
        if(action==='extend')await call({action:'extend_trial',shop_id,days:30});
        else await call({action:'set_status',shop_id,status:action});
      }
      await loadOverview();
      note(`Bulk action applied to ${ids.length} shop${ids.length===1?'':'s'}.`,'success');
    }catch(err){note(err.message,'error');}
  }));
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
