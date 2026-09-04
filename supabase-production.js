(() => {
'use strict';

const SUPABASE_URL = 'https://rapcejqlydedceegbcrs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w8kcE-A3iHqL9YHr_MiTNQ_WtkWaNJx';
const DBKEY = 'mobile_mechanic_ai_approved_v7';
const TERMS_VERSION = '2026-08-v1';
const createClient = window.supabase?.createClient;

if (!createClient) {
  console.error('Supabase client library did not load.');
  window.MobileMechanicBootstrap = Promise.resolve();
  return;
}

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
window.MobileMechanicSupabase = sb;

function placeholderShop(){
  return {
    id:'__production__', slug:'__production__', name:'', phone:'', email:'', plan:'shop',
    trialStarted:new Date().toISOString(), trialEnds:new Date(Date.now()+86400000).toISOString(),
    subscriptionStatus:'trialing', comped:false, setupComplete:true, logo:null,
    theme:{accent:'#ef2a31',background:'dark',style:'vibrant'},
    settings:{laborRate:75,taxRate:0,partsMarkup:25,travelFee:0,freeRadius:10,depositPercent:60},
    terms:null, users:[], customers:[], jobs:[], inspections:[], warranties:[], declined:[], receipts:[], fleet:[]
  };
}
function blankCache(){
  return {
    platformOwner:{id:'disabled',name:'Production Admin',email:'disabled@invalid.local',password:'disabled',role:'platform_owner',active:false},
    platformAdmins:[], adminActivity:[], session:null,
    shops:{__production__:placeholderShop()}, publicApprovals:[]
  };
}
function writeCache(value){ localStorage.setItem(DBKEY, JSON.stringify(value)); }
function readCache(){ try{return JSON.parse(localStorage.getItem(DBKEY)) || blankCache();}catch{return blankCache();} }
function slugify(v){ return String(v||'shop').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42)||'shop'; }
function shopId(){ return `shp_${crypto.randomUUID().replace(/-/g,'').slice(0,12)}`; }
function planToDb(v){ return v==='pro' ? 'pro_fleet' : (['solo','shop'].includes(v)?v:'shop'); }
function planFromDb(v){ return v==='pro_fleet' ? 'pro' : (['solo','shop'].includes(v)?v:'shop'); }
function roleFromDb(v){ return v==='shop_owner' ? 'owner' : v; }
function statusToUi(v){
  return ({new:'AI Pre-Workup',ai_workup:'AI Pre-Workup',diagnosing:'Diagnosis / Findings',estimate_sent:'Awaiting Approval',authorized:'Approved / Ready for Work',repairing:'In Progress',invoiced:'Invoiced',paid:'Paid',completed:'Completed',declined:'Customer Declined',warranty:'Warranty',comeback:'Comeback'})[v] || 'AI Pre-Workup';
}
function currentShopId(){ return readCache().session?.shopId || null; }
function currentJobId(){ return readCache().session?.activeJobId || null; }
function showStatus(message,type=''){
  document.querySelector('.supabase-status')?.remove();
  const d=document.createElement('div'); d.className=`toast supabase-status ${type}`; d.textContent=message; document.body.appendChild(d);
  setTimeout(()=>d.remove(),4200);
}
function logoFallback(){
  return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#0b0d10"/><path d="M29 75l18-18 12 12-18 18z" fill="#ef2a31"/><path d="M55 61c8 5 18 4 25-3 6-6 8-15 5-23l-12 12-10-10 12-12c-8-3-17-1-23 5-7 7-8 17-3 25z" fill="#f4f6f8"/><text x="60" y="105" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#f4f6f8">MM AI</text></svg>')}`;
}
function cleanPrototypeUi(){
  document.querySelectorAll('.demo-box').forEach(x=>x.remove());
  document.querySelectorAll('img[src*="assets/mobile-mechanic-ai-logo.png"]').forEach(img=>{ if(!img.dataset.fallback){img.dataset.fallback='1';img.src=logoFallback();} });
  document.querySelectorAll('p.small.muted').forEach(p=>{
    if(/Production login will be moved|prototype-only|static prototype/i.test(p.textContent||'')) p.textContent='Secure account login is powered by Supabase Auth.';
  });
}
new MutationObserver(cleanPrototypeUi).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('error',e=>{const t=e.target;if(t?.tagName==='IMG'&&/mobile-mechanic-ai-logo\.png/.test(t.src||''))t.src=logoFallback();},true);

function publicShop(row){
  return {
    id:row.shop_id, slug:row.slug, name:row.name, phone:row.business_phone||'', email:'', plan:'shop',
    trialStarted:new Date().toISOString(), trialEnds:new Date(Date.now()+60*86400000).toISOString(),
    subscriptionStatus:'active', comped:false, setupComplete:true, logo:row.logo_url||null,
    theme:{accent:'#ef2a31',background:'dark',style:'vibrant'},
    settings:{laborRate:75,taxRate:0,partsMarkup:25,travelFee:0,freeRadius:10,depositPercent:60},
    terms:null, users:[], customers:[], jobs:[], inspections:[], warranties:[], declined:[], receipts:[], fleet:[]
  };
}

async function createInitialShop(user,meta={}){
  const name=String(meta.shop_name||meta.shopName||'').trim();
  if(!name) return null;
  const id=shopId();
  const base=slugify(name); let slug=base;
  let inserted=false;
  for(let n=0;n<4;n++){
    const {error}=await sb.from('shops').insert({
      shop_id:id, slug, name, owner_user_id:user.id,
      business_phone:meta.business_phone||meta.phone||null,
      plan:planToDb(meta.selected_plan||meta.plan||'shop'),
      billing_status:'trialing', setup_complete:false
    });
    if(!error){inserted=true;break;}
    if(error.code==='23505'){slug=`${base}-${Math.floor(1000+Math.random()*9000)}`;continue;}
    throw error;
  }
  if(!inserted) throw new Error('Could not create a unique shop account.');
  const {error:memberError}=await sb.from('shop_members').insert({
    shop_id:id,user_id:user.id,role:'shop_owner',status:'active',permissions:{},joined_at:new Date().toISOString()
  });
  if(memberError) throw memberError;
  return id;
}

async function loadWorkspace(user, allowCreate=true){
  let {data:memberships,error:memberError}=await sb.from('shop_members').select('shop_id,role,status,user_id').eq('user_id',user.id).eq('status','active').limit(1);
  if(memberError) throw memberError;
  if(!memberships?.length && allowCreate && user.user_metadata?.shop_name){
    await createInitialShop(user,user.user_metadata);
    return loadWorkspace(user,false);
  }
  if(!memberships?.length){ writeCache(blankCache()); return null; }
  const membership=memberships[0], sid=membership.shop_id;
  const [shopRes,customersRes,vehiclesRes,jobsRes,teamRes,addonCatalogRes,shopAddonsRes]=await Promise.all([
    sb.from('shops').select('*').eq('shop_id',sid).single(),
    sb.from('customers').select('*').eq('shop_id',sid).order('created_at',{ascending:false}),
    sb.from('vehicles').select('*').eq('shop_id',sid).order('created_at',{ascending:false}),
    sb.rpc('get_my_shop_jobs'),
    sb.from('shop_members').select('shop_id,user_id,role,status').eq('shop_id',sid),
    sb.from('addon_catalog').select('code,name,description,monthly_price,quantity,unit_label,available_on_plans').eq('active',true).order('sort_order'),
    sb.from('shop_addons').select('addon_code,status').eq('shop_id',sid).eq('status','active')
  ]);
  for(const r of [shopRes,customersRes,vehiclesRes,jobsRes,teamRes,addonCatalogRes,shopAddonsRes]) if(r.error) throw r.error;
  const shop=shopRes.data, vehicles=vehiclesRes.data||[], customers=customersRes.data||[], jobs=jobsRes.data||[];
  const vehicleMap=new Map(vehicles.map(v=>[v.id,v]));
  const customerMap=new Map(customers.map(c=>[c.id,c]));
  const uiCustomers=customers.map(c=>({
    id:c.id,name:c.name,phone:c.phone||'',email:c.email||'',address:c.address||'',
    vehicles:vehicles.filter(v=>v.customer_id===c.id).map(v=>({id:v.id,year:v.year||'',make:v.make||'',model:v.model||'',trim:v.submodel||'',engine:v.engine||'',drive:v.drivetrain||'',vin:v.vin||'',plate:v.license_plate||'',mileage:v.mileage||''}))
  }));
  const uiJobs=jobs.map(j=>{
    const c=customerMap.get(j.customer_id)||{},v=vehicleMap.get(j.vehicle_id)||{};
    return {
      id:j.id,customerId:j.customer_id,customerName:c.name||'Customer',phone:c.phone||'',email:c.email||'',
      vehicle:{id:v.id,year:v.year||'',make:v.make||'',model:v.model||'',trim:v.submodel||'',engine:v.engine||'',drive:v.drivetrain||'',vin:v.vin||'',plate:v.license_plate||'',mileage:v.mileage||''},
      complaint:j.customer_states||'',requestType:'Repair / Diagnostic',availability:j.availability||'',
      location:j.current_location?.raw||'',createdAt:j.created_at,status:statusToUi(j.status),assignedTo:j.assigned_user_id||null,
      scheduledStart:j.scheduled_start_at||null,scheduledEnd:j.scheduled_end_at||null,estimatedLaborHours:Number(j.estimated_labor_hours||1),travelMinutes:Number(j.travel_minutes||0),bufferMinutes:Number(j.buffer_minutes??15),scheduleNotes:j.schedule_notes||'',
      findings:j.findings||'',codes:j.codes||'',photos:[],estimate:j.estimate||null,approval:j.approval||null,
      completedAt:j.completed_at||null,carfax:{status:j.carfax_status||'Not Connected'}
    };
  });
  const currentName=user.user_metadata?.full_name||user.email?.split('@')[0]||'Technician';
  const uiTeam=(teamRes.data||[]).map(m=>({
    id:m.user_id,name:m.user_id===user.id?currentName:'Shop Team Member',email:m.user_id===user.id?(user.email||''):'',role:roleFromDb(m.role),active:m.status==='active'
  }));
  const s={
    id:shop.shop_id,slug:shop.slug,name:shop.name,ownerName:currentName,phone:shop.business_phone||'',email:user.email||'',
    plan:planFromDb(shop.plan),trialStarted:shop.trial_started_at,trialEnds:shop.trial_expires_at,
    subscriptionStatus:shop.billing_status==='comped'?'active':shop.billing_status,comped:shop.billing_status==='comped',
    setupComplete:!!shop.setup_complete,logo:shop.logo_url||null,
    theme:{accent:shop.accent_color||'#ef2a31',background:'dark',style:'vibrant'},
    settings:{laborRate:Number(shop.labor_rate||75),taxRate:Number(shop.tax_rate||0),partsMarkup:Number(shop.parts_markup||25),travelFee:Number(shop.travel_fee||0),freeRadius:Number(shop.free_radius_miles||10),depositPercent:Number(shop.deposit_percent||60)},
    terms:shop.terms_version?{version:shop.terms_version,acceptedAt:shop.terms_accepted_at,userId:user.id}:null,
    users:uiTeam.length?uiTeam:[{id:user.id,name:currentName,email:user.email||'',role:roleFromDb(membership.role),active:true}],
    customers:uiCustomers,jobs:uiJobs,inspections:[],warranties:[],declined:[],receipts:[],fleet:[],addonCatalog:addonCatalogRes.data||[],addons:(shopAddonsRes.data||[]).map(a=>a.addon_code)
  };
  const cache=blankCache(); cache.shops={[s.id]:s}; cache.session={role:'shop',shopId:s.id,userId:user.id,activeJobId:uiJobs[0]?.id||null};
  writeCache(cache); document.documentElement.style.setProperty('--red',s.theme.accent);
  return s;
}

async function refreshWorkspace(route='#dashboard',activeJobId=null){
  const {data:{session}}=await sb.auth.getSession(); if(!session?.user)return;
  await loadWorkspace(session.user);
  if(activeJobId){const cache=readCache();if(cache.session){cache.session.activeJobId=activeJobId;writeCache(cache);}}
  location.hash=route; location.reload();
}

async function submitPublicIntake(form,d){
  const vehicle={year:d.year?Number(d.year):null,make:d.make||null,model:d.model||null,submodel:d.trim||null,engine:d.engine||null,drivetrain:d.drive||null,vin:(d.vin||'').trim().toUpperCase()||null,license_plate:(d.plate||'').trim()||null,mileage:d.mileage?Number(d.mileage):null,request_type:d.requestType||'Repair / Diagnostic'};
  const {error}=await sb.rpc('submit_public_intake',{
    p_shop_id:form.dataset.shop,p_customer_name:d.customerName,p_phone:d.phone||null,p_email:d.email||null,
    p_address:d.location||null,p_availability:d.availability||null,p_current_location:d.location?{raw:d.location}:null,
    p_vehicle:vehicle,p_customer_states:d.complaint||''
  });
  if(error) throw error;
  const shopName=document.querySelector('.customer-shop b')?.textContent||'the shop';
  document.querySelector('.customer-body').innerHTML=`<div class="customer-card" style="text-align:center"><h2>✓ Request sent to ${shopName}</h2><p>Your request was received.</p><p class="muted small">The shop will review it and contact you with the next step.</p></div>`;
  document.querySelector('.customer-footer')?.remove();
}

async function submitShopIntake(form,d){
  const sid=form.dataset.shop;
  let customer=null;
  if(d.phone){const r=await sb.from('customers').select('*').eq('shop_id',sid).eq('phone',d.phone).limit(1).maybeSingle();if(r.error)throw r.error;customer=r.data;}
  if(!customer&&d.email){const r=await sb.from('customers').select('*').eq('shop_id',sid).eq('email',d.email).limit(1).maybeSingle();if(r.error)throw r.error;customer=r.data;}
  if(!customer){
    const r=await sb.from('customers').insert({shop_id:sid,name:d.customerName,phone:d.phone||null,email:d.email||null,address:d.location||null}).select('id').single();
    if(r.error)throw r.error; customer={id:r.data.id};
  }
  let vehicle=null; const vin=(d.vin||'').trim().toUpperCase();
  if(vin){const r=await sb.from('vehicles').select('*').eq('shop_id',sid).eq('vin',vin).limit(1).maybeSingle();if(r.error)throw r.error;vehicle=r.data;}
  if(!vehicle){
    const r=await sb.from('vehicles').insert({shop_id:sid,customer_id:customer.id,year:d.year?Number(d.year):null,make:d.make||null,model:d.model||null,submodel:d.trim||null,engine:d.engine||null,drivetrain:d.drive||null,vin:vin||null,license_plate:(d.plate||'').trim()||null,mileage:d.mileage?Number(d.mileage):null}).select('id').single();
    if(r.error)throw r.error; vehicle={id:r.data.id};
  }
  const r=await sb.from('jobs').insert({shop_id:sid,customer_id:customer.id,vehicle_id:vehicle.id,status:'ai_workup',customer_states:d.complaint||null,current_location:d.location?{raw:d.location}:null,availability:d.availability||null,priority:'normal',estimated_labor_hours:1,travel_minutes:0,buffer_minutes:15}).select('id').single();
  if(r.error)throw r.error;
  await refreshWorkspace('#jobs',r.data.id);
}

async function bootstrap(){
  const qs=new URLSearchParams(location.search);
  const parts=location.pathname.split('/').filter(Boolean);
  const intakeSlug=(parts[0]==='intake'&&parts[1]?decodeURIComponent(parts[1]):null)||qs.get('intake');
  if(intakeSlug){
    const {data,error}=await sb.from('shops').select('shop_id,slug,name,logo_url,business_phone,service_area').eq('slug',intakeSlug).maybeSingle();
    const cache=blankCache();
    if(!error&&data){const s=publicShop(data);cache.shops={[s.id]:s};}
    writeCache(cache); return;
  }
  const {data:{session},error}=await sb.auth.getSession();
  if(error){console.error(error);writeCache(blankCache());return;}
  if(session?.user){try{await loadWorkspace(session.user);}catch(err){console.error(err);writeCache(blankCache());}}
  else writeCache(blankCache());
}

// Capture secure auth and database writes before the prototype handlers can save browser-only records.
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]'); if(!el)return;
  const action=el.dataset.action;
  if(action==='login'){
    e.preventDefault();e.stopImmediatePropagation();
    const email=document.getElementById('loginEmail')?.value.trim(),password=document.getElementById('loginPassword')?.value||'';
    if(!email||!password)return showStatus('Enter your email and password.','bad');
    el.disabled=true;
    try{
      const {data,error}=await sb.auth.signInWithPassword({email,password}); if(error)throw error;
      await loadWorkspace(data.user);
      if(!currentShopId())throw new Error('This account is not connected to a shop yet.');
      location.hash='#dashboard';location.reload();
    }catch(err){el.disabled=false;showStatus(err.message||'Login failed.','bad');}
    return;
  }
  if(action==='logout'){
    e.preventDefault();e.stopImmediatePropagation();await sb.auth.signOut();writeCache(blankCache());location.hash='#login';location.reload();return;
  }
  if(action==='accept-all'){
    e.preventDefault();e.stopImmediatePropagation();
    const sid=currentShopId();if(!sid)return;
    try{
      const {error}=await sb.from('shops').update({name:document.getElementById('setupShopName')?.value.trim()||undefined,business_phone:document.getElementById('setupPhone')?.value.trim()||null,setup_complete:true,terms_version:TERMS_VERSION,terms_accepted_at:new Date().toISOString()}).eq('shop_id',sid);if(error)throw error;
      await refreshWorkspace('#dashboard');
    }catch(err){showStatus(err.message||'Could not save setup.','bad');}
    return;
  }
  if(action==='save-schedule'){
    e.preventDefault();e.stopImmediatePropagation();const jid=el.dataset.job;if(!jid)return;
    const startVal=document.getElementById('scheduleStart')?.value;if(!startVal)return showStatus('Pick a start time.','bad');
    const hours=Number(document.getElementById('scheduleHours')?.value||1),travel=Number(document.getElementById('scheduleTravel')?.value||0),buffer=Number(document.getElementById('scheduleBuffer')?.value||15);
    const start=new Date(startVal),end=new Date(start.getTime()+(Math.max(.25,hours)*60+travel+buffer)*60000);
    try{const {error}=await sb.from('jobs').update({scheduled_start_at:start.toISOString(),scheduled_end_at:end.toISOString(),estimated_labor_hours:hours,travel_minutes:travel,buffer_minutes:buffer,schedule_notes:document.getElementById('scheduleNotes')?.value||'',status:'scheduled'}).eq('id',jid);if(error)throw error;await refreshWorkspace('#calendar',jid);}catch(err){showStatus(err.message||'Could not save schedule.','bad');}
    return;
  }
  if(action==='toggle-addon'){
    e.preventDefault();e.stopImmediatePropagation();
    const cache=readCache(), sid=cache.session?.shopId, code=el.dataset.addon, s=cache.shops?.[sid];
    if(!sid||!code||!s)return showStatus('Open your shop before changing add-ons.','bad');
    const active=(s.addons||[]).includes(code);
    try{
      if(active){const {error}=await sb.from('shop_addons').update({status:'canceled',canceled_at:new Date().toISOString()}).eq('shop_id',sid).eq('addon_code',code);if(error)throw error;}
      else {const {error}=await sb.from('shop_addons').upsert({shop_id:sid,addon_code:code,status:'active',quantity:1,started_at:new Date().toISOString(),canceled_at:null},{onConflict:'shop_id,addon_code'});if(error)throw error;}
      showStatus(active?'Add-on removed.':'Add-on added as pending until Stripe is connected.','good');
      await refreshWorkspace('#billing');
    }catch(err){showStatus(err.message||'Could not update add-on.','bad');}
    return;
  }
  if(action==='save-findings'){
    e.preventDefault();e.stopImmediatePropagation();const jid=currentJobId();if(!jid)return;
    try{const {error}=await sb.from('jobs').update({findings:document.getElementById('findingText')?.value||'',codes:document.getElementById('codeInput')?.value||'',status:'diagnosing'}).eq('id',jid);if(error)throw error;await refreshWorkspace('#findings',jid);}catch(err){showStatus(err.message||'Could not save findings.','bad');}
    return;
  }
  if(action==='complete-job'){
    e.preventDefault();e.stopImmediatePropagation();const jid=el.dataset.job||currentJobId();if(!jid)return;
    try{const {error}=await sb.from('jobs').update({status:'completed',completed_at:new Date().toISOString(),carfax_status:'Ready'}).eq('id',jid);if(error)throw error;await refreshWorkspace('#jobs',jid);}catch(err){showStatus(err.message||'Could not complete job.','bad');}
    return;
  }
  if(action==='send-estimate'){
    e.preventDefault();e.stopImmediatePropagation();showStatus('Secure cross-device estimate approval is the next production module. The browser-only demo link is disabled.','');return;
  }
  if(el.hasAttribute('data-plan')){
    e.preventDefault();e.stopImmediatePropagation();showStatus('Stripe billing is not connected yet, so no subscription was charged or activated.','');return;
  }
},true);

