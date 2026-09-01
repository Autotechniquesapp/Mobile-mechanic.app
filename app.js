(() => {
'use strict';

const ROOT = document.getElementById('app');
const DBKEY = 'mobile_mechanic_ai_approved_v7';
const TERMS_VERSION = '2026-08-v1';
const plans = {
  solo: {name:'Solo', price:29.99, seats:1, label:'Independent mechanic'},
  shop: {name:'Shop', price:69.99, seats:5, label:'Small repair shop'},
  pro:  {name:'Pro / Fleet', price:129.99, seats:15, label:'Larger shop / fleet'}
};
const repairSpecialties = [
  ['automotive','Automotive / Mobile Mechanic'],['diesel','Diesel & Heavy-Duty Truck'],['fleet','Fleet Maintenance'],
  ['truck_trailer','Truck & Trailer'],['agriculture','Agricultural Equipment'],['construction','Construction / Heavy Equipment'],
  ['rv','RV & Camper'],['powersports','Motorcycle / ATV / Powersports'],['marine','Marine / Boat'],
  ['tow','Tow Truck'],['emergency','Fire Truck / Ambulance'],['small_engine','Small Engine / Outdoor Equipment'],
  ['multi_location','Multi-Location / Enterprise'],['custom','Other / Custom Specialty']
];
const shopModules = [
  ['work_orders','Work Orders'],['estimates','Estimates & Invoices'],['inventory','Parts Inventory'],
  ['inspections','Digital Inspections'],['scheduling','Scheduling'],['reporting','Reporting'],
  ['time_clock','Time Clock'],['customer_portal','Customer Portal'],['accounting','Accounting & Bookkeeping'],
  ['ai','AI Diagnostics / Shop Coach']
];
const defaultSpecialties = ['automotive'];
const defaultModules = shopModules.map(([code])=>code);
function checkedCards(name,items,selected=[]){
  return `<div class="plan-cards config-cards">${items.map(([code,label])=>`<label class="plan-card"><input type="checkbox" name="${name}" value="${code}" ${selected.includes(code)?'checked':''}><b>${esc(label)}</b></label>`).join('')}</div>`;
}
function ensureShopConfig(s){
  s.specialties=Array.isArray(s.specialties)?s.specialties:[...defaultSpecialties];
  s.modules=Array.isArray(s.modules)?s.modules:[...defaultModules];
  s.customSpecialty=s.customSpecialty||'';
  s.assetLabel=s.assetLabel||'Vehicle / Equipment';
  return s;
}

const defaultDB = () => ({
  platformOwner: {id:'disabled',name:'Production Admin',email:'disabled@invalid.local',role:'platform_owner',active:false},
  platformAdmins: [],
  adminActivity: [],
  session: null,
  shops: {},
  publicApprovals: []
});

let db;
try { db = JSON.parse(localStorage.getItem(DBKEY)) || defaultDB(); }
catch { db = defaultDB(); }

function nowISO(){ return new Date().toISOString(); }
function uid(prefix='id'){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`; }
function slugify(v){ return String(v||'shop').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42) || 'shop'; }
function esc(v=''){ return String(v).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
function money(n){ return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0)); }
function save(){ localStorage.setItem(DBKEY, JSON.stringify(db)); }
function trialDays(s){ return Math.max(0, Math.ceil((new Date(s.trialEnds).getTime()-Date.now())/86400000)); }
function subscriptionOK(s){ return !!s && (s.subscriptionStatus==='active' || s.comped || new Date(s.trialEnds)>new Date()); }
function currentShop(){ return db.session?.shopId ? db.shops[db.session.shopId] : null; }
function currentUser(){ const s=currentShop(); return s?.users?.find(u=>u.id===db.session?.userId) || null; }
function intakeUrl(s){ return `${location.origin}/intake/${encodeURIComponent(s.slug)}`; }
function approvalUrl(s,j){ const payload = btoa(unescape(encodeURIComponent(JSON.stringify({shop:s.id,slug:s.slug,job:j.id})))); return `${location.origin}${location.pathname}?estimate=${encodeURIComponent(payload)}`; }
function yearOptions(){ let out=''; for(let y=new Date().getFullYear()+1;y>=1930;y--) out += `<option value="${y}">${y}</option>`; return out; }
function ic(name, cls=''){ return `<svg class="svg-icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`; }
function toast(msg,type=''){ document.querySelector('.toast')?.remove(); const d=document.createElement('div'); d.className=`toast ${type}`; d.textContent=msg; document.body.appendChild(d); setTimeout(()=>d.remove(),2700); }
function go(name){
  const next='#'+name;
  if(location.hash===next) return render(name);
  location.hash=next;
}
function hashRoute(){ return (location.hash||'#login').slice(1).split('?')[0]; }
function pathIntakeSlug(){
  const parts=location.pathname.split('/').filter(Boolean);
  return parts[0]==='intake' && parts[1] ? decodeURIComponent(parts[1]) : null;
}
function staffInviteUrl(token){ return `${location.origin}/invite/${encodeURIComponent(token)}`; }
function randomToken(){ const a=new Uint32Array(4); crypto.getRandomValues(a); return [...a].map(n=>n.toString(36)).join('-'); }
function roleCan(...roles){ return roles.includes(currentUser()?.role) || db.session?.role==='platform_owner'; }
function canViewShopFinancials(){ return roleCan('owner','manager','service_writer'); }
const platformRoleLabels={platform_owner:'Platform Owner',billing_admin:'Billing Admin',support_admin:'Support Admin',operations_admin:'Operations Admin',technical_admin:'Technical Admin',read_only_admin:'Read-Only Admin'};
const platformPerms={
  platform_owner:new Set(['shops_view','shops_open','trial_extend','comp','suspend','admins_manage','activity_view','billing_view','tech_view']),
  billing_admin:new Set(['shops_view','comp','billing_view','activity_view']),
  support_admin:new Set(['shops_view','shops_open','activity_view']),
  operations_admin:new Set(['shops_view','shops_open','trial_extend','suspend','activity_view']),
  technical_admin:new Set(['shops_view','shops_open','tech_view','activity_view']),
  read_only_admin:new Set(['shops_view','billing_view','activity_view'])
};
function platformUser(){ if(db.session?.role==='platform_owner')return db.platformOwner; return db.platformAdmins?.find(a=>a.id===db.session?.adminId)||null; }
function platformCan(p){ const u=platformUser(); return !!u && (platformPerms[u.role]||new Set()).has(p); }
function logAdmin(action,shopId=null,detail=''){ const u=platformUser(); if(!u)return; db.adminActivity=db.adminActivity||[]; db.adminActivity.unshift({id:uid('log'),adminId:u.id,adminName:u.name,role:u.role,action,shopId,detail,at:nowISO()}); db.adminActivity=db.adminActivity.slice(0,150); save(); }

function seedDemo(){
  if(Object.keys(db.shops).length) return;
  const sid='shop_demo_anderson';
  const trialEnd = new Date(Date.now()+60*86400000).toISOString();
  db.shops[sid] = {
    id:sid, slug:'anderson-mobile-mechanic', name:'Anderson Mobile Mechanic', ownerName:'Chris Anderson', phone:'928-555-0147', email:'demo@mobile-mechanic.app',
    plan:'pro', trialStarted:nowISO(), trialEnds:trialEnd, subscriptionStatus:'trialing', comped:false, setupComplete:true,
    logo:null, theme:{accent:'#ef2a31',background:'dark',style:'vibrant'},
    settings:{laborRate:75,taxRate:8.4,partsMarkup:25,travelFee:35,freeRadius:10,depositPercent:60},
    specialties:['automotive','diesel','fleet'], modules:[...defaultModules], customSpecialty:'', assetLabel:'Vehicle / Equipment',
    terms:{version:TERMS_VERSION,acceptedAt:nowISO()},
    users:[
      {id:'usr_demo_owner',name:'Demo Shop Owner',email:'disabled-owner@invalid.local',role:'owner',active:false},
      {id:'usr_demo_tech',name:'Demo Technician',email:'disabled-tech@invalid.local',role:'technician',active:false}
    ],
    customers:[
      {id:'cus_jane',name:'Jane Cooper',phone:'928-555-0192',email:'jane@example.com',address:'Yuma, AZ',vehicles:[{id:'veh_1',year:'2016',make:'Chevrolet',model:'Sonic',trim:'LT',engine:'1.8L',drive:'FWD',vin:'',plate:'',mileage:'124860'}]},
      {id:'cus_lee',name:'Robert Lee',phone:'928-555-0161',email:'',address:'Foothills, AZ',vehicles:[{id:'veh_2',year:'2011',make:'Mazda',model:'3',trim:'s Sport',engine:'2.5L',drive:'FWD',vin:'',plate:'',mileage:'158200'}]}
    ],
    jobs:[
      {id:'job_1',customerId:'cus_jane',customerName:'Jane Cooper',phone:'928-555-0192',email:'jane@example.com',vehicle:{year:'2016',make:'Chevrolet',model:'Sonic',trim:'LT',engine:'1.8L',drive:'FWD',vin:'',plate:'',mileage:'124860'},complaint:'Coolant leak near thermostat housing and engine runs hotter than normal.',location:'Yuma, AZ',createdAt:nowISO(),status:'AI Pre-Workup',assignedTo:'usr_demo_tech',findings:'',codes:'',photos:[],estimate:null,approval:null,carfax:{status:'Not connected'}},
      {id:'job_2',customerId:'cus_lee',customerName:'Robert Lee',phone:'928-555-0161',email:'',vehicle:{year:'2011',make:'Mazda',model:'3',trim:'s Sport',engine:'2.5L',drive:'FWD',vin:'',plate:'',mileage:'158200'},complaint:'U0101. Customer has pre-programmed replacement TCM and wants it relocated away from heat.',location:'Yuma, AZ',createdAt:new Date(Date.now()-86400000).toISOString(),status:'Scheduled',assignedTo:'usr_demo_owner',findings:'',codes:'U0101',photos:[],estimate:null,approval:null,carfax:{status:'Ready'}}
    ],
    inspections:[], warranties:[], declined:[], receipts:[], fleet:[]
  };
  save();
}
seedDemo();

function logo(s, cls=''){ return `<img class="${cls}" src="${esc(s?.logo || 'assets/mobile-mechanic-ai-logo.png')}" alt="Mobile Mechanic AI">`; }

function topbar(s,active='dashboard'){
  const u=currentUser();
  return `<header class="topbar">
    <button class="top-btn menu-toggle" data-action="toggle-menu" aria-label="Open navigation" aria-expanded="false"><span></span><span></span><span></span></button>
    <div class="brand" data-route="dashboard">${logo(s)}<div class="brand-copy"><div class="brand-title">Mobile <span class="red">Mechanic</span> AI</div><div class="brand-sub">Work Smarter. Fix Faster. Get Paid.</div></div></div>
    <div class="top-spacer"></div>
    ${db.session?.supportMode?`<button class="btn btn-soft" data-action="return-admin">Return to Admin</button>`:''}
    <div class="shop-pill">${ic('shield')}<span>${esc(s?.name||'Shop')}</span></div>
    <button class="top-btn" data-route="settings" aria-label="Settings">${ic('settings')}</button>
  </header>`;
}
function mobileDrawer(s,active){
  const links=[
    ['dashboard','home','Dashboard'],['jobs','wrench','Jobs'],['quote','brain','AI Quotes'],
    ['customers','users','Customers'],['calendar','calendar','Schedule'],['time-clock','clock','Time Clock'],
    ['reports','report','Reports'],['service-info','book','Resources'],['integrations','settings','Integrations'],
    ['settings','settings','Settings']
  ];
  const role=currentUser()?.role==='owner'?'Shop Owner':currentUser()?.role||'Technician';
  return `<div class="drawer-backdrop" data-action="close-menu" aria-hidden="true"></div><aside class="mobile-drawer" aria-hidden="true" aria-label="Main navigation"><div class="drawer-head">${logo(s)}<div><b>Mobile Mechanic AI</b><span>${esc(role)}</span></div><button data-action="close-menu" aria-label="Close navigation">×</button></div><nav>${links.map(([r,i,t])=>`<button class="drawer-link ${active===r?'active':''}" data-route="${r}">${ic(i)}<span>${t}</span><strong>›</strong></button>`).join('')}</nav><div class="drawer-account"><b>${esc(s.name)}</b><span>${esc(currentUser()?.name||'Technician')} · ${plans[s.plan]?.name||''}</span></div></aside>`;
}
function rail(s,active){
  const links=[['dashboard','home','Dashboard'],['jobs','jobs','Jobs'],['calendar','calendar','Calendar'],['customers','users','Customers'],['reports','report','Reports'],['more','more','More']];
  return `<aside class="side-rail"><div class="rail-brand">${logo(s)}<b>MOBILE<br>MECHANIC AI</b></div><div class="rail-nav">${links.map(([r,i,t])=>`<button class="rail-link ${active===r?'active':''}" data-route="${r}">${ic(i)}<span>${t}</span></button>`).join('')}</div><div class="rail-foot"><b>${esc(currentUser()?.name||'Technician')}</b>${esc(currentUser()?.role||'')} • ${plans[s.plan]?.name||''}<br>${s.subscriptionStatus==='active'?'Subscription active':`${trialDays(s)} trial days remaining`}</div></aside>`;
}
function bottomNav(active){
  const links=[['dashboard','home','Home'],['customers','users','Customers'],['calendar','calendar','Schedule'],['jobs','jobs','Jobs'],['more','more','More']];
  return `<nav class="bottom-nav">${links.map(([r,i,t])=>`<button class="${active===r?'active':''}" data-route="${r}">${ic(i)}<span>${t}</span></button>`).join('')}</nav>`;
}
function shopShell(content, active='dashboard'){
  const s=currentShop();
  if(!s) return login();
  ROOT.innerHTML = `<div class="shell">${topbar(s,active)}${mobileDrawer(s,active)}<div class="layout"><main class="content">${content}</main>${rail(s,active)}</div>${bottomNav(active)}</div>`;
  bind();
}
function pageTitle(title,sub='',back='dashboard'){
  return `<div class="page-title"><button class="back-btn" data-route="${back}">‹</button><div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div></div>`;
}

function login(){
  ROOT.innerHTML = `<section class="hercules-landing"><header><div class="hercules-brand"><span>${ic('wrench')}</span><b>Mobile Mechanic AI</b></div><button class="btn btn-primary" data-action="show-login">${ic('send')} Sign In</button></header><main><div class="hercules-mark">${ic('wrench')}</div><h1>The AI-Powered<br>Mobile Mechanic Platform</h1><p>Customer sends their info. AI preps you before arrival. You verify onsite by voice. The app handles the rest.</p><button class="btn btn-primary" data-action="show-login">${ic('send')} Sign In</button><div class="hercules-features"><div>${ic('brain')}<span>AI Pre-Workup</span></div><div>${ic('shield')}<span>Customer Intake</span></div><div>${ic('wrench')}<span>Voice Findings</span></div><div>${ic('clock')}<span>Smart Scheduling</span></div></div></main><footer>© 2026 Mobile Mechanic AI — Built for professional technicians</footer><div class="landing-login" aria-hidden="true"><div class="auth-card"><button class="landing-close" data-action="hide-login" aria-label="Close">×</button><div class="auth-logo"><div class="hercules-mark">${ic('wrench')}</div><h2>Sign in</h2><p>Access your Mobile Mechanic AI shop</p></div><div class="field"><label>Email</label><input id="loginEmail" type="email" autocomplete="username" placeholder="you@yourshop.com"></div><div class="field"><label>Password</label><input id="loginPassword" type="password" autocomplete="current-password" placeholder="Password"></div><button class="btn btn-primary btn-wide" data-action="login">Sign In</button><div class="auth-split">or</div><button class="btn btn-soft btn-wide" data-route="signup">Create Shop Account — 60 Day Trial</button></div></div></section>`;
  bind();
}

function signup(){
  ROOT.innerHTML = `<section class="auth-screen"><form class="auth-card" id="signupForm"><div class="page-title"><button type="button" class="back-btn" data-route="login">‹</button><div><h2>Create Shop Account</h2><p>Start the 60-day free trial. No charge today.</p></div></div>
  <div class="field"><label>Business / Shop Name</label><input name="shopName" required placeholder="Your shop name"></div>
  <div class="row2"><div class="field"><label>Owner Name</label><input name="ownerName" required></div><div class="field"><label>Phone</label><input name="phone" type="tel"></div></div>
  <div class="field"><label>Owner Login Email</label><input name="email" type="email" required autocomplete="username"></div>
  <div class="field"><label>Password</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
  <div class="eyebrow">Choose plan after trial</div><div class="plan-cards">${Object.entries(plans).map(([k,p],idx)=>`<label class="plan-card"><input type="radio" name="plan" value="${k}" ${idx===1?'checked':''}><b>${p.name}</b><strong>${money(p.price)}<small>/mo</small></strong><span>${p.label}<br>Up to ${p.seats} user${p.seats>1?'s':''}</span></label>`).join('')}</div>
  <label class="list-item" style="align-items:center"><input name="terms" type="checkbox" required><div class="list-main"><b>Subscription & platform terms</b><p>I understand billing is recurring after the trial when activated, payments are generally non-refundable except where required by law, and AI is an assistive tool only.</p></div></label>
  <button class="btn btn-primary btn-wide" type="submit" style="margin-top:12px">Create Shop & Start Trial</button></form></section>`;
  bind();
}

function setup(){
  const s=ensureShopConfig(currentShop()); if(!s) return login();
  const agreements=[
    ['AI tools provide suggestions, not answers.','AI tools in this app provide suggestions and information only. They are not a substitute for professional training, experience, or service information.','brain'],
    ['Use your own professional judgment.','I will use my own professional judgment to verify diagnoses, procedures, parts compatibility, labor times, specifications, and pricing before performing any work.','user'],
    ['I am responsible for safety & compliance.','I am solely responsible for the safety of my work, my customers, and others. I will follow applicable laws, manufacturer procedures, and safety standards.','shield'],
    ['Not liable for damages or claims.','Mobile Mechanic AI and its owners are not liable for damages, injury, loss, or claims resulting from my use of this app or my decisions, to the extent permitted by law.','alert'],
    ['Confirm charges before work.','Labor hours, pricing, and estimates are my responsibility. I will confirm all final charges and obtain customer approval before performing work.','money'],
    ["Don’t rely on critical or safety-sensitive info.",'I will not rely solely on this app for critical or safety-sensitive information. When in doubt, I will consult official service information and other reliable sources.','book']
  ];
  ROOT.innerHTML = `<div class="shell"><div class="layout" style="display:block;max-width:940px;margin:auto"><main class="content">
    <div class="setup-header"><div class="setup-brand">${logo(s)}<div><h1>Mobile<br><span>Mechanic</span> AI</h1><p>Work Smarter. Fix Faster. Get Paid.</p></div></div><div class="theme-compact">🎨 <span>Theme<br><b>Customize</b></span> ›</div></div>
    <div class="setup-grid"><div class="setup-main">
      <section class="card identity-card"><div class="identity-top"><div><div class="card-title">MAKE IT YOURS</div><div class="section-note">Add your business identity that will appear on estimates, invoices, and reports.</div></div><div class="logo-upload"><label class="upload-box">${ic('camera')}<input id="logoFile" type="file" accept="image/png,image/jpeg" hidden></label><div class="logo-upload-text"><b>Add Your Logo</b><p>PNG or JPG<br>Recommended 512×512</p><button class="btn btn-danger" type="button" data-action="trigger-logo">Upload Logo</button></div></div></div><div class="row2" style="margin-top:12px"><div class="field"><input id="setupShopName" value="${esc(s.name)}" placeholder="Business / Shop Name"></div><div class="field"><input id="setupTechName" value="${esc(currentUser()?.name||'')}" placeholder="Your Name (Technician)"></div><div class="field"><input id="setupPhone" value="${esc(s.phone||'')}" placeholder="Phone Number"></div><div class="field"><input id="setupEmail" value="${esc(s.email||'')}" placeholder="Email Address"></div></div></section>
      <section class="card card-pad"><div class="card-title">WHAT DOES YOUR BUSINESS SERVICE?</div><div class="section-note">Choose any that apply. These choices can be changed later without deleting any records.</div><div class="divider"></div>${checkedCards('setupSpecialties',repairSpecialties,s.specialties)}<div class="row2" style="margin-top:10px"><div class="field"><label>Custom Specialty (optional)</label><input id="setupCustomSpecialty" value="${esc(s.customSpecialty)}" placeholder="Hydraulics, generators, industrial equipment…"></div><div class="field"><label>What should the app call each unit?</label><select id="setupAssetLabel">${['Vehicle / Equipment','Vehicle','Equipment','Unit','Machine','Asset'].map(x=>`<option ${s.assetLabel===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="divider"></div><div class="card-title">TOOLS TO TURN ON</div><div class="section-note">Optional modules can also be changed later.</div>${checkedCards('setupModules',shopModules,s.modules)}</section>
      <section class="card agreements"><div class="card-title">${ic('shield')} PROFESSIONAL RESPONSIBILITY AGREEMENTS</div><div class="section-note red">You are the professional. You are in control.</div><div class="divider"></div>${agreements.map((a,i)=>`<label class="agreement-row"><input class="check-square agreement-check" type="checkbox" value="professional-${i}"><div><b>${a[0]}</b><p>${a[1]}</p></div><div class="agreement-art">${ic(a[2])}</div></label>`).join('')}</section>
      <section class="card agreements"><div class="card-title">${ic('report')} LEGAL & COPYRIGHT AGREEMENTS</div><div class="section-note red">Please review and acknowledge the following.</div><div class="divider"></div>
        ${[['I have read and agree to the','Terms of Service'],['I have read and agree to the','Privacy Policy'],['I agree to the','Data Collection & Use Policy'],['I agree that all content, features, and materials in this app, including AI outputs, are the property of Mobile Mechanic AI and are protected by applicable intellectual-property laws.',''],['I agree not to copy, reproduce, modify, distribute, sell, or reverse engineer any part of this app.','']].map((a,i)=>`<label class="legal-row"><input class="check-square agreement-check" type="checkbox" value="legal-${i}"><span>${a[0]} ${a[1]?`<span class="red">${a[1]}</span>`:''}</span><span class="chev">›</span></label>`).join('')}
        <div class="terms-meta"><div><b>Terms Version</b><span>${TERMS_VERSION}</span></div><div><b>Account</b><span>${esc(currentUser()?.email||'')}</span></div><div><b>Effective Date</b><span>Aug 2026</span></div></div>
      </section>
      <button class="agree-bar" data-action="accept-all">${ic('shield')}<span>I AGREE TO ALL OF THE ABOVE<small>You must agree to continue</small></span></button><div class="locked-note">${ic('lock')} Your agreement is securely recorded when production authentication is connected.</div>
    </div>
    <aside class="setup-side"><section class="card theme-card"><h3>CUSTOMIZE THEME</h3><p>Make the app your style.</p><div class="tiny">Color Theme</div><div class="swatches" style="margin-top:7px">${['#ef2a31','#ec7c12','#4d9c23','#7240b5','#2e70d4','#38a5a8','#c1377a','#edb62b','#a8aaad'].map((c,i)=>`<button class="swatch ${i===0?'active':''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div><div class="divider"></div><div class="tiny">Background Style</div><div class="bg-options" style="margin-top:7px"><button class="bg-opt active" title="Dark"></button><button class="bg-opt" style="background:#131820" title="Charcoal"></button><button class="bg-opt" style="background:#101827" title="Midnight"></button></div><div class="divider"></div><div class="tiny">Accent Style</div><div class="accent-options" style="margin-top:7px"><button class="active">Vibrant</button><button>Muted</button></div></section>
      <section class="card mini-nav"><div class="rail-brand">${logo(s)}<b>MOBILE<br>MECHANIC AI</b></div>${[['dashboard','home','Dashboard'],['jobs','jobs','Jobs'],['calendar','calendar','Calendar'],['customers','users','Customers'],['reports','report','Reports'],['more','more','More']].map(([r,i,t])=>`<button class="rail-link">${ic(i)} ${t}</button>`).join('')}</section></aside>
    </div>
  </main></div></div>`;
  bind();
}

function dashboard(){
  const s=currentShop(); if(!s)return login();
  if(!s.setupComplete) return setup();
  if(!subscriptionOK(s)) return billing(true);
  const today=s.jobs.filter(j=>['Scheduled','In Progress','AI Pre-Workup'].includes(j.status)).slice(0,4);
  const pending=s.jobs.filter(j=>j.status==='Awaiting Approval').length;
  const active=s.jobs.filter(j=>!['Completed','Cancelled'].includes(j.status)).length;
  const revenue=s.jobs.filter(j=>j.status==='Completed').reduce((sum,j)=>sum+Number(j.invoice?.total||j.estimate?.better?.price||0),0);
  const content=`<div class="mmp-page-head"><div><h1>Dashboard</h1><p>${new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})}</p></div><button class="btn btn-primary" data-route="new-intake">${ic('wrench')} New Job</button></div>
    <button class="mmp-intake-link" data-route="send-intake"><span>${ic('send')}<b>Share Intake Link</b><small>Send customers your shop intake form</small></span><strong>›</strong></button>
    ${pending?`<button class="mmp-pending" data-route="jobs">${ic('alert')}<span><b>${pending} job${pending===1?'':'s'} waiting for approval</b><small>Review pending work</small></span><strong>View ›</strong></button>`:''}
    <div class="mmp-metrics"><button data-route="reports"><small>Revenue MTD</small><b>${money(revenue)}</b></button><button data-route="jobs"><small>Active Jobs</small><b>${active}</b></button><button data-route="customers"><small>Customers</small><b>${s.customers.length}</b></button></div>
    ${trialDays(s)<=10 && s.subscriptionStatus!=='active'?`<div class="priority-strip">${ic('alert')}<b>Your free trial ends in ${trialDays(s)} days</b><span data-route="billing">Manage Plan ›</span></div>`:''}
    <section class="card card-pad mmp-revenue"><div class="mmp-section-head"><b>REVENUE — THIS MONTH</b><button data-route="reports">View reports</button></div><div class="mmp-revenue-value">${money(revenue)}</div><div class="mmp-revenue-track"><i style="width:${Math.min(100,Math.max(8,revenue/100))}%"></i></div></section>
    <section class="card card-pad mmp-quick"><div class="mmp-section-head"><b>QUICK ACTIONS</b></div><div><button data-route="new-intake">${ic('wrench')}<span>New Job</span></button><button data-route="jobs">${ic('clipboard')}<span>View Intakes</span>${pending?`<em>${pending}</em>`:''}</button><button type="button" data-open-invoices>${ic('money')}<span><b>OPEN INVOICES</b><small data-open-invoices-summary>Billing</small></span></button><button data-route="customers">${ic('users')}<span>Customers</span></button></div></section>
    <section class="card card-pad mmp-list"><div class="mmp-section-head"><b>TODAY'S SCHEDULE</b><button data-route="calendar">View all</button></div>${today.length?today.map(j=>`<button class="mmp-job-row" data-job="${j.id}"><span class="timeline-dot"></span><div><b>${esc(j.customerName)}</b><small>${esc(vehicleText(j.vehicle))} · ${esc(scheduleWindow(j))}</small></div><em>${esc(j.status)}</em></button>`).join(''):`<div class="mmp-empty">No jobs scheduled today.</div>`}</section>
    <section class="card card-pad mmp-list"><div class="mmp-section-head"><b>ACTIVE JOBS</b><button data-route="jobs">View all</button></div>${s.jobs.filter(j=>!['Completed','Cancelled'].includes(j.status)).slice(0,4).map(j=>`<button class="mmp-job-row" data-job="${j.id}"><div><b>${esc(j.customerName)} — ${esc(vehicleText(j.vehicle))}</b><small>${esc(j.complaint)}</small></div><em>${esc(j.status)}</em></button>`).join('')||`<div class="mmp-empty">No active jobs.</div>`}<button class="mmp-service-link" data-route="service-info">${ic('book')} Service Information</button></section>`;
  shopShell(content,'dashboard');
}

function vehicleText(v={}){ return [v.year,v.make,v.model,v.trim].filter(Boolean).join(' '); }
function shopIntake(s, publicMode=false){
  const vehMakes=['Chevrolet','Ford','GMC','Toyota','Honda','Nissan','Dodge','Ram','Jeep','Mazda','Hyundai','Kia','Subaru','BMW','Mercedes-Benz','Volkswagen','Other'];
  ROOT.innerHTML=`<section class="customer-shell"><div class="customer-frame"><header class="customer-top">${logo(s)}<div><h1>Mobile <span>Mechanic</span> AI</h1><p>Customer Intake</p></div><div class="customer-shop"><b>${esc(s.name)}</b><span>${esc(s.phone||'')}</span></div></header><div class="customer-body"><div class="customer-stepbar"><span class="customer-step active"></span><span class="customer-step active"></span><span class="customer-step"></span><span class="customer-step"></span></div>
  <div class="customer-alert">${ic('shield')}<div><b>Your request goes directly to ${esc(s.name)}.</b><br>The shop will use this information to review your vehicle request.</div></div>
  <form id="intakeForm" data-shop="${s.id}" data-public="${publicMode}">
    <section class="customer-card"><h3>1 • Customer Information</h3><div class="row2"><div class="field"><label>Name</label><input name="customerName" required placeholder="Full name"></div><div class="field"><label>Phone</label><input name="phone" type="tel" required placeholder="Phone"></div></div><div class="row2"><div class="field"><label>Email</label><input name="email" type="email" placeholder="Email"></div><div class="field"><label>Availability</label><input name="availability" placeholder="Date / time window"></div></div><div class="field"><label>Service Location</label><div class="field-inline"><input id="serviceLocation" name="location" placeholder="Address or current location"><button type="button" class="btn btn-soft" data-action="location">${ic('location')} Use Current</button></div></div></section>
    <section class="customer-card"><h3>2 • Vehicle</h3><div class="row3"><div class="field"><label>Year</label><select name="year" required><option value="">Year</option>${yearOptions()}</select></div><div class="field"><label>Make</label><select name="make" required><option value="">Make</option>${vehMakes.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Model</label><input name="model" required placeholder="Model / Other"></div></div><div class="row3"><div class="field"><label>Submodel / Trim</label><input name="trim" placeholder="LT, XLE, Sport..."></div><div class="field"><label>Engine</label><input name="engine" placeholder="1.8L / 3.5L..."></div><div class="field"><label>Drive</label><select name="drive"><option>2WD</option><option>FWD</option><option>RWD</option><option>4WD</option><option>AWD</option><option>Other</option></select></div></div><div class="row2"><div class="field"><label>VIN</label><div class="field-inline"><input id="vinInput" name="vin" maxlength="17" placeholder="17-digit VIN"><button type="button" class="btn btn-soft" data-action="vin-decode">Decode</button></div></div><div class="field"><label>License Plate</label><input name="plate" placeholder="Plate (lookup API later)"></div></div><div class="row2"><div class="field"><label>Mileage</label><input name="mileage" type="number" placeholder="Current mileage"></div><div class="field"><label>VIN / Plate Scan</label><button type="button" class="btn btn-soft btn-wide" data-action="scan-placeholder">${ic('camera')} Camera Scan</button></div></div><div id="vinResult" class="small muted"></div></section>
    <section class="customer-card"><h3>3 • Vehicle Concern</h3><div class="field"><label>What's going on with the vehicle?</label><textarea id="complaintInput" name="complaint" required placeholder="Describe the problem, symptoms, noises, warning lights, when it happens, etc."></textarea></div><div class="btn-row"><button type="button" class="btn btn-soft" data-action="voice-customer">${ic('mic')} Speak Concern</button><span class="badge">Voice transcription when supported by device</span></div></section>
    <section class="customer-card"><h3>4 • Request Type</h3><div class="row2"><label class="list-item"><input type="radio" name="requestType" value="Repair / Diagnostic" checked><div class="list-main"><b>Repair / Diagnostic</b><p>Send your vehicle request to the shop.</p></div></label><label class="list-item"><input type="radio" name="requestType" value="Pre-Purchase Inspection"><div class="list-main"><b>Pre-Purchase Inspection</b><p>Vehicle inspection before purchase.</p></div></label></div></section>
  </form></div><div class="customer-footer"><button class="customer-submit" type="submit" form="intakeForm">SEND TO ${esc(s.name).toUpperCase()}</button><p class="tiny muted" style="text-align:center;margin:7px 0 0">Your information is sent securely to this shop.</p></div></div></section>`;
  bind();
}
function newIntake(){ shopIntake(currentShop(),false); }
function publicIntake(s){ shopIntake(s,true); }

function sendIntake(){
  const s=currentShop();
  const url=intakeUrl(s);
  const content=`${pageTitle('Customer Intake Link','Every submission is tied to this shop only.')}
  <section class="card card-pad"><div class="card-title">${ic('link')} ${esc(s.name)} Intake</div><div class="section-note">Send this URL by text, email, QR code, or social message.</div><div class="divider"></div><div class="field"><label>Unique Shop Intake URL</label><input id="intakeLink" value="${esc(url)}" readonly></div><div class="btn-row"><button class="btn btn-primary" data-action="share-intake">${ic('send')} Share Intake</button><button class="btn btn-soft" data-action="copy-intake">${ic('link')} Copy Link</button><button class="btn btn-soft" data-action="preview-intake">Preview Form</button></div></section>
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">SHOP IDENTITY CONNECTION</div><div class="section-note">The URL uses the shop slug for routing, while production records use immutable shop ID <b>${esc(s.id)}</b>.</div><div class="divider"></div><div class="list-item"><div class="list-icon">${ic('shield')}</div><div class="list-main"><b>Customer sees ${esc(s.name)}</b><p>Shop name, logo, phone, and customer intake are connected automatically.</p></div></div><div class="list-item"><div class="list-icon">${ic('users')}</div><div class="list-main"><b>Submission stays inside this shop</b><p>Production tenant security will enforce shop_id on every customer, vehicle, job, invoice, and file.</p></div></div></section>`;
  shopShell(content,'customers');
}

function customers(){
  const s=currentShop();
  const content=`${pageTitle('Customers',`${s.customers.length} customer records`)}<section class="card card-pad"><div class="btn-row"><button class="btn btn-primary" data-route="new-intake">${ic('user')} New Customer</button><button class="btn btn-soft" data-route="send-intake">${ic('send')} Send Intake</button></div><div class="divider"></div><div class="list">${s.customers.map(c=>`<div class="list-item"><div class="list-icon">${ic('user')}</div><div class="list-main"><b>${esc(c.name)}</b><p>${esc(c.phone||'')} • ${esc(c.email||'No email')}<br>${(c.vehicles||[]).map(vehicleText).map(esc).join(' • ')||'No vehicles'}</p><div class="list-actions"><button class="btn btn-soft" data-action="add-vehicle" data-customer="${c.id}">Add Vehicle</button><button class="btn btn-soft" data-action="customer-history" data-customer="${c.id}">Vehicle Timeline</button></div></div></div>`).join('')||'<div class="muted">No customers yet.</div>'}</div></section>`;
  shopShell(content,'customers');
}

function jobs(){
  const s=currentShop();
  const content=`${pageTitle('Jobs','Intake → diagnosis → estimate → approval → invoice')}
  <div class="btn-row" style="margin-bottom:10px"><button class="btn btn-primary" data-route="new-intake">${ic('user')} New Intake</button><button class="btn btn-soft" data-route="quote">${ic('money')} Quick Quote</button></div>
  <div class="list">${s.jobs.map(j=>`<div class="list-item job-list-item" role="button" tabindex="0" style="width:100%;color:inherit;text-align:left" data-open-job="${j.id}"><div class="list-icon">${ic('wrench')}</div><div class="list-main"><b>${esc(j.customerName)} — ${esc(vehicleText(j.vehicle))}</b><p>${esc(j.complaint)}</p><div class="list-actions"><span class="badge ${j.status==='Awaiting Approval'?'orange':j.status==='Completed'?'green':'red'}">${esc(j.status)}</span>${j.approval?.status==='approved'?'<span class="badge green">Customer Approved</span>':''}<button type="button" class="btn btn-soft" data-action="schedule-job" data-job="${j.id}">${ic('calendar')} Schedule</button></div></div><div class="list-meta">${scheduleWindow(j)}</div></div>`).join('')||'<section class="card card-pad"><div class="muted">No jobs yet.</div></section>'}</div>`;
  shopShell(content,'jobs');
}

function jobById(id){ const s=currentShop(); return s?.jobs.find(j=>j.id===id) || null; }
function exactVideoQuery(j,suffix='repair'){ return `${j.vehicle.year||''} ${j.vehicle.make||''} ${j.vehicle.model||''} ${j.vehicle.engine||''} ${j.codes||''} ${suffix} ${j.complaint||''}`.trim(); }
function youtubeLink(q){ return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`; }
function scheduleDurationMinutes(j){ return Math.max(15,Math.round(Number(j.estimatedLaborHours||1)*60)+Number(j.travelMinutes||0)+Number(j.bufferMinutes??15)); }
function scheduleEnd(start,j){ return new Date(new Date(start).getTime()+scheduleDurationMinutes(j)*60000); }
function localDateTimeValue(v){ if(!v)return ''; const d=new Date(v),pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function scheduleWindow(j){ if(!j.scheduledStart)return j.availability||'Schedule time not set'; const start=new Date(j.scheduledStart),end=j.scheduledEnd?new Date(j.scheduledEnd):scheduleEnd(j.scheduledStart,j); return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`; }
function scheduleConflict(job,start,end){ const s=currentShop(); return s.jobs.find(j=>j.id!==job.id&&j.scheduledStart&&j.scheduledEnd&&new Date(j.scheduledStart)<end&&new Date(j.scheduledEnd)>start); }
function genericWorkup(j){
  const c=(j.complaint||'').toLowerCase();
  let causes=[['Confirm complaint and scan all modules',86],['Inspect power, grounds, connectors, and obvious mechanical faults',78],['Use service information to test the affected system before replacing parts',72]];
  if(c.includes('coolant')||c.includes('overheat')) causes=[['External coolant leak / housing / hose / seal',82],['Cooling system pressure or cap issue',66],['Thermostat / circulation problem',58],['Cooling fan or airflow concern',42]];
  if(c.includes('no start')||c.includes('crank')) causes=[['Battery / voltage drop / starting circuit',78],['Fuel or spark / injection enable concern',68],['Crank/cam synchronization or sensor input',56],['Security / module communication issue',40]];
  if(c.includes('brake')) causes=[['Friction material / rotor condition',80],['Caliper / slide / hydraulic condition',64],['Wheel bearing / suspension contributing symptom',38]];
  if(c.includes('ac')||c.includes('a/c')) causes=[['Refrigerant charge / leak concern',76],['Compressor command / clutch / variable displacement issue',63],['Condenser airflow / fan performance',48],['Pressure sensor / electrical control',37]];
  return causes;
}
function estimateFromJob(j,s){
  if(j.estimate) return j.estimate;
  const rate=s.settings.laborRate||75;
  const baseParts=85, hours=1.5;
  const calc=(parts,h,mult=1)=>{ const marked=parts*(1+(s.settings.partsMarkup||0)/100); const sub=marked+h*rate+(s.settings.travelFee||0); const tax=sub*(s.settings.taxRate||0)/100; return Math.round((sub+tax)*mult*100)/100; };
  return {good:{title:'Good',price:calc(baseParts,hours,.9),summary:'Minimum appropriate repair based on confirmed findings.'},better:{title:'Better',price:calc(baseParts*1.45,hours+.4,1),summary:'Recommended repair with related service items.'},best:{title:'Best',price:calc(baseParts*2.0,hours+.8,1.02),summary:'Complete repair / preventive package where appropriate.'}};
}
function workup(jobId){
  const s=currentShop(), j=jobById(jobId); if(!j)return jobs();
  db.session.activeJobId=j.id; save();
  const causes=genericWorkup(j), est=estimateFromJob(j,s);
  const content=`${pageTitle('AI Pre-Workup','AI assists the technician; final diagnosis remains with the professional.','jobs')}
  <div class="job-banner"><div class="avatar">${esc(j.customerName.split(/\s+/).map(x=>x[0]).join('').slice(0,2))}</div><div class="job-banner-main"><b>${esc(j.customerName)} • ${esc(vehicleText(j.vehicle))}</b><p>${esc(j.complaint)}</p></div><span class="badge red">${esc(j.status)}</span></div>
  <section class="work-white"><div class="work-grid"><div class="work-card"><h3>Vehicle / Complaint</h3><p><b>${esc(vehicleText(j.vehicle))}</b><br>${esc(j.vehicle.engine||'Engine not entered')} • ${esc(j.vehicle.mileage||'—')} mi<br><br>${esc(j.complaint)}</p></div><div class="work-card"><h3>AI Status</h3><p><b>Structured demo workup</b><br>Production AI API is not connected yet. This screen is ready for secure server-side AI responses.</p></div></div>
  <div class="work-grid" style="margin-top:8px"><div class="work-card"><h3>Likely Areas to Check</h3><div class="cause-list">${causes.map(([t,p])=>`<div class="cause"><div><b>${esc(t)}</b><div class="confidence"><i style="width:${p}%"></i></div></div><strong>${p}%</strong></div>`).join('')}</div></div><div class="work-card"><h3>Diagnostic Path</h3>${['Confirm customer symptom and conditions','Scan all relevant modules and save codes/freeze-frame','Perform visual inspection and basic power/ground checks','Test the suspected system before replacing parts','Document measurements and compare to authoritative service data'].map(x=>`<label class="diag-check"><input type="checkbox">${esc(x)}</label>`).join('')}</div></div>
  <div class="work-card" style="margin-top:8px"><h3>Good / Better / Best — Technician Reviews Before Sending</h3><div class="estimate-options">${Object.entries(est).map(([k,o])=>`<div class="estimate-card ${k}"><b>${esc(o.title)}</b><strong>${money(o.price)}</strong><p>${esc(o.summary)}</p></div>`).join('')}</div><div class="btn-row" style="margin-top:9px"><button class="btn btn-primary" data-action="save-estimate" data-job="${j.id}">${ic('money')} Save Estimate Options</button><button class="btn btn-soft" data-action="send-estimate" data-job="${j.id}">${ic('send')} Send to Customer</button><button class="btn btn-soft" data-action="single-estimate" data-job="${j.id}">Send One Option Instead</button></div></div>
  <div class="work-card" style="margin-top:8px"><h3>Repair Videos — Exact Vehicle Context</h3><p class="muted" style="margin:0 0 8px">YouTube is a visual aid only. Verify procedures, torque specifications, safety information, and service data independently.</p><div class="video-list">${[['Exact vehicle + complaint',exactVideoQuery(j,'diagnosis repair')],['Repair procedure',exactVideoQuery(j,'repair procedure how to')],['Diagnostic code / testing',exactVideoQuery(j,`${j.codes||''} diagnosis testing`)]].slice(0,2).map(([t,q])=>`<button class="video-card" data-external="${esc(youtubeLink(q))}" style="text-align:left;color:inherit"><div class="video-thumb">${ic('play')}</div><div><b>${esc(t)}</b><span>${esc(q.slice(0,88))}</span></div></button>`).join('')}</div><div class="btn-row" style="margin-top:8px"><button class="btn btn-soft" data-external="${esc(youtubeLink(exactVideoQuery(j,'repair diagnosis')))}">${ic('play')} Find More YouTube Videos</button></div></div>
  </section>
  <div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" data-route="findings">Technician Findings</button><button class="btn btn-soft" data-route="service-info">${ic('book')} Service Information</button><button class="btn btn-soft" data-route="ai-second">AI Second Opinion</button><button class="btn btn-soft" data-action="ask-vehicle" data-job="${j.id}">${ic('brain')} Ask AI About This Vehicle</button></div>`;
  shopShell(content,'jobs');
}

function findings(){
  const s=currentShop(), j=jobById(db.session.activeJobId)||s.jobs[0]; if(!j)return jobs();
  const content=`${pageTitle('Technician Findings','Document tests, measurements, photos, codes, and final diagnosis.','jobs')}
  <div class="job-banner"><div class="avatar">${esc(j.customerName.split(/\s+/).map(x=>x[0]).join('').slice(0,2))}</div><div class="job-banner-main"><b>${esc(j.customerName)} • ${esc(vehicleText(j.vehicle))}</b><p>${esc(j.complaint)}</p></div><span class="badge">${esc(j.status)}</span></div>
  <section class="work-white"><div class="work-card"><h3>Technician Notes / Voice Findings</h3><div class="field"><textarea id="findingText" placeholder="Record what you actually found...">${esc(j.findings||'')}</textarea></div><div class="btn-row"><button class="btn btn-soft" data-action="voice-findings">${ic('mic')} Dictate Findings</button><button class="btn btn-soft" data-action="save-findings">Save Findings</button></div></div>
  <div class="work-grid" style="margin-top:8px"><div class="work-card"><h3>Codes / Test Results</h3><div class="field"><input id="codeInput" value="${esc(j.codes||'')}" placeholder="P0302, U0101, voltage, PSI, etc."></div><div class="field"><textarea id="measurements" placeholder="Measurements / scan data / test results"></textarea></div></div><div class="work-card"><h3>Before / After Evidence</h3><div class="finding-photo-grid"><label class="photo-placeholder">${ic('camera')}<input type="file" id="findingPhoto" accept="image/*" capture="environment" hidden></label>${(j.photos||[]).slice(0,2).map(p=>`<div class="photo-placeholder" style="background-image:url('${esc(p)}');background-size:cover;background-position:center"></div>`).join('')}</div><button class="btn btn-soft btn-wide" style="margin-top:7px" data-action="photo-upload">Add Photo</button></div></div>
  <div class="work-card" style="margin-top:8px"><h3>Issue Classification</h3><div class="row4"><button class="btn btn-green" data-severity="Good">Good</button><button class="btn btn-blue" data-severity="Monitor">Monitor</button><button class="btn btn-soft" data-severity="Needs Attention">Needs Attention</button><button class="btn btn-danger" data-severity="Safety Concern">Safety Concern</button></div></div>
  <div class="work-card" style="margin-top:8px"><h3>Support Tools for This Finding</h3><div class="btn-row"><button class="btn btn-soft" data-external="${esc(youtubeLink(exactVideoQuery(j,'repair procedure')))}">${ic('play')} YouTube Videos</button><button class="btn btn-soft" data-route="ai-second">${ic('brain')} AI Second Opinion</button><button class="btn btn-soft" data-action="before-replace">Before You Replace It</button><button class="btn btn-soft" data-route="carfax">CARFAX-Ready Record</button></div></div></section>
  <div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" data-action="to-estimate" data-job="${j.id}">${ic('money')} Build / Send Estimate</button><button class="btn btn-soft" data-action="complete-job" data-job="${j.id}">Complete Job</button></div>`;
  shopShell(content,'jobs');
}

function aiSecond(){
  const s=currentShop(), j=jobById(db.session.activeJobId)||s.jobs[0];
  const content=`${pageTitle('AI Second Opinion','Challenge the first diagnosis before replacing expensive parts.','jobs')}
  <section class="card card-pad"><div class="card-title">${ic('brain')} SECOND OPINION</div><div class="section-note red">Ask what could be overlooked, misdiagnosed, or proven with a better test.</div><div class="divider"></div>${j?`<div class="list-item"><div class="list-icon">${ic('car')}</div><div class="list-main"><b>${esc(vehicleText(j.vehicle))}</b><p>${esc(j.complaint)}</p></div></div>`:''}<div class="field" style="margin-top:10px"><label>Question for AI</label><textarea id="secondQuestion">What could I be overlooking, and what tests should I perform before replacing the suspected part?</textarea></div><button class="btn btn-primary" data-action="second-opinion">${ic('brain')} Generate Challenge Checklist</button><div id="secondResult" style="margin-top:10px"></div></section>`;
  shopShell(content,'jobs');
}

function quote(){
  const s=currentShop();
  const saved=(s.quickQuotes||[]).slice().reverse();
  const content=`${pageTitle('Quick Quote','Say what the vehicle needs. Mobile Mechanic AI builds the quote for you.')}
  <section class="card card-pad voice-quote-card">
    <button class="btn btn-soft" type="button" data-action="quote-help">? What can I say?</button>
    <button class="voice-quote-mic" type="button" data-action="voice-quote" aria-label="Start voice quote">${ic('mic')}<b>START TALKING</b><span>Tap and describe the repair, parts, labor, fees, deposit, and warranty.</span></button>
    <div class="field"><label>What the mechanic said</label><textarea id="qVoice" placeholder="Example: Replace front pads and rotors. Parts cost 280 dollars with 30 percent markup. Charge 3 hours labor and add a 50 dollar service call."></textarea><small>Review or correct the words before creating the quote.</small></div>
    <input id="qEditId" type="hidden">
    <button class="btn btn-primary btn-wide" data-action="calc-quote">Create Quote</button>
    <div id="quoteResult" style="margin-top:10px"></div>
  </section>
  ${saved.length?`<section class="card card-pad" style="margin-top:10px"><div class="card-title">SAVED QUICK QUOTES</div><div class="divider"></div><div class="list">${saved.map(q=>`<div class="list-item"><div class="list-main"><b>${money(q.total)} — ${esc(q.description||'Quick quote')}</b><p>${new Date(q.createdAt).toLocaleString()}</p><div class="list-actions"><button class="btn btn-soft" data-action="edit-quick-quote" data-quote="${q.id}">${ic('mic')} Edit with Voice</button><button class="btn btn-soft" data-action="copy-quick-quote" data-quote="${q.id}">Copy</button></div></div></div>`).join('')}</div></section>`:''}`;
  shopShell(content,'jobs');
}

function estimateShare(jobId){
  const s=currentShop(),j=jobById(jobId); if(!j)return;
  j.estimate=estimateFromJob(j,s); j.status='Awaiting Approval'; save();
  const url=approvalUrl(s,j); const text=`${s.name} estimate for ${vehicleText(j.vehicle)}: review Good / Better / Best options here: ${url}`;
  if(navigator.share) navigator.share({title:`Estimate from ${s.name}`,text,url}).catch(()=>{}); else navigator.clipboard?.writeText(text).then(()=>toast('Estimate link copied','good'));
}
function estimatePage(data){
  const s=db.shops[data.shop]; if(!s) return publicMessage('Estimate not found','Ask the shop to send a new estimate link.');
  const j=s.jobs.find(x=>x.id===data.job); if(!j) return publicMessage('Estimate not found','Ask the shop to send a new estimate link.');
  const est=j.estimate||estimateFromJob(j,s);
  ROOT.innerHTML=`<section class="customer-shell"><div class="customer-frame"><header class="customer-top">${logo(s)}<div><h1>Mobile <span>Mechanic</span> AI</h1><p>Customer Estimate Approval</p></div><div class="customer-shop"><b>${esc(s.name)}</b><span>${esc(s.phone||'')}</span></div></header><div class="customer-body"><div class="customer-card"><h3>Vehicle / Request</h3><h2>${esc(vehicleText(j.vehicle))}</h2><p class="muted small">${esc(j.complaint)}</p></div><div class="customer-card"><h3>Choose Your Repair Option</h3><div class="estimate-options">${Object.entries(est).map(([k,o])=>`<label class="estimate-card ${k}"><input type="radio" name="customerOption" value="${k}"><b>${esc(o.title)}</b><strong>${money(o.price)}</strong><p>${esc(o.summary)}</p></label>`).join('')}</div><div class="customer-alert" style="margin-top:10px">Your selection authorizes only the option you choose. If price or scope changes afterward, the shop should send a revised authorization.</div></div><div class="customer-card"><h3>Authorization</h3><div class="field"><label>Your Name</label><input id="approveName" value="${esc(j.customerName)}"></div><label class="list-item"><input type="checkbox" id="approveCheck"><div class="list-main"><b>I approve the selected repair option</b><p>I understand only the selected option is authorized.</p></div></label><div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" data-action="approve-estimate" data-shop="${s.id}" data-job="${j.id}">${ic('check')} Approve Selected Repair</button><button class="btn btn-soft" data-action="decline-estimate" data-shop="${s.id}" data-job="${j.id}">Decline All / Contact Shop</button></div></div></div></div></section>`;
  bind();
}
function publicMessage(title,text){ ROOT.innerHTML=`<section class="customer-shell"><div class="customer-frame"><div class="customer-body" style="padding:28px"><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div></section>`; }

function inspection(){
  const s=currentShop();
  const content=`${pageTitle('Pre-Purchase Inspection','Customer flow, required photos, seller contact, scan results, and AI summary.')}
  <section class="work-white"><div class="work-card"><h3>Inspection Request</h3><div class="row2"><div class="field"><label>Customer Name</label><input id="ppiCustomer"></div><div class="field"><label>Seller / Vehicle Owner</label><input id="ppiSeller"></div></div><div class="row3"><div class="field"><label>Year</label><select id="ppiYear"><option>${new Date().getFullYear()}</option>${yearOptions()}</select></div><div class="field"><label>Make</label><input id="ppiMake"></div><div class="field"><label>Model</label><input id="ppiModel"></div></div><div class="row2"><div class="field"><label>VIN</label><input id="ppiVin"></div><div class="field"><label>Mileage</label><input id="ppiMiles" type="number"></div></div></div>
  <div class="work-card" style="margin-top:8px"><h3>Inspection Checklist</h3><div class="row2">${['Exterior / Body','Tires / Wheels','Brakes','Suspension / Steering','Engine / Fluids','Transmission / Driveline','Electrical / Battery','HVAC','Interior','Scan All Modules','Road Test','Safety Concerns'].map(x=>`<label class="diag-check"><input type="checkbox">${x}</label>`).join('')}</div></div><div class="work-card" style="margin-top:8px"><h3>Required Photos</h3><div class="finding-photo-grid">${Array.from({length:6},()=>`<label class="photo-placeholder">${ic('camera')}<input type="file" accept="image/*" capture="environment" hidden></label>`).join('')}</div></div><div class="work-card" style="margin-top:8px"><h3>AI Customer Summary</h3><p class="muted">Technician findings can be converted into Good / Monitor / Needs Attention / Safety Concern categories. Technician reviews before sending.</p><button class="btn btn-primary" data-action="save-ppi">Save Inspection Draft</button></div></section>`;
  shopShell(content,'more');
}

function team(){
  const s=currentShop();
  const seats=plans[s.plan].seats, activeUsers=s.users.filter(u=>u.active).length;
  const content=`${pageTitle('Technician Accounts',`${activeUsers}/${seats} seats used • each technician has their own login`,'more')}
  <section class="card card-pad"><div class="card-title">${ic('users')} SHOP TEAM</div><div class="section-note">Tap a technician's name or picture to open their profile.</div><div class="divider"></div><div class="list">${s.users.map(u=>`<div class="list-item"><button class="tech-avatar" data-action="tech-profile" data-user="${u.id}" aria-label="Open ${esc(u.name)} profile">${u.photo?`<img src="${esc(u.photo)}" alt="${esc(u.name)}">`:ic('user')}</button><div class="list-main"><button class="tech-name-button" data-action="tech-profile" data-user="${u.id}">${esc(u.name)} ${u.id===db.session.userId?'<span class="badge">You</span>':''}</button><p>${esc(u.email)} • ${esc(u.role)} • ${u.active?'Active':'Disabled'}${u.specialties?`<br>${esc(u.specialties)}`:''}</p><div class="list-actions">${u.role!=='owner'?`<button class="btn btn-soft" data-action="toggle-user" data-user="${u.id}">${u.active?'Disable':'Enable'}</button><button class="btn btn-soft" data-action="reset-tech-password" data-user="${u.id}">Reset Password</button>`:''}</div></div></div>`).join('')}</div></section>
  ${roleCan('owner','manager')?`<section class="card card-pad" style="margin-top:10px"><div class="card-title">INVITE TECHNICIAN / STAFF</div><div class="section-note">${activeUsers>=seats?'This plan has no open seats. Upgrade or disable a user to add another.':'Send an invite link so the user creates their own password.'}</div><div class="divider"></div><form id="teamForm"><div class="row2"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div></div><div class="row2"><div class="field"><label>Role</label><select name="role"><option value="technician">Technician</option><option value="service_writer">Service Writer</option><option value="manager">Manager</option></select></div><div class="field"><label>Phone for SMS Invite</label><input name="phone" type="tel" placeholder="Optional"></div></div><button class="btn btn-primary" ${activeUsers>=seats?'disabled':''}>Create Invite Link</button></form><div id="inviteResult" class="section-note" style="margin-top:10px"></div></section>`:''}`;
  shopShell(content,'more');
}

function openTechProfile(userId){
  const u=currentShop()?.users?.find(x=>x.id===userId);if(!u)return;const self=u.id===db.session.userId,canEdit=self||roleCan('owner','manager'),canManage=roleCan('owner','manager');
  modal('Technician Profile',`<form id="techProfileForm" data-user="${u.id}"><div class="tech-profile-photo"><button type="button" class="tech-profile-avatar" data-action="choose-tech-photo">${u.photo?`<img id="techPhotoPreview" src="${esc(u.photo)}" alt="${esc(u.name)}">`:`<span id="techPhotoPreview">${ic('camera')}</span>`}</button><div><b>${esc(u.name)}</b><p class="small muted">Tap the picture to add or change it.</p></div><input id="techPhotoFile" type="file" accept="image/png,image/jpeg,image/webp" capture="user" hidden><input id="techPhotoData" type="hidden" value="${esc(u.photo||'')}"></div><div class="row2"><div class="field"><label>Name</label><input name="name" value="${esc(u.name)}" ${canEdit?'':'readonly'}></div><div class="field"><label>Phone</label><input name="phone" type="tel" value="${esc(u.phone||'')}" ${canEdit?'':'readonly'}></div></div><div class="row2"><div class="field"><label>Email</label><input name="email" type="email" value="${esc(u.email||'')}" ${canManage?'':'readonly'}></div><div class="field"><label>Role</label><select name="role" ${canManage?'':'disabled'}>${[['owner','Shop Owner'],['manager','Manager'],['technician','Technician'],['service_writer','Service Writer']].map(([v,n])=>`<option value="${v}" ${u.role===v?'selected':''}>${n}</option>`).join('')}</select></div></div><div class="field"><label>Specialties</label><input name="specialties" value="${esc(u.specialties||'')}" placeholder="Diagnostics, diesel, brakes, HVAC..." ${canEdit?'':'readonly'}></div><div class="field"><label>Certifications / Training</label><textarea name="certifications" placeholder="ASE areas, EPA 609, manufacturer training..." ${canEdit?'':'readonly'}>${esc(u.certifications||'')}</textarea></div><div class="field"><label>About This Technician</label><textarea name="bio" placeholder="Experience, services, or a short introduction..." ${canEdit?'':'readonly'}>${esc(u.bio||'')}</textarea></div>${canEdit?'<button class="btn btn-primary btn-wide">Save Technician Profile</button>':''}</form>`);
}

function timeClock(){
  const s=currentShop(),u=currentUser();
  s.timeEntries=Array.isArray(s.timeEntries)?s.timeEntries:[];
  const open=s.timeEntries.find(x=>x.userId===u.id&&!x.clockOut);
  const visible=roleCan('owner','manager')?s.timeEntries:s.timeEntries.filter(x=>x.userId===u.id);
  const rows=visible.slice().reverse().map(x=>{const tech=s.users.find(y=>y.id===x.userId),end=x.clockOut?new Date(x.clockOut):new Date(),hours=Math.max(0,(end-new Date(x.clockIn))/3600000);return `<div class="list-item"><div class="list-icon">${ic('clock')}</div><div class="list-main"><b>${esc(tech?.name||'Technician')} • ${hours.toFixed(2)} hours</b><p>${new Date(x.clockIn).toLocaleString()} — ${x.clockOut?new Date(x.clockOut).toLocaleString():'Clocked in now'}</p></div></div>`;}).join('');
  const content=`${pageTitle('Time Clock',roleCan('owner','manager')?'Review team time or clock yourself in.':'Your personal time entries.','more')}<section class="card card-pad"><div class="card-title">${open?'CLOCKED IN':'READY TO CLOCK IN'}</div><div class="section-note">${open?`Started ${new Date(open.clockIn).toLocaleString()}`:'Time is kept separately for each technician.'}</div><div class="divider"></div><button class="btn ${open?'btn-soft':'btn-primary'} btn-wide" data-action="${open?'clock-out':'clock-in'}">${open?'Clock Out':'Clock In'}</button></section><section class="card card-pad" style="margin-top:10px"><div class="card-title">${roleCan('owner','manager')?'TEAM TIME ENTRIES':'MY TIME ENTRIES'}</div><div class="divider"></div><div class="list">${rows||'<p class="muted">No time entries yet.</p>'}</div></section>`;
  shopShell(content,'more');
}

function billing(blocked=false){
  const s=currentShop();
  const addonFallback=[
    {code:'youtube_lookup_pack',name:'YouTube Video Lookup Pack',description:'Adds 50 extra repair video lookups per month for Solo shops.',monthly_price:9.99,quantity:50,unit_label:'lookups/month',available_on_plans:['solo']},
    {code:'extra_tech_seat',name:'Extra Technician Seat',description:'Adds one more staff login without moving up a full plan.',monthly_price:12,quantity:1,unit_label:'seat',available_on_plans:['solo','shop']},
    {code:'sms_reminder_pack',name:'SMS Reminder Pack',description:'Adds 100 customer text reminders or updates per month.',monthly_price:14.99,quantity:100,unit_label:'texts/month',available_on_plans:['solo','shop','pro_fleet']},
    {code:'photo_storage_pack',name:'Photo Storage Pack',description:'Adds more room for before/after photos, receipts, and inspection evidence.',monthly_price:7.99,quantity:5,unit_label:'GB/month',available_on_plans:['solo','shop']}
  ];
  const addons=(s.addonCatalog&&s.addonCatalog.length?s.addonCatalog:addonFallback).filter(a=>(a.available_on_plans||[]).includes(s.plan==='pro'?'pro_fleet':s.plan));
  const activeAddons=s.addons||[];
  const content=`${pageTitle('Subscription','Stripe billing, trials, plan changes, and add-ons.','more')}${blocked?'<div class="priority-strip">Feature access paused until subscription is active.</div>':''}
  <div class="metric-grid"><div class="metric red"><b>${plans[s.plan].name}</b><span>Current Plan</span></div><div class="metric green"><b>${s.comped?'Comped':s.subscriptionStatus}</b><span>Status</span></div><div class="metric orange"><b>${trialDays(s)}</b><span>Trial Days</span></div><div class="metric blue"><b>${activeAddons.length}</b><span>Add-ons</span></div></div>
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">${ic('money')} PLANS</div><div class="section-note">Stripe checkout is the next live provider connection. No charge is made from these buttons yet.</div><div class="divider"></div><div class="plan-cards">${Object.entries(plans).map(([k,p])=>`<label class="plan-card subscription-card"><input type="radio" name="billingPlan" value="${k}" ${s.plan===k?'checked':''}><h3>${p.name}</h3><div class="price">${money(p.price)}<small>/month</small></div><span>${p.label}<br>Up to ${p.seats} user${p.seats>1?'s':''}</span></label>`).join('')}</div><button class="btn btn-primary" data-action="not-connected">Connect Stripe Checkout</button></section>
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">${ic('settings')} SOLO / PLAN ADD-ONS</div><div class="section-note">Add smaller upgrades without forcing a full plan jump. Stripe price IDs will attach here when billing is connected.</div><div class="divider"></div><div class="list">${addons.map(a=>{const active=activeAddons.includes(a.code);return `<div class="list-item"><div class="list-icon">${ic(a.code.includes('youtube')?'play':a.code.includes('sms')?'send':a.code.includes('seat')?'users':'camera')}</div><div class="list-main"><b>${esc(a.name)} ${active?'<span class="badge green">Active</span>':''}</b><p>${esc(a.description)}<br>${money(a.monthly_price)} / mo · ${a.quantity||''} ${esc(a.unit_label||'')}</p><div class="list-actions"><button class="btn ${active?'btn-soft':'btn-primary'}" data-action="toggle-addon" data-addon="${esc(a.code)}">${active?'Remove Add-on':'Add to Plan'}</button></div></div></div>`;}).join('')||'<div class="muted">No add-ons available for this plan.</div>'}</div></section>`;
  shopShell(content,'more');
}
function settings(){
  const s=ensureShopConfig(currentShop());
  const content=`${pageTitle('Business Settings','Shop branding, pricing, travel, markup, deposit, and intake identity.','more')}
  <form id="businessTypesForm"><section class="card card-pad"><div class="card-title">BUSINESS TYPES & TERMINOLOGY</div><div class="section-note">Change these at any time. Existing customers, jobs, invoices, and equipment are kept.</div><div class="divider"></div>${checkedCards('specialties',repairSpecialties,s.specialties)}<div class="row2" style="margin-top:10px"><div class="field"><label>Custom Specialty</label><input name="customSpecialty" value="${esc(s.customSpecialty)}" placeholder="Optional"></div><div class="field"><label>Unit Name</label><select name="assetLabel">${['Vehicle / Equipment','Vehicle','Equipment','Unit','Machine','Asset'].map(x=>`<option ${s.assetLabel===x?'selected':''}>${x}</option>`).join('')}</select></div></div></section><section class="card card-pad" style="margin-top:10px"><div class="card-title">OPTIONAL MODULES</div><div class="section-note">Turning one off hides it; it does not erase its data.</div><div class="divider"></div>${checkedCards('modules',shopModules,s.modules)}<button class="btn btn-primary" style="margin-top:12px">Save Business Types & Tools</button></section></form>
  <form id="settingsForm"><section class="card card-pad"><div class="card-title">SHOP PROFILE</div><div class="divider"></div><div class="row2"><div class="field"><label>Shop Name</label><input name="name" value="${esc(s.name)}"></div><div class="field"><label>Public Phone</label><input name="phone" value="${esc(s.phone||'')}"></div></div><div class="row2"><div class="field"><label>Shop Slug</label><input name="slug" value="${esc(s.slug)}"></div><div class="field"><label>Primary Shop Email</label><input name="email" value="${esc(s.email||'')}"></div></div><div class="field"><label>Mobile Mechanic AI Shop Identity</label><input value="${esc(s.slug)}@mobile-mechanic.app" readonly><small>App identity/alias for routing and branding; not a paid mailbox unless email hosting is added later.</small></div></section><section class="card card-pad" style="margin-top:10px"><div class="card-title">PRICING DEFAULTS</div><div class="divider"></div><div class="row3"><div class="field"><label>Labor Rate / hr</label><input name="laborRate" type="number" step=".01" value="${s.settings.laborRate}"></div><div class="field"><label>Tax %</label><input name="taxRate" type="number" step=".01" value="${s.settings.taxRate}"></div><div class="field"><label>Parts Markup %</label><input name="partsMarkup" type="number" step=".01" value="${s.settings.partsMarkup}"></div></div><div class="row3"><div class="field"><label>Travel Fee</label><input name="travelFee" type="number" step=".01" value="${s.settings.travelFee}"></div><div class="field"><label>Free Radius (mi)</label><input name="freeRadius" type="number" value="${s.settings.freeRadius}"></div><div class="field"><label>Default Deposit %</label><input name="depositPercent" type="number" value="${s.settings.depositPercent}"></div></div><button class="btn btn-primary">Save Shop Settings</button></section></form>
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">SHOP INTAKE IDENTITY</div><div class="section-note">Customers use this shop-specific link: <span class="red">${esc(intakeUrl(s))}</span></div><div class="divider"></div><button class="btn btn-soft" data-route="send-intake">Manage / Share Intake Link</button></section>`;
  shopShell(content,'more');
}

function more(){
  const s=currentShop();
  const billingTile=canViewShopFinancials()?`<button class="dash-action" data-route="billing">${ic('money')}<div><b>SUBSCRIPTION</b><span>${plans[s.plan].name}</span></div></button>`:'';
  const content=`${pageTitle('More','Shop administration and supporting tools','dashboard')}<div class="dashboard-grid"><button class="dash-action" data-route="team">${ic('users')}<div><b>TEAM LOGINS</b><span>${s.users.length}/${plans[s.plan].seats} seats</span></div></button><button class="dash-action" data-route="time-clock">${ic('clock')}<div><b>TIME CLOCK</b><span>Clock in / out</span></div></button>${billingTile}<button class="dash-action" data-route="settings">${ic('settings')}<div><b>SHOP SETTINGS</b><span>Rates + branding</span></div></button><button class="dash-action" data-route="carfax">${ic('report')}<div><b>CARFAX</b><span>Service reporting</span></div></button><button class="dash-action" data-route="warranty">${ic('shield')}<div><b>WARRANTY</b><span>Comebacks + parts</span></div></button><button class="dash-action" data-route="templates">${ic('clipboard')}<div><b>TEMPLATES</b><span>Common services</span></div></button><button class="dash-action" data-route="training">${ic('book')}<div><b>TRAINING</b><span>ASE / 609 study</span></div></button><button class="dash-action" data-route="export">${ic('upload')}<div><b>DATA EXPORT</b><span>Shop records</span></div></button></div><div class="card card-pad" style="margin-top:10px"><button class="btn btn-soft btn-wide" data-action="logout">Log Out</button></div>`;
  shopShell(content,'more');
}

function calendar(){
  const s=currentShop();
  const sorted=[...s.jobs].sort((a,b)=>new Date(a.scheduledStart||a.createdAt)-new Date(b.scheduledStart||b.createdAt));
  const today=new Date().toDateString();
  const scheduled=sorted.filter(j=>j.scheduledStart);
  const unscheduled=sorted.filter(j=>!j.scheduledStart);
  const todayJobs=scheduled.filter(j=>new Date(j.scheduledStart).toDateString()===today);
  const content=`${pageTitle('Calendar','Schedule jobs by estimated labor time, travel, and buffer.')}
  <div class="metric-grid"><div class="metric red"><b>${todayJobs.length}</b><span>Today</span></div><div class="metric green"><b>${scheduled.length}</b><span>Scheduled</span></div><div class="metric orange"><b>${unscheduled.length}</b><span>Need Time</span></div><div class="metric blue"><b>${Math.round(scheduled.reduce((sum,j)=>sum+scheduleDurationMinutes(j),0)/60)}</b><span>Hours Booked</span></div></div>
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">${ic('calendar')} SCHEDULED JOBS</div><div class="divider"></div><div class="list">${scheduled.map(j=>`<div class="list-item"><div class="list-icon">${ic('calendar')}</div><div class="list-main"><b>${esc(j.customerName)} - ${esc(vehicleText(j.vehicle))}</b><p>${esc(scheduleWindow(j))}<br>${esc(j.location||'No location')} · ${Number(j.estimatedLaborHours||1)} hr labor + ${Number(j.travelMinutes||0)} min travel + ${Number(j.bufferMinutes??15)} min buffer</p><div class="list-actions"><button class="btn btn-soft" data-action="schedule-job" data-job="${j.id}">Edit Time</button><button class="btn btn-soft" data-action="open-maps" data-location="${esc(j.location||'')}">Maps</button></div></div><div class="list-meta">${esc(j.status)}</div></div>`).join('')||'<div class="muted">No scheduled jobs yet.</div>'}</div></section>
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">${ic('jobs')} NEEDS SCHEDULE</div><div class="divider"></div><div class="list">${unscheduled.map(j=>`<div class="list-item"><div class="list-icon">${ic('wrench')}</div><div class="list-main"><b>${esc(j.customerName)} - ${esc(vehicleText(j.vehicle))}</b><p>${esc(j.availability||'Customer availability not set')}<br>${esc(j.complaint||'')}</p><div class="list-actions"><button class="btn btn-primary" data-action="schedule-job" data-job="${j.id}">Schedule</button></div></div></div>`).join('')||'<div class="muted">Everything has a scheduled time.</div>'}</div></section>`;
  shopShell(content,'calendar');
}
function reports(){
  const s=currentShop();
  const content=`${pageTitle('Reports','Job history, profitability, declined work, warranties, and service records.')}
  <div class="metric-grid"><div class="metric red"><b>${s.jobs.length}</b><span>Total Jobs</span></div><div class="metric green"><b>${s.jobs.filter(j=>j.status==='Completed').length}</b><span>Completed</span></div><div class="metric orange"><b>${s.declined?.length||0}</b><span>Declined</span></div><div class="metric blue"><b>${s.warranties?.length||0}</b><span>Warranty / Comeback</span></div></div><section class="card card-pad" style="margin-top:10px"><div class="card-title">JOB PROFITABILITY</div><div class="section-note">Production version compares estimate vs. actual technician time, parts cost, travel expense, and gross profit. Customer never sees internal cost/profit.</div></section>`;
  shopShell(content,'reports');
}

function simpleModule(title,desc,items,active='more'){
  const content=`${pageTitle(title,desc,'more')}<section class="card card-pad"><div class="list">${items.map(([icon,t,p])=>`<div class="list-item"><div class="list-icon">${ic(icon)}</div><div class="list-main"><b>${esc(t)}</b><p>${esc(p)}</p></div></div>`).join('')}</div></section>`;
  shopShell(content,active);
}
function parts(){ simpleModule('Parts & Warranty Vault','Parts sourcing, markup, receipt storage, core tracking, and warranty.',[['search','Nearby Parts Sources','AutoZone, O’Reilly, NAPA, dealerships, and other suppliers. Real-time inventory/pricing only when an authorized data source is connected.'],['report','Receipt / Warranty Vault','Attach supplier receipt, part number, purchase date, warranty, vehicle, and technician.'],['money','Core Charge Tracking','Remind the shop until starters, alternators, batteries, transmissions, and other cores are returned.'],['shield','Parts Warranty','Connect warranty replacement to original job and installed part.']]); }
function fleet(){ simpleModule('Fleet Service','Pro/Fleet tools for fleet customers, unit numbers, diesel/semi service, maintenance history, and roadside.',[['truck','Fleet Units','Multiple vehicles, unit numbers, driver contacts, locations, and maintenance records.'],['brain','Fleet AI Intake','Vehicle/unit-specific complaint and diagnostic pre-workup.'],['calendar','Scheduled Maintenance','Mileage/time-based maintenance recommendations and reminders.'],['report','Fleet Reports','Service history and recurring maintenance records.']]); }
function roadside(){ simpleModule('Roadside + Tow Handoff','When a vehicle should not be driven, transfer the customer, vehicle, and location into a towing workflow.',[['location','Roadside Location','Current customer/job location with permission.'],['tow','Tow Required','Reason vehicle should not be driven, pickup, destination, and technician notes.'],['send','Tow Handoff','Production integrations can send the job to a towing provider; until connected, the app prepares the handoff details.']]); }
function warranty(){ simpleModule('Warranty / Comeback Tracking','Connect a warranty or comeback to the original repair.',[['shield','Warranty Job','Track labor warranty, parts warranty, and original invoice.'],['wrench','Comeback / Recheck','Record whether the issue is related, unrelated, or diagnostic follow-up.'],['camera','Evidence','Before/after photos and technician findings remain with the original repair.']]); }
function templates(){ simpleModule('Shop Templates','Save repeatable service packages without forcing a full CRM.',[['clipboard','Common Services','Brake service, oil service, AC diagnostic, no-start diagnostic, PPI, etc.'],['money','Pricing Defaults','Each template can include labor, supplies, markup, travel, and disclaimer defaults.'],['send','Customer Explanation','AI can convert technical work into plain language; mechanic reviews before sending.']]); }
function training(){ simpleModule('Training & Certification Study','Optional technician education and practice—not official certification issuance.',[['book','ASE Practice','Diagnostic and system practice questions.'],['book','EPA Section 609 Study','Study resources only; official certification remains with authorized providers.'],['brain','Diagnostic Exercises','Electrical, engine performance, brakes, HVAC, and troubleshooting scenarios.']]); }
function carfax(){
  const s=currentShop();
  const content=`${pageTitle('CARFAX-Ready Service Reporting','Prepare service history records without pretending they were submitted.')}
  <section class="card card-pad"><div class="card-title">${ic('report')} COMPLETED SERVICE RECORDS</div><div class="section-note red">Actual CARFAX submission requires an authorized CARFAX service/partner connection.</div><div class="divider"></div><div class="list">${s.jobs.map(j=>`<div class="list-item"><div class="list-icon">${ic('car')}</div><div class="list-main"><b>${esc(vehicleText(j.vehicle))} • ${esc(j.customerName)}</b><p>VIN: ${esc(j.vehicle.vin||'Not entered')} • Mileage: ${esc(j.vehicle.mileage||'—')}<br>Service status: ${esc(j.carfax?.status||'Ready')}</p><div class="list-actions"><button class="btn btn-soft" data-action="prepare-carfax" data-job="${j.id}">Prepare Service Record</button></div></div></div>`).join('')}</div></section>`;
  shopShell(content,'more');
}
function exportData(){
  const s=currentShop();
  const content=`${pageTitle('Shop Data Export','A shop can export its customers, vehicles, jobs, invoices, and service records.')}
  <section class="card card-pad"><div class="card-title">${ic('upload')} EXPORT ${esc(s.name).toUpperCase()}</div><div class="section-note">The shop owns its business records. Subscription access does not transfer ownership of Mobile Mechanic AI software.</div><div class="divider"></div><button class="btn btn-primary" data-action="export-json">Download Shop Data (JSON)</button></section>`;
  shopShell(content,'more');
}
function serviceInfo(){
  const s=currentShop(),j=jobById(db.session?.activeJobId)||s.jobs?.[0]||null;
  const content=`${pageTitle('Service Information','Vehicle-specific procedures, specifications, bulletins, diagrams, and quick service.','dashboard')}<div id="serviceInformationRoot"></div>`;
  shopShell(content,'more');
  window.MobileMechanicServiceInformation?.render(document.getElementById('serviceInformationRoot'),{shop:s,job:j});
}

function platformAdmin(){
  const u=platformUser(); if(!u)return login();
  const shops=Object.values(db.shops); const active=shops.filter(subscriptionOK); const mrr=shops.filter(s=>s.subscriptionStatus==='active'&&!s.comped).reduce((t,s)=>t+(plans[s.plan]?.price||0),0);
  const canAdmins=platformCan('admins_manage'), canAct=platformCan('activity_view');
  const shopRows=shops.map(s=>`<tr><td><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.slug)} • ${esc(s.id)}</span></td><td>${plans[s.plan]?.name}</td><td>${s.subscriptionStatus==='active'?'Paid':s.comped?'Comped':s.subscriptionStatus==='suspended'?'Suspended':`${trialDays(s)} trial days`}</td><td>${s.users.filter(x=>x.active).length}/${plans[s.plan].seats}</td><td><div class="btn-row">${platformCan('shops_open')?`<button class="btn btn-soft" data-admin="open" data-shop="${s.id}">Open</button>`:''}${platformCan('trial_extend')?`<button class="btn btn-soft" data-admin="extend" data-shop="${s.id}">+30 Days</button>`:''}${platformCan('comp')?`<button class="btn btn-soft" data-admin="comp" data-shop="${s.id}">${s.comped?'Uncomp':'Comp'}</button>`:''}${platformCan('suspend')?`<button class="btn btn-danger" data-admin="suspend" data-shop="${s.id}">${s.subscriptionStatus==='suspended'?'Reactivate':'Suspend'}</button>`:''}${!platformCan('shops_open')&&!platformCan('trial_extend')&&!platformCan('comp')&&!platformCan('suspend')?'<span class="muted">View only</span>':''}</div></td></tr>`).join('');
  const admins=[db.platformOwner,...(db.platformAdmins||[])];
  ROOT.innerHTML=`<div class="shell"><header class="topbar"><div class="brand">${logo(null)}<div class="brand-copy"><div class="brand-title">Mobile <span class="red">Mechanic</span> AI</div><div class="brand-sub">${esc(platformRoleLabels[u.role]||u.role).toUpperCase()}</div></div></div><div class="top-spacer"></div><div class="shop-pill">${ic('shield')}<span>${esc(u.name)}</span></div><button class="top-btn" data-action="logout">${ic('lock')}</button></header><div class="layout" style="grid-template-columns:1fr"><main class="content"><div class="admin-banner"><div class="eyebrow">${esc(platformRoleLabels[u.role]||u.role)}</div><h1>Platform Administration</h1><p>${u.role==='platform_owner'?'Your owner account has full platform control and no subscription requirement.':'Your permissions are limited to your assigned platform-admin role.'}</p></div><div class="metric-grid"><div class="metric red"><b>${shops.length}</b><span>Total Shops</span></div><div class="metric green"><b>${active.length}</b><span>Accessible</span></div><div class="metric orange"><b>${shops.filter(s=>s.subscriptionStatus==='trialing').length}</b><span>Trials</span></div><div class="metric blue"><b>${money(mrr)}</b><span>Estimated MRR</span></div></div>
  <section class="card card-pad table-card" style="margin-top:10px"><div class="card-title">SHOP ACCOUNTS</div><div class="section-note">Platform-level view. Tenant records remain isolated by immutable shop ID.</div><div class="divider"></div><table class="data-table"><thead><tr><th>Shop</th><th>Plan</th><th>Status</th><th>Users</th><th>Actions</th></tr></thead><tbody>${shopRows}</tbody></table></section>
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">PLATFORM ADMIN PROFILES</div><div class="section-note">Delegate billing, support, operations, or technical work without giving away Platform Owner control.</div><div class="divider"></div><div class="list">${admins.map(a=>`<div class="list-item"><div class="list-icon">${ic('shield')}</div><div class="list-main"><b>${esc(a.name)}</b><p>${esc(a.email)} • ${esc(platformRoleLabels[a.role]||a.role)} • ${a.active?'Active':'Disabled'}</p>${canAdmins&&a.role!=='platform_owner'?`<div class="list-actions"><button class="btn btn-soft" data-platform-user-toggle="${a.id}">${a.active?'Disable':'Enable'}</button></div>`:''}</div></div>`).join('')}</div>${canAdmins?`<div class="divider"></div><form id="platformAdminForm"><div class="row2"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div></div><div class="row2"><div class="field"><label>Role</label><select name="role"><option value="billing_admin">Billing Admin</option><option value="support_admin">Support Admin</option><option value="operations_admin">Operations Admin</option><option value="technical_admin">Technical Admin</option><option value="read_only_admin">Read-Only Admin</option></select></div><div class="field"><label>Temporary Password</label><input name="password" type="password" minlength="8" required></div></div><button class="btn btn-primary">Create Platform Admin</button></form>`:''}</section>
  ${canAct?`<section class="card card-pad" style="margin-top:10px"><div class="card-title">ADMIN ACTIVITY LOG</div><div class="section-note">Shows who performed sensitive platform actions.</div><div class="divider"></div><div class="list">${(db.adminActivity||[]).slice(0,20).map(x=>`<div class="list-item"><div class="list-icon">${ic('report')}</div><div class="list-main"><b>${esc(x.adminName)} — ${esc(x.action)}</b><p>${new Date(x.at).toLocaleString()}${x.shopId?` • ${esc(db.shops[x.shopId]?.name||x.shopId)}`:''}${x.detail?`<br>${esc(x.detail)}`:''}</p></div></div>`).join('')||'<div class="muted">No admin activity recorded yet.</div>'}</div></section>`:''}
  <section class="card card-pad" style="margin-top:10px"><div class="card-title">PLATFORM EMAIL IDENTITY</div><div class="section-note">Recommended public addresses: support@mobile-mechanic.app • billing@mobile-mechanic.app • notifications@mobile-mechanic.app. Your private Platform Owner login stays private.</div></section></main></div></div>`;
  bind();
}

function addVehicle(customerId){
  const s=currentShop(),c=s.customers.find(x=>x.id===customerId); if(!c)return;
  modal('Add Vehicle',`<form id="addVehicleForm" data-customer="${c.id}"><div class="row2"><div class="field"><label>Year</label><select name="year">${yearOptions()}</select></div><div class="field"><label>Make</label><input name="make" required></div></div><div class="row2"><div class="field"><label>Model</label><input name="model" required></div><div class="field"><label>Engine</label><input name="engine"></div></div><div class="field"><label>VIN</label><input name="vin" maxlength="17"></div><button class="btn btn-primary">Save Vehicle</button></form>`);
}
function closeModal(){ document.querySelector('.modal-backdrop')?.remove(); }
function modal(title,body){ const d=document.createElement('div'); d.className='modal-backdrop'; d.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="close-btn" type="button" data-action="close-modal" aria-label="Close">×</button></div>${body}</div>`; document.body.appendChild(d); bind(); }
document.addEventListener('click',e=>{const backdrop=e.target.closest?.('.modal-backdrop');if(e.target.closest?.('[data-action="close-modal"]')||e.target===backdrop)closeModal();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

function bind(){
  document.querySelectorAll('[data-action="show-login"]').forEach(b=>b.addEventListener('click',()=>{const m=document.querySelector('.landing-login');m?.classList.add('open');m?.setAttribute('aria-hidden','false');setTimeout(()=>document.getElementById('loginEmail')?.focus(),80);}));
  document.querySelector('[data-action="hide-login"]')?.addEventListener('click',()=>{const m=document.querySelector('.landing-login');m?.classList.remove('open');m?.setAttribute('aria-hidden','true');});
  document.querySelectorAll('[data-external]').forEach(el=>el.onclick=()=>window.open(el.dataset.external,'_blank','noopener'));

  document.querySelector('[data-action="login"]')?.addEventListener('click',()=>{
    const email=document.getElementById('loginEmail').value.trim().toLowerCase(),pass=document.getElementById('loginPassword').value;
    if(email===db.platformOwner.email.toLowerCase() && pass===db.platformOwner.password && db.platformOwner.active!==false){ db.session={role:'platform_owner',adminId:db.platformOwner.id,name:db.platformOwner.name};save();location.hash='#admin';return platformAdmin(); }
    const pa=(db.platformAdmins||[]).find(a=>a.active!==false && a.email.toLowerCase()===email && a.password===pass);
    if(pa){ db.session={role:'platform_admin',adminId:pa.id,name:pa.name};save();location.hash='#admin';return platformAdmin(); }
    for(const s of Object.values(db.shops)){
      const u=s.users.find(u=>u.active && u.email.toLowerCase()===email && u.password===pass);
      if(u){ db.session={role:'shop',shopId:s.id,userId:u.id,activeJobId:s.jobs[0]?.id||null};save();location.hash='#dashboard';return s.setupComplete?dashboard():setup(); }
    }
    toast('Login not found. Check email and password.','bad');
  });

  document.getElementById('signupForm')?.addEventListener('submit',e=>{
    e.preventDefault(); const d=Object.fromEntries(new FormData(e.currentTarget));
    if(Object.values(db.shops).some(s=>s.users.some(u=>u.email.toLowerCase()===d.email.toLowerCase()))) return toast('That email is already in use.','bad');
    const id=uid('shop'), userId=uid('usr'), slugBase=slugify(d.shopName); let slug=slugBase,n=2; while(Object.values(db.shops).some(s=>s.slug===slug))slug=`${slugBase}-${n++}`;
    db.shops[id]={id,slug,name:d.shopName,ownerName:d.ownerName,phone:d.phone,email:d.email,plan:d.plan,trialStarted:nowISO(),trialEnds:new Date(Date.now()+60*86400000).toISOString(),subscriptionStatus:'trialing',comped:false,setupComplete:false,logo:null,theme:{accent:'#ef2a31',background:'dark',style:'vibrant'},settings:{laborRate:75,taxRate:0,partsMarkup:25,travelFee:0,freeRadius:10,depositPercent:60},specialties:[...defaultSpecialties],modules:[...defaultModules],customSpecialty:'',assetLabel:'Vehicle / Equipment',terms:null,users:[{id:userId,name:d.ownerName,email:d.email,password:d.password,role:'owner',active:true}],customers:[],jobs:[],inspections:[],warranties:[],declined:[],receipts:[],fleet:[]};
    db.session={role:'shop',shopId:id,userId,activeJobId:null};save();location.hash='#setup';setup();
  });

  document.querySelector('[data-action="trigger-logo"]')?.addEventListener('click',()=>document.getElementById('logoFile')?.click());
  document.getElementById('logoFile')?.addEventListener('change',e=>{ const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{currentShop().logo=r.result;save();setup();}; r.readAsDataURL(f); });
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{currentShop().theme.accent=b.dataset.color;save();document.documentElement.style.setProperty('--red',b.dataset.color);document.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b));});
  document.querySelector('[data-action="accept-all"]')?.addEventListener('click',()=>{
    document.querySelectorAll('.agreement-check').forEach(c=>c.checked=true); const s=currentShop(); s.name=document.getElementById('setupShopName').value.trim()||s.name;s.phone=document.getElementById('setupPhone').value.trim();s.email=document.getElementById('setupEmail').value.trim()||s.email;s.specialties=[...document.querySelectorAll('input[name="setupSpecialties"]:checked')].map(x=>x.value);s.modules=[...document.querySelectorAll('input[name="setupModules"]:checked')].map(x=>x.value);s.customSpecialty=document.getElementById('setupCustomSpecialty')?.value.trim()||'';s.assetLabel=document.getElementById('setupAssetLabel')?.value||'Vehicle / Equipment';if(!s.specialties.length)return toast('Choose at least one business specialty.','bad'); const u=currentUser(); if(u)u.name=document.getElementById('setupTechName').value.trim()||u.name;s.setupComplete=true;s.terms={version:TERMS_VERSION,acceptedAt:nowISO(),userId:u?.id};save();toast('Shop setup saved. You can change it later in Settings.','good');setTimeout(()=>go('dashboard'),450);
  });

  document.getElementById('intakeForm')?.addEventListener('submit',e=>{
    e.preventDefault(); const f=e.currentTarget,d=Object.fromEntries(new FormData(f)),s=db.shops[f.dataset.shop]; if(!s)return;
    const cid=uid('cus'),vid=uid('veh'),jid=uid('job'); const vehicle={id:vid,year:d.year,make:d.make,model:d.model,trim:d.trim,engine:d.engine,drive:d.drive,vin:(d.vin||'').toUpperCase(),plate:d.plate,mileage:d.mileage};
    const existing=s.customers.find(c=>c.phone && c.phone===d.phone); let customerId;
    if(existing){ customerId=existing.id; existing.email=existing.email||d.email;existing.address=d.location||existing.address; if(!existing.vehicles.some(v=>vehicle.vin&&v.vin===vehicle.vin))existing.vehicles.push(vehicle); }
    else { customerId=cid;s.customers.push({id:cid,name:d.customerName,phone:d.phone,email:d.email,address:d.location,vehicles:[vehicle]}); }
    s.jobs.push({id:jid,customerId,customerName:d.customerName,phone:d.phone,email:d.email,vehicle,complaint:d.complaint,requestType:d.requestType,availability:d.availability,location:d.location,createdAt:nowISO(),status:'AI Pre-Workup',assignedTo:null,findings:'',codes:'',photos:[],estimate:null,approval:null,scheduledStart:null,scheduledEnd:null,estimatedLaborHours:1,travelMinutes:0,bufferMinutes:15,scheduleNotes:'',carfax:{status:'Not connected'}});save();
    if(f.dataset.public==='true'){ ROOT.innerHTML=`<section class="customer-shell"><div class="customer-frame"><header class="customer-top">${logo(s)}<div><h1>Mobile <span>Mechanic</span> AI</h1><p>Request Sent</p></div></header><div class="customer-body" style="padding:26px"><div class="customer-card" style="text-align:center"><h2>✓ Sent to ${esc(s.name)}</h2><p>Your request was received.</p><p class="muted small">The shop will review it and contact you with the next step.</p></div></div></div></section>`;return; }
    db.session.activeJobId=jid;save();workup(jid);
  });

  document.querySelector('[data-action="location"]')?.addEventListener('click',()=>{
    if(!navigator.geolocation)return toast('Location is not supported on this device.','bad');navigator.geolocation.getCurrentPosition(p=>{document.getElementById('serviceLocation').value=`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;toast('Current location added.','good');},()=>toast('Location permission was not granted.','bad'));
  });
  document.querySelector('[data-action="vin-decode"]')?.addEventListener('click',async()=>{
    const vin=document.getElementById('vinInput').value.trim().toUpperCase(),out=document.getElementById('vinResult'); if(vin.length!==17){out.textContent='Enter a 17-character VIN.';return;}
    out.textContent='Looking up VIN using the free NHTSA vPIC service…';
    try{const r=await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`);const js=await r.json();const v=js.Results?.[0];if(!v)throw 0;out.innerHTML=`<span class="badge">NHTSA decoded</span> ${esc([v.ModelYear,v.Make,v.Model,v.Trim,v.DisplacementL?`${v.DisplacementL}L`:v.EngineModel].filter(Boolean).join(' • '))}`;const form=document.getElementById('intakeForm');if(v.ModelYear)form.elements.year.value=v.ModelYear;if(v.Make){const sel=form.elements.make;const found=[...sel.options].find(o=>o.text.toLowerCase()===v.Make.toLowerCase());if(found)sel.value=found.value;}if(v.Model)form.elements.model.value=v.Model;if(v.Trim)form.elements.trim.value=v.Trim;if(v.DisplacementL)form.elements.engine.value=`${v.DisplacementL}L`;toast('VIN decoded from NHTSA.','good');}
    catch{out.textContent='VIN lookup could not be reached. Manual entry still works.';}
  });
  document.querySelector('[data-action="scan-placeholder"]')?.addEventListener('click',()=>toast('Camera OCR/plate scanning requires the production scanner integration.',''));
  setupSpeech('[data-action="voice-customer"]','complaintInput'); setupSpeech('[data-action="voice-findings"]','findingText');

  document.querySelector('[data-action="copy-intake"]')?.addEventListener('click',async()=>{await navigator.clipboard?.writeText(document.getElementById('intakeLink').value);toast('Shop intake link copied.','good');});
  document.querySelectorAll('[data-action="copy-text"]').forEach(b=>b.addEventListener('click',()=>navigator.clipboard?.writeText(b.dataset.copy||'').then(()=>toast('Copied.','good'))));
  document.querySelector('[data-action="share-intake"]')?.addEventListener('click',()=>{const s=currentShop(),url=intakeUrl(s);navigator.share?navigator.share({title:`${s.name} Customer Intake`,text:`Please fill out this vehicle intake for ${s.name}.`,url}).catch(()=>{}):navigator.clipboard?.writeText(url).then(()=>toast('Intake link copied.','good'));});
  document.querySelector('[data-action="preview-intake"]')?.addEventListener('click',()=>publicIntake(currentShop()));

  document.querySelector('[data-action="save-estimate"]')?.addEventListener('click',e=>{const j=jobById(e.currentTarget.dataset.job);j.estimate=estimateFromJob(j,currentShop());j.status='Estimate Ready';save();toast('Good / Better / Best saved to job.','good');});
  document.querySelectorAll('[data-action="schedule-job"]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const j=jobById(b.dataset.job);if(!j)return;modal('Schedule Job',`<div class="field"><label>Start Time</label><input id="scheduleStart" type="datetime-local" value="${localDateTimeValue(j.scheduledStart)}"></div><div class="row3"><div class="field"><label>Labor Hours</label><input id="scheduleHours" type="number" step=".25" min=".25" value="${Number(j.estimatedLaborHours||1)}"></div><div class="field"><label>Travel Minutes</label><input id="scheduleTravel" type="number" min="0" value="${Number(j.travelMinutes||0)}"></div><div class="field"><label>Buffer Minutes</label><input id="scheduleBuffer" type="number" min="0" value="${Number(j.bufferMinutes??15)}"></div></div><div class="field"><label>Notes</label><textarea id="scheduleNotes" placeholder="Gate code, parking, parts pickup...">${esc(j.scheduleNotes||'')}</textarea></div><button class="btn btn-primary btn-wide" data-action="save-schedule" data-job="${j.id}">${ic('calendar')} Save Schedule Block</button><p class="small muted">End time is calculated from labor + travel + buffer. The app warns you if another scheduled job overlaps.</p>`);})); 
  document.querySelector('[data-action="save-schedule"]')?.addEventListener('click',async e=>{const j=jobById(e.currentTarget.dataset.job);if(!j)return;const startVal=document.getElementById('scheduleStart').value;if(!startVal)return toast('Pick a start time.','bad');j.estimatedLaborHours=Number(document.getElementById('scheduleHours').value||1);j.travelMinutes=Number(document.getElementById('scheduleTravel').value||0);j.bufferMinutes=Number(document.getElementById('scheduleBuffer').value||15);j.scheduleNotes=document.getElementById('scheduleNotes').value||'';const start=new Date(startVal),end=scheduleEnd(start,j),conflict=scheduleConflict(j,start,end);if(conflict&&!confirm(`This overlaps ${conflict.customerName || 'another job'}. Save anyway?`))return;j.scheduledStart=start.toISOString();j.scheduledEnd=end.toISOString();j.status=j.status==='AI Pre-Workup'?'Scheduled':j.status;save();toast('Schedule block saved.','good');document.querySelector('.modal-backdrop')?.remove();calendar();});
  document.querySelectorAll('[data-action="open-maps"]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const loc=b.dataset.location;if(!loc)return toast('No location saved.','bad');window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`,'_blank');}));
  document.querySelector('[data-action="send-estimate"]')?.addEventListener('click',e=>estimateShare(e.currentTarget.dataset.job));
  document.querySelector('[data-action="single-estimate"]')?.addEventListener('click',e=>{const j=jobById(e.currentTarget.dataset.job);j.estimate=estimateFromJob(j,currentShop());modal('Send One Estimate Option',`<p class="muted small">Choose the one option you want the customer to see. Production backend will create a secure, versioned authorization link.</p>${Object.entries(j.estimate).map(([k,o])=>`<button class="btn btn-wide ${k==='better'?'btn-primary':'btn-soft'}" data-action="send-one" data-job="${j.id}" data-option="${k}">${o.title} — ${money(o.price)}</button>`).join('<br><br>')}`);});
  document.querySelectorAll('[data-action="send-one"]').forEach(b=>b.onclick=()=>{const j=jobById(b.dataset.job),s=currentShop(),o=j.estimate[b.dataset.option];const text=`${s.name} estimate for ${vehicleText(j.vehicle)}: ${o.title} ${money(o.price)} — ${o.summary}`;navigator.share?navigator.share({title:'Repair Estimate',text}).catch(()=>{}):navigator.clipboard?.writeText(text).then(()=>toast('Single estimate copied.','good'));});

  document.querySelector('[data-action="approve-estimate"]')?.addEventListener('click',e=>{
    const option=document.querySelector('input[name="customerOption"]:checked')?.value;if(!option)return toast('Choose Good, Better, or Best first.','bad');if(!document.getElementById('approveCheck').checked)return toast('Check the authorization box first.','bad');const s=db.shops[e.currentTarget.dataset.shop],j=s.jobs.find(x=>x.id===e.currentTarget.dataset.job),name=document.getElementById('approveName').value.trim();j.approval={status:'approved',option,name,approvedAt:nowISO(),estimateVersion:1};j.status='Approved / Ready for Work';save();const msg=`I, ${name}, approve the ${j.estimate[option].title} option (${money(j.estimate[option].price)}) for ${vehicleText(j.vehicle)}. Approval time: ${new Date(j.approval.approvedAt).toLocaleString()}.`;
    ROOT.innerHTML=`<section class="customer-shell"><div class="customer-frame"><div class="customer-body" style="padding:28px"><div class="customer-card" style="text-align:center"><h2>Repair Option Approved</h2><p><b>${esc(j.estimate[option].title)} — ${money(j.estimate[option].price)}</b></p><p class="muted small">${esc(msg)}</p><button class="btn btn-primary" id="shareApproval">Send Confirmation to Shop</button></div></div></div></section>`;document.getElementById('shareApproval').onclick=()=>{if(navigator.share)navigator.share({text:msg}).catch(()=>{});else if(s.phone)location.href=`sms:${s.phone}?body=${encodeURIComponent(msg)}`;};
  });
  document.querySelector('[data-action="decline-estimate"]')?.addEventListener('click',e=>{const s=db.shops[e.currentTarget.dataset.shop],j=s.jobs.find(x=>x.id===e.currentTarget.dataset.job);j.approval={status:'declined',declinedAt:nowISO()};j.status='Customer Declined';s.declined.push({jobId:j.id,when:nowISO(),note:'Customer declined all estimate options'});save();publicMessage('Estimate Declined','The shop can contact you to discuss other options.');});

  document.querySelector('[data-action="save-findings"]')?.addEventListener('click',()=>{const j=jobById(db.session.activeJobId);j.findings=document.getElementById('findingText').value;j.codes=document.getElementById('codeInput').value;j.status='Diagnosis / Findings';save();toast('Technician findings saved.','good');});
  document.querySelector('[data-action="photo-upload"]')?.addEventListener('click',()=>document.getElementById('findingPhoto')?.click());
  document.getElementById('findingPhoto')?.addEventListener('change',e=>{const f=e.target.files?.[0],j=jobById(db.session.activeJobId);if(!f||!j)return;const r=new FileReader();r.onload=()=>{j.photos.push(r.result);save();findings();};r.readAsDataURL(f);});
  document.querySelectorAll('[data-severity]').forEach(b=>b.onclick=()=>{const j=jobById(db.session.activeJobId);j.severity=b.dataset.severity;save();toast(`Inspection category: ${b.dataset.severity}`,'good');});
  document.querySelector('[data-action="before-replace"]')?.addEventListener('click',()=>modal('Before You Replace It',`<div class="list">${[['check','Confirm the symptom independently','Reproduce it and compare commanded vs. actual data.'],['shield','Check power, ground, connectors','Rule out wiring, voltage drop, network, and connector faults.'],['brain','Look upstream','Ask what could make the component look bad even if it is good.'],['wrench','Use a definitive test','Choose the safest test that can prove or disprove the theory before replacement.']].map(x=>`<div class="list-item"><div class="list-icon">${ic(x[0])}</div><div class="list-main"><b>${x[1]}</b><p>${x[2]}</p></div></div>`).join('')}</div>`));
  document.querySelector('[data-action="to-estimate"]')?.addEventListener('click',e=>workup(e.currentTarget.dataset.job));
  document.querySelector('[data-action="complete-job"]')?.addEventListener('click',e=>{const j=jobById(e.currentTarget.dataset.job);j.status='Completed';j.completedAt=nowISO();j.carfax={status:'Ready'};save();toast('Job marked completed; service record is CARFAX-ready.','good');findings();});
  document.querySelector('[data-action="ask-vehicle"]')?.addEventListener('click',e=>{const j=jobById(e.currentTarget.dataset.job);modal('Ask Mobile Mechanic AI About This Vehicle',`<p class="muted small">Production AI will automatically receive this vehicle's complaint, mileage, prior repairs, codes, findings, and current job context.</p><div class="field"><textarea placeholder="Ask about this vehicle...">What should I verify next on this ${esc(vehicleText(j.vehicle))}?</textarea></div><button class="btn btn-primary" data-action="not-connected">Ask AI</button>`);});

  document.querySelector('[data-action="second-opinion"]')?.addEventListener('click',()=>{const out=document.getElementById('secondResult');out.innerHTML=`<div class="list">${[['brain','Challenge the leading theory','What condition could produce the same symptom without the suspected component being bad?'],['wrench','Prove the failure','Identify the test that most directly proves or disproves the suspected component.'],['shield','Check basics first','Confirm power, ground, connector integrity, fluid/pressure conditions, and related inputs.'],['report','Compare authoritative data','Verify specs and procedures against official service information before final repair.']].map(x=>`<div class="list-item"><div class="list-icon">${ic(x[0])}</div><div class="list-main"><b>${x[1]}</b><p>${x[2]}</p></div></div>`).join('')}</div><p class="small muted">This is a rule-based prototype response. Secure production AI is not connected yet.</p>`;});

  document.querySelector('[data-action="quote-help"]')?.addEventListener('click',()=>modal('What can I say?',`<div class="list">${['Replace front brake pads and rotors.','Parts cost $280 with a 30% markup.','Charge three hours labor at $120 per hour.','Add a $50 mobile service fee.','Add diagnosis for $120.','Customer supplied the alternator.','Require the parts cost as the deposit.','Include a 12-month parts and labor warranty.','Make Good, Better, and Best options.','Change labor to four hours.','Remove the diagnostic fee.'].map(x=>`<button class="list-item" type="button" data-action="use-quote-example" data-example="${esc(x)}"><div class="list-main"><b>${esc(x)}</b><p>Tap to use this example.</p></div></button>`).join('')}</div>`));
  document.querySelectorAll('[data-action="use-quote-example"]').forEach(b=>b.onclick=()=>{const q=document.getElementById('qVoice');if(q)q.value=[q.value,b.dataset.example].filter(Boolean).join(' ');document.querySelector('.modal-backdrop')?.remove();});
  setupSpeech('[data-action="voice-quote"]','qVoice');
  document.querySelector('[data-action="calc-quote"]')?.addEventListener('click',()=>{
    const s=currentShop(),text=document.getElementById('qVoice')?.value.trim()||'';if(!text)return toast('Tap the microphone and describe what needs done first.','bad');
    const num='(\\d+(?:\\.\\d+)?)',after=words=>new RegExp(`(?:${words})[^$\\d]{0,24}\\$?${num}`,'i'),before=words=>new RegExp(`\\$?${num}[^a-z\\d]{0,12}(?:dollars?[^a-z]{0,8})?(?:${words})`,'i'),pick=words=>Number((text.match(after(words))||text.match(before(words))||[])[1]||0);
    const hours=Number((text.match(new RegExp(`${num}\\s*(?:hours?|hrs?)`,'i'))||[])[1]||0),spokenRate=pick('labor(?: rate)?|per hour|an hour'),rate=spokenRate||Number(s.settings.laborRate||0),parts=pick('parts?(?: cost)?'),sup=pick('shop supplies|supplies|consumables'),travel=pick('service call|travel(?: fee)?|mobile fee'),diag=pick('diagnosis|diagnostic(?: fee)?'),markup=Number((text.match(new RegExp(`${num}\\s*(?:percent|%)\\s*(?:parts?\\s*)?markup`,'i'))||[])[1]||s.settings.partsMarkup||0);
    const labor=hours*rate,partsSell=parts*(1+markup/100),sub=labor+partsSell+sup+travel+diag,tax=sub*Number(s.settings.taxRate||0)/100,total=sub+tax,deposit=total*Number(s.settings.depositPercent||0)/100,id=document.getElementById('qEditId')?.value||uid('qq'),record={id,description:text,hours,rate,parts,markup,supplies:sup,travel,diagnostic:diag,tax,total,deposit,createdAt:nowISO()};
    s.quickQuotes=s.quickQuotes||[];const old=s.quickQuotes.findIndex(q=>q.id===id);if(old>=0){record.createdAt=s.quickQuotes[old].createdAt;s.quickQuotes[old]=record;}else s.quickQuotes.push(record);save();
    document.getElementById('quoteResult').innerHTML=`<div class="list-item"><div class="list-main"><b>Customer Total: ${money(total)}</b><p>${esc(text)}<br>Labor ${money(labor)} (${hours} hr × ${money(rate)}) • Parts ${money(partsSell)} • Supplies ${money(sup)} • Travel ${money(travel)} • Diagnosis ${money(diag)} • Tax ${money(tax)}<br>Suggested ${s.settings.depositPercent}% deposit: ${money(deposit)}</p><div class="list-actions"><button class="btn btn-soft" data-action="edit-current-quote">${ic('mic')} Edit with Voice</button><button class="btn btn-primary" data-action="copy-current-quote">Copy Quote</button></div></div></div>`;
    setupSpeech('[data-action="edit-current-quote"]','qVoice');document.querySelector('[data-action="copy-current-quote"]').onclick=()=>navigator.clipboard?.writeText(`${text}\nTotal: ${money(total)}\nDeposit: ${money(deposit)}`).then(()=>toast('Quote copied.','good'));toast(old>=0?'Quote updated.':'Quote created and saved.','good');
  });
  document.querySelectorAll('[data-action="edit-quick-quote"]').forEach(b=>b.onclick=()=>{const q=(currentShop().quickQuotes||[]).find(x=>x.id===b.dataset.quote);if(!q)return;document.getElementById('qVoice').value=q.description;document.getElementById('qEditId').value=q.id;window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>document.querySelector('[data-action="voice-quote"]')?.click(),350);});
  document.querySelectorAll('[data-action="copy-quick-quote"]').forEach(b=>b.onclick=()=>{const q=(currentShop().quickQuotes||[]).find(x=>x.id===b.dataset.quote);if(q)navigator.clipboard?.writeText(`${q.description}\nTotal: ${money(q.total)}\nDeposit: ${money(q.deposit)}`).then(()=>toast('Quote copied.','good'));});

  document.querySelectorAll('[data-action="tech-profile"]').forEach(b=>b.onclick=()=>openTechProfile(b.dataset.user));
  document.querySelector('[data-action="choose-tech-photo"]')?.addEventListener('click',()=>document.getElementById('techPhotoFile')?.click());
  document.getElementById('techPhotoFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024)return toast('Choose a picture smaller than 5 MB.','bad');const reader=new FileReader();reader.onload=()=>{document.getElementById('techPhotoData').value=reader.result;const preview=document.getElementById('techPhotoPreview');if(preview?.tagName==='IMG')preview.src=reader.result;else if(preview)preview.outerHTML=`<img id="techPhotoPreview" src="${reader.result}" alt="Technician profile preview">`;};reader.readAsDataURL(file);});
  document.getElementById('techProfileForm')?.addEventListener('submit',e=>{e.preventDefault();const s=currentShop(),u=s.users.find(x=>x.id===e.currentTarget.dataset.user);if(!u)return;const d=Object.fromEntries(new FormData(e.currentTarget)),self=u.id===db.session.userId,canEdit=self||roleCan('owner','manager'),canManage=roleCan('owner','manager');if(!canEdit)return;u.name=d.name.trim()||u.name;u.phone=d.phone.trim();u.specialties=d.specialties.trim();u.certifications=d.certifications.trim();u.bio=d.bio.trim();u.photo=document.getElementById('techPhotoData')?.value||u.photo||'';if(canManage){u.email=d.email.trim()||u.email;u.role=d.role||u.role;}save();document.querySelector('.modal-backdrop')?.remove();toast('Technician profile saved.','good');team();});
  document.getElementById('teamForm')?.addEventListener('submit',e=>{e.preventDefault();const s=currentShop();if(s.users.filter(u=>u.active).length>=plans[s.plan].seats)return toast('No open seats on this plan.','bad');const d=Object.fromEntries(new FormData(e.currentTarget));const link=staffInviteUrl(randomToken());const result=document.getElementById('inviteResult');if(result)result.innerHTML=`Invite created for <b>${esc(d.name)}</b>. <button class="btn btn-soft" type="button" data-action="copy-text" data-copy="${esc(link)}">${ic('link')} Copy Invite Link</button><p class="small muted">${esc(link)}</p>`;toast('Invite link created. Email/SMS will send after provider keys are connected.','good');});
  document.querySelectorAll('[data-action="toggle-user"]').forEach(b=>b.onclick=()=>{const s=currentShop(),u=s.users.find(x=>x.id===b.dataset.user);u.active=!u.active;save();team();});
  document.querySelectorAll('[data-action="reset-tech-password"]').forEach(b=>b.onclick=()=>{const s=currentShop(),u=s.users.find(x=>x.id===b.dataset.user);modal('Reset Technician Password',`<form id="resetPassForm" data-user="${u.id}"><p class="small muted">Prototype reset. Production version will use a secure password-reset link.</p><div class="field"><label>New Temporary Password</label><input name="password" type="password" minlength="8" required></div><button class="btn btn-primary">Save Temporary Password</button></form>`);});
  document.getElementById('resetPassForm')?.addEventListener('submit',e=>{e.preventDefault();const u=currentShop().users.find(x=>x.id===e.currentTarget.dataset.user);u.password=new FormData(e.currentTarget).get('password');save();document.querySelector('.modal-backdrop')?.remove();toast('Temporary password updated.','good');});

  document.getElementById('settingsForm')?.addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget)),s=currentShop();s.name=d.name.trim()||s.name;s.phone=d.phone.trim();s.email=d.email.trim();s.slug=slugify(d.slug)||s.slug;s.settings={...s.settings,laborRate:+d.laborRate||0,taxRate:+d.taxRate||0,partsMarkup:+d.partsMarkup||0,travelFee:+d.travelFee||0,freeRadius:+d.freeRadius||0,depositPercent:+d.depositPercent||0};save();toast('Shop settings saved.','good');settings();});
  document.getElementById('businessTypesForm')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget),s=currentShop(),specialties=fd.getAll('specialties');if(!specialties.length)return toast('Choose at least one business specialty.','bad');s.specialties=specialties;s.modules=fd.getAll('modules');s.customSpecialty=(fd.get('customSpecialty')||'').trim();s.assetLabel=fd.get('assetLabel')||'Vehicle / Equipment';save();toast('Business types updated. Existing records were kept.','good');settings();});
  document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>{const s=currentShop();s.plan=b.dataset.plan;s.subscriptionStatus='active';save();toast(`${plans[s.plan].name} selected for prototype. Production will open Stripe checkout.`, 'good');billing();});

  document.querySelectorAll('[data-admin]').forEach(b=>b.onclick=()=>{const s=db.shops[b.dataset.shop];if(!s)return;if(b.dataset.admin==='open'&&platformCan('shops_open')){logAdmin('Opened shop workspace',s.id);const pu=platformUser();const owner=s.users.find(x=>x.role==='owner')||s.users[0];db.session={role:'shop',shopId:s.id,userId:owner.id,supportMode:true,platformReturn:{role:pu.role==='platform_owner'?'platform_owner':'platform_admin',adminId:pu.id}};save();return dashboard();}if(b.dataset.admin==='extend'&&platformCan('trial_extend')){s.trialEnds=new Date(Math.max(Date.now(),new Date(s.trialEnds).getTime())+30*86400000).toISOString();if(s.subscriptionStatus==='suspended')s.subscriptionStatus='trialing';logAdmin('Extended trial 30 days',s.id);toast('Trial extended 30 days.','good');platformAdmin();}if(b.dataset.admin==='comp'&&platformCan('comp')){s.comped=!s.comped;s.subscriptionStatus=s.comped?'active':'trialing';logAdmin(s.comped?'Comped shop account':'Removed comp',s.id);platformAdmin();}if(b.dataset.admin==='suspend'&&platformCan('suspend')){s.subscriptionStatus=s.subscriptionStatus==='suspended'?'trialing':'suspended';logAdmin(s.subscriptionStatus==='suspended'?'Suspended shop':'Reactivated shop',s.id);platformAdmin();}});
  document.getElementById('platformAdminForm')?.addEventListener('submit',e=>{e.preventDefault();if(!platformCan('admins_manage'))return;const d=Object.fromEntries(new FormData(e.currentTarget));if([db.platformOwner,...(db.platformAdmins||[])].some(a=>a.email.toLowerCase()===d.email.toLowerCase()))return toast('That admin email is already in use.','bad');db.platformAdmins=db.platformAdmins||[];db.platformAdmins.push({id:uid('adm'),name:d.name,email:d.email,password:d.password,role:d.role,active:true});logAdmin('Created platform admin',null,`${d.name} — ${platformRoleLabels[d.role]}`);platformAdmin();});
  document.querySelectorAll('[data-platform-user-toggle]').forEach(b=>b.onclick=()=>{if(!platformCan('admins_manage'))return;const a=(db.platformAdmins||[]).find(x=>x.id===b.dataset.platformUserToggle);if(!a)return;a.active=!a.active;logAdmin(a.active?'Enabled platform admin':'Disabled platform admin',null,a.email);platformAdmin();});

  document.querySelectorAll('[data-action="add-vehicle"]').forEach(b=>b.onclick=()=>addVehicle(b.dataset.customer));
  document.querySelectorAll('[data-action="customer-history"]').forEach(b=>b.onclick=()=>{const s=currentShop(),c=s.customers.find(x=>x.id===b.dataset.customer),js=s.jobs.filter(j=>j.customerId===c.id);modal('Vehicle Timeline',`<h3>${esc(c.name)}</h3><div class="list">${js.map(j=>`<div class="list-item"><div class="list-icon">${ic('car')}</div><div class="list-main"><b>${esc(vehicleText(j.vehicle))} — ${esc(j.status)}</b><p>${new Date(j.createdAt).toLocaleString()}<br>${esc(j.complaint)}</p></div></div>`).join('')||'<p class="muted">No job history.</p>'}</div>`);});
  document.getElementById('addVehicleForm')?.addEventListener('submit',e=>{e.preventDefault();const s=currentShop(),c=s.customers.find(x=>x.id===e.currentTarget.dataset.customer),d=Object.fromEntries(new FormData(e.currentTarget));c.vehicles.push({id:uid('veh'),year:d.year,make:d.make,model:d.model,engine:d.engine,vin:d.vin,trim:'',drive:'',plate:'',mileage:''});save();document.querySelector('.modal-backdrop')?.remove();toast('Vehicle added to returning customer.','good');customers();});

  document.querySelectorAll('[data-action="prepare-carfax"]').forEach(b=>b.onclick=()=>{const j=jobById(b.dataset.job);j.carfax={status:'Ready',preparedAt:nowISO(),record:{vin:j.vehicle.vin,mileage:j.vehicle.mileage,date:j.completedAt||nowISO(),services:j.findings||j.complaint,shop:currentShop().name}};save();toast('Service record prepared. Not submitted to CARFAX.','good');carfax();});
  document.querySelector('[data-action="export-json"]')?.addEventListener('click',()=>{const s=currentShop(),blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${s.slug}-mobile-mechanic-ai-export.json`;a.click();URL.revokeObjectURL(a.href);});
  document.querySelector('[data-action="save-ppi"]')?.addEventListener('click',()=>toast('PPI draft saved in prototype workflow.','good'));
  document.querySelector('[data-action="clock-in"]')?.addEventListener('click',()=>{const s=currentShop(),u=currentUser();s.timeEntries=Array.isArray(s.timeEntries)?s.timeEntries:[];if(!s.timeEntries.some(x=>x.userId===u.id&&!x.clockOut))s.timeEntries.push({id:uid('time'),userId:u.id,clockIn:nowISO(),clockOut:null});save();timeClock();toast('Clocked in.','good');});
  document.querySelector('[data-action="clock-out"]')?.addEventListener('click',()=>{const s=currentShop(),u=currentUser(),entry=(s.timeEntries||[]).find(x=>x.userId===u.id&&!x.clockOut);if(entry)entry.clockOut=nowISO();save();timeClock();toast('Clocked out.','good');});
  document.querySelectorAll('[data-action="not-connected"]').forEach(b=>b.onclick=()=>toast('This secure API is not connected in the static prototype.',''));
  document.querySelector('[data-action="close-modal"]')?.addEventListener('click',closeModal);
  document.querySelector('[data-action="return-admin"]')?.addEventListener('click',()=>{const r=db.session?.platformReturn;if(!r)return;db.session={role:r.role,adminId:r.adminId};save();location.hash='#admin';platformAdmin();});
  document.querySelectorAll('[data-action="logout"]').forEach(b=>b.onclick=()=>login());
  document.querySelector('[data-action="toggle-menu"]')?.addEventListener('click',()=>{
    document.body.classList.add('drawer-open');
    document.querySelector('.mobile-drawer')?.setAttribute('aria-hidden','false');
    document.querySelector('.drawer-backdrop')?.setAttribute('aria-hidden','false');
    document.querySelector('[data-action="toggle-menu"]')?.setAttribute('aria-expanded','true');
  });
  document.querySelectorAll('[data-action="close-menu"]').forEach(b=>b.addEventListener('click',()=>{
    document.body.classList.remove('drawer-open');
    document.querySelector('.mobile-drawer')?.setAttribute('aria-hidden','true');
    document.querySelector('.drawer-backdrop')?.setAttribute('aria-hidden','true');
    document.querySelector('[data-action="toggle-menu"]')?.setAttribute('aria-expanded','false');
  }));
}

// Route and job navigation use delegation so controls injected after a render
// (pricing, integrations, admin helpers, etc.) work without another bind pass.
document.addEventListener('click',e=>{
  const route=e.target.closest?.('[data-route]');
  if(route){
    e.preventDefault();
    go(route.dataset.route);
    return;
  }
  const job=e.target.closest?.('[data-open-job]');
  if(job && !e.target.closest?.('button,a,input,select,textarea')){
    e.preventDefault();
    workup(job.dataset.openJob);
  }
});
document.addEventListener('keydown',e=>{
  const job=e.target.closest?.('[data-open-job]');
  if(job && (e.key==='Enter'||e.key===' ')){
    e.preventDefault();
    workup(job.dataset.openJob);
  }
});

function setupSpeech(selector,targetId){
  const b=document.querySelector(selector);if(!b)return;b.onclick=async()=>{const el=document.getElementById(targetId),SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){el?.focus();return toast('Browser voice is unavailable. Tap the microphone on your Android keyboard to dictate here.','bad');}try{if(navigator.mediaDevices?.getUserMedia){const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());}}catch(err){el?.focus();const blocked=err?.name==='NotAllowedError'||err?.name==='SecurityError';return toast(blocked?'Microphone permission was denied. Open this site’s permissions in Chrome and set Microphone to Allow.':'The phone microphone could not be opened. Close other apps using it and try again.','bad');}const r=new SR();let heard=false;r.lang='en-US';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;b.classList.add('listening');r.onresult=e=>{let final='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)final+=t;else interim+=t;}if(final.trim()){heard=true;el.value=(el.value?el.value+' ':'')+final.trim();el.dispatchEvent(new Event('input',{bubbles:true}));toast('Voice added.','good');}else if(interim.trim())toast(`Listening… ${interim.trim()}`);};r.onerror=e=>{b.classList.remove('listening');const messages={'not-allowed':'Microphone permission is blocked. Allow microphone access for this site, then try again.','service-not-allowed':'Android speech service is blocked. Enable Google voice typing or use the keyboard microphone.','no-speech':'I did not hear anything. Move closer and tap the microphone again.','audio-capture':'The phone microphone is unavailable or another app is using it.','network':'Android voice transcription could not reach its speech service. Check your connection or use the keyboard microphone.','aborted':'Voice input was stopped.'};el?.focus();toast(messages[e.error]||`Voice stopped (${e.error||'unknown'}). Use the Android keyboard microphone if it continues.`,'bad');};r.onend=()=>{b.classList.remove('listening');if(!heard)el?.focus();};try{r.start();toast('Listening… speak now.');}catch{b.classList.remove('listening');el?.focus();toast('Could not start voice. Tap the microphone on your Android keyboard.','bad');}};
}

function render(route=hashRoute()){
  if((route==='login'||route==='signup') && db.session?.role==='shop' && currentShop()){
    location.hash='#dashboard';
    return dashboard();
  }
  if(route==='login')return login();if(route==='signup')return signup();if(route==='admin'){if(db.session?.role==='platform_owner'||db.session?.role==='platform_admin')return platformAdmin();return login();}
  if(db.session?.role!=='shop'||!currentShop())return login();
  if(['billing','settings','reports','export'].includes(route)&&!canViewShopFinancials())return more();
  const routes={setup,dashboard,'new-intake':newIntake,'send-intake':sendIntake,customers,jobs,findings,'ai-second':aiSecond,quote,inspection,team,'time-clock':timeClock,billing,settings,more,calendar,reports,parts,fleet,roadside,warranty,templates,training,carfax,'service-info':serviceInfo,export:exportData};
  (routes[route]||dashboard)();
}

// Public customer routes take precedence over login/session.
const qs=new URLSearchParams(location.search);
const intakeSlug=pathIntakeSlug()||qs.get('intake');
if(intakeSlug){
  const s=Object.values(db.shops).find(x=>x.slug===intakeSlug);
  if(s) publicIntake(s); else publicMessage('Shop intake link not found','Ask the mechanic/shop to send a new intake link.');
} else if(qs.get('estimate')){
  try{const data=JSON.parse(decodeURIComponent(escape(atob(qs.get('estimate')))));estimatePage(data);}catch{publicMessage('Estimate link not found','Ask the shop to send a new estimate link.');}
} else {
  if(!location.hash) location.hash=(db.session?.role==='platform_owner'||db.session?.role==='platform_admin')?'#admin':db.session?.role==='shop'?'#dashboard':'#login';
  render();
}
window.addEventListener('hashchange',()=>{if(!qs.get('intake')&&!qs.get('estimate'))render(hashRoute());});

})();