document.addEventListener('submit',async e=>{
  const form=e.target;
  if(form.id==='teamForm'){
    e.preventDefault();e.stopImmediatePropagation();
    const d=Object.fromEntries(new FormData(form));
    const cache=readCache(), sid=cache.session?.shopId, userId=cache.session?.userId, shop=cache.shops?.[sid];
    if(!sid||!userId||!shop)return showStatus('Open your shop before inviting staff.','bad');
    const token=crypto.randomUUID()+'-'+Math.random().toString(36).slice(2);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const inviteLink=`${location.origin}/invite/${encodeURIComponent(token)}`;
    try{
      const {error}=await sb.from('staff_invites').insert({shop_id:sid,email:String(d.email||'').trim().toLowerCase(),full_name:d.name||null,role:d.role,token_hash:hash,invited_by:userId});
      if(error)throw error;
      await sb.from('outbound_messages').insert({shop_id:sid,template_id:'staff_invite_email',channel:'email',recipient:String(d.email||'').trim().toLowerCase(),subject:`You have been invited to ${shop.name}`,body:`${shop.name} invited you to join Mobile Mechanic AI as ${d.role}. Open this invite link: ${inviteLink}`,status:'queued',provider:'pending',created_by:userId});
      if(d.phone)await sb.from('outbound_messages').insert({shop_id:sid,template_id:'staff_invite_sms',channel:'sms',recipient:String(d.phone).trim(),body:`${shop.name} invited you to Mobile Mechanic AI as ${d.role}: ${inviteLink}`,status:'queued',provider:'pending',created_by:userId});
      const result=document.getElementById('inviteResult');
      if(result)result.innerHTML=`Invite created. <button class="btn btn-soft" type="button" data-action="copy-text" data-copy="${inviteLink}">Copy Invite Link</button><p class="small muted">${inviteLink}</p><p class="small muted">Email/SMS is queued and will send when provider keys are connected.</p>`;
      showStatus('Staff invite created.','good');
    }catch(err){showStatus(err.message||'Could not create invite.','bad');}
    return;
  }
  if(form.id==='signupForm'){
    e.preventDefault();e.stopImmediatePropagation();
    const d=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
    try{
      const {data,error}=await sb.auth.signUp({email:d.email,password:d.password,options:{emailRedirectTo:`${location.origin}${location.pathname}`,data:{full_name:d.ownerName,shop_name:d.shopName,business_phone:d.phone||'',selected_plan:d.plan||'shop'}}});
      if(error)throw error;
      if(data.session?.user){await createInitialShop(data.session.user,{shop_name:d.shopName,business_phone:d.phone,selected_plan:d.plan});await loadWorkspace(data.session.user,false);location.hash='#setup';location.reload();}
      else {showStatus('Account created. Check your email to confirm it, then return and log in.','good');if(button)button.disabled=false;}
    }catch(err){if(button)button.disabled=false;showStatus(err.message||'Could not create account.','bad');}
    return;
  }
  if(form.id==='intakeForm'){
    e.preventDefault();e.stopImmediatePropagation();const d=Object.fromEntries(new FormData(form)),button=document.querySelector('.customer-submit');if(button)button.disabled=true;
    try{if(form.dataset.public==='true')await submitPublicIntake(form,d);else await submitShopIntake(form,d);}catch(err){if(button)button.disabled=false;showStatus(err.message||'Could not submit intake.','bad');}
    return;
  }
  if(form.id==='settingsForm'){
    e.preventDefault();e.stopImmediatePropagation();const d=Object.fromEntries(new FormData(form)),sid=currentShopId();if(!sid)return;
    try{const {error}=await sb.from('shops').update({name:d.name?.trim()||undefined,business_phone:d.phone?.trim()||null,slug:slugify(d.slug),labor_rate:Number(d.laborRate||0),tax_rate:Number(d.taxRate||0),parts_markup:Number(d.partsMarkup||0),travel_fee:Number(d.travelFee||0),free_radius_miles:Number(d.freeRadius||0),deposit_percent:Number(d.depositPercent||0)}).eq('shop_id',sid);if(error)throw error;await refreshWorkspace('#settings');}catch(err){showStatus(err.message||'Could not save settings.','bad');}
    return;
  }
  if(form.id==='teamForm'||form.id==='resetPassForm'||form.id==='platformAdminForm'){
    e.preventDefault();e.stopImmediatePropagation();showStatus('Secure staff invitations/password management are not connected yet. No browser-only account was created.','');return;
  }
  if(form.id==='addVehicleForm'){
    e.preventDefault();e.stopImmediatePropagation();const d=Object.fromEntries(new FormData(form)),sid=currentShopId(),cid=form.dataset.customer;if(!sid||!cid)return;
    try{const vin=(d.vin||'').trim().toUpperCase();const {error}=await sb.from('vehicles').insert({shop_id:sid,customer_id:cid,year:d.year?Number(d.year):null,make:d.make||null,model:d.model||null,engine:d.engine||null,vin:vin||null});if(error)throw error;document.querySelector('.modal-backdrop')?.remove();await refreshWorkspace('#customers');}catch(err){showStatus(err.message||'Could not add vehicle.','bad');}
    return;
  }
},true);

// After the existing UI calculates an estimate locally, persist the estimate snapshot to the protected job row.
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action="save-estimate"]');if(!b)return;
  setTimeout(async()=>{
    try{const cache=readCache(),s=cache.shops?.[cache.session?.shopId],j=s?.jobs?.find(x=>x.id===b.dataset.job);if(!j?.estimate)return;const {error}=await sb.from('jobs').update({estimate:j.estimate}).eq('id',j.id);if(error)throw error;showStatus('Estimate saved to Supabase.','good');}catch(err){showStatus(err.message||'Could not sync estimate.','bad');}
  },0);
},false);

window.MobileMechanicTrackUsage=async(feature,metadata={})=>{try{const cache=readCache(),sid=cache.session?.shopId;if(!sid)return;await sb.from('feature_usage_events').insert({shop_id:sid,feature,metadata});}catch(err){console.warn('Usage tracking failed',err);}};
window.MobileMechanicBootstrap = bootstrap().catch(err=>{console.error('Supabase bootstrap failed',err);writeCache(blankCache());});

})();
