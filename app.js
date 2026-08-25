
const DEFAULT_STATE = {
  screen:'setup',
  intakeStep:1,
  setupAccepted:false,
  business:{name:"Mobile Mechanic AI",labor:75,tax:8.4,diag:75,service:0,shop:10.95,accent:"#d61f2c"},
  job:{
    customer:"",phone:"",email:"",address:"",latitude:null,longitude:null,
    year:"",make:"",model:"",trim:"",engine:"",drivetrain:"",transmission:"",mileage:"",vin:"",plate:"",
    serviceType:"Repair / Diagnosis",states:"",finding:"",
    fleetName:"",unitNumber:"",dotNumber:"",trailerType:"",towNeeded:false,towDestination:"",roadsideSafety:"",
    mediaCount:0,assessment:null,parts:[],labor:[],status:"New Intake",
    inspection:null,inspectionPhotos:0,
    approvalMethod:"",approved:false,paymentMethod:"",paid:false,documents:[]
  }
};
let state = loadState();
let deepLinkHandled=false;
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const app = $("#app");

const vehicleCatalog={"Ford":{"F-150":{"trims":["XL","XLT","Lariat","King Ranch","Platinum","Tremor","Raptor"],"engines":["2.7L EcoBoost V6","3.3L V6","3.5L EcoBoost V6","3.5L PowerBoost Hybrid V6","5.0L V8"]},"F-250":{"trims":["XL","XLT","Lariat","King Ranch","Platinum","Limited"],"engines":["6.2L V8","6.7L Power Stroke Diesel V8","7.3L V8"]},"F-350":{"trims":["XL","XLT","Lariat","King Ranch","Platinum","Limited"],"engines":["6.2L V8","6.7L Power Stroke Diesel V8","7.3L V8"]},"Ranger":{"trims":["XL","XLT","Lariat","Raptor"],"engines":["2.3L EcoBoost I4","2.7L EcoBoost V6","3.0L EcoBoost V6"]},"Explorer":{"trims":["Base","XLT","Limited","ST-Line","ST","Platinum"],"engines":["2.3L EcoBoost I4","3.0L EcoBoost V6"]},"Escape":{"trims":["S","SE","SEL","Titanium","Active","ST-Line","Platinum"],"engines":["1.5L EcoBoost I3","2.0L EcoBoost I4","2.5L Hybrid I4","2.5L Plug-in Hybrid I4"]},"Bronco":{"trims":["Base","Big Bend","Black Diamond","Outer Banks","Badlands","Wildtrak","Raptor"],"engines":["2.3L EcoBoost I4","2.7L EcoBoost V6","3.0L EcoBoost V6"]},"Transit":{"trims":["Cargo Van","Passenger Van","Crew Van"],"engines":["3.5L V6","3.5L EcoBoost V6"]}},"Chevrolet":{"Silverado 1500":{"trims":["WT","Custom","LT","RST","LTZ","High Country","ZR2"],"engines":["2.7L TurboMax I4","5.3L EcoTec3 V8","6.2L EcoTec3 V8","3.0L Duramax Diesel I6"]},"Silverado 2500HD":{"trims":["WT","Custom","LT","LTZ","High Country","ZR2"],"engines":["6.6L Gas V8","6.6L Duramax Diesel V8"]},"Colorado":{"trims":["WT","LT","Trail Boss","Z71","ZR2"],"engines":["2.5L I4","3.6L V6","2.8L Duramax Diesel I4","2.7L Turbo I4"]},"Tahoe":{"trims":["LS","LT","RST","Z71","Premier","High Country"],"engines":["5.3L V8","6.2L V8","3.0L Duramax Diesel I6"]},"Suburban":{"trims":["LS","LT","RST","Z71","Premier","High Country"],"engines":["5.3L V8","6.2L V8","3.0L Duramax Diesel I6"]},"Equinox":{"trims":["LS","LT","RS","Premier"],"engines":["1.5L Turbo I4","2.0L Turbo I4"]},"Traverse":{"trims":["LS","LT","RS","Premier","High Country","Z71"],"engines":["2.5L Turbo I4","3.6L V6"]}},"GMC":{"Sierra 1500":{"trims":["Pro","SLE","Elevation","SLT","AT4","Denali","AT4X","Denali Ultimate"],"engines":["2.7L TurboMax I4","5.3L V8","6.2L V8","3.0L Duramax Diesel I6"]},"Sierra 2500HD":{"trims":["Pro","SLE","SLT","AT4","Denali"],"engines":["6.6L Gas V8","6.6L Duramax Diesel V8"]},"Canyon":{"trims":["Elevation","AT4","Denali","AT4X"],"engines":["2.7L Turbo I4"]},"Yukon":{"trims":["SLE","SLT","AT4","Denali","Denali Ultimate"],"engines":["5.3L V8","6.2L V8","3.0L Duramax Diesel I6"]},"Terrain":{"trims":["SLE","SLT","AT4","Denali"],"engines":["1.5L Turbo I4","2.0L Turbo I4"]}},"Toyota":{"Tacoma":{"trims":["SR","SR5","TRD Sport","TRD Off Road","Limited","Trailhunter","TRD Pro"],"engines":["2.4L Turbo I4","2.4L i-FORCE MAX Hybrid I4","2.7L I4","3.5L V6","4.0L V6"]},"Tundra":{"trims":["SR","SR5","Limited","Platinum","1794 Edition","TRD Pro","Capstone"],"engines":["3.4L Twin-Turbo V6","3.4L i-FORCE MAX Hybrid V6","4.6L V8","5.7L V8"]},"4Runner":{"trims":["SR5","TRD Sport","TRD Off Road","Limited","Trailhunter","TRD Pro"],"engines":["2.4L Turbo I4","2.4L Hybrid I4","4.0L V6"]},"RAV4":{"trims":["LE","XLE","XLE Premium","Adventure","TRD Off Road","Limited","Hybrid","Prime"],"engines":["2.5L I4","2.5L Hybrid I4","2.5L Plug-in Hybrid I4"]},"Camry":{"trims":["LE","SE","XLE","XSE"],"engines":["2.5L I4","2.5L Hybrid I4","3.5L V6"]},"Corolla":{"trims":["L","LE","SE","XLE","XSE","Hybrid"],"engines":["1.8L I4","2.0L I4","1.8L Hybrid I4"]},"Highlander":{"trims":["L","LE","XLE","XSE","Limited","Platinum","Hybrid"],"engines":["2.4L Turbo I4","3.5L V6","2.5L Hybrid I4"]}},"Honda":{"Civic":{"trims":["LX","Sport","EX","Touring","Si","Type R"],"engines":["1.5L Turbo I4","2.0L I4","2.0L Turbo I4"]},"Accord":{"trims":["LX","Sport","EX","EX-L","Touring","Hybrid"],"engines":["1.5L Turbo I4","2.0L Turbo I4","2.0L Hybrid I4"]},"CR-V":{"trims":["LX","EX","EX-L","Sport","Sport-L","Sport Touring"],"engines":["1.5L Turbo I4","2.0L Hybrid I4"]},"Pilot":{"trims":["Sport","EX-L","TrailSport","Touring","Elite","Black Edition"],"engines":["3.5L V6"]},"Ridgeline":{"trims":["Sport","RTL","TrailSport","Black Edition"],"engines":["3.5L V6"]}},"Nissan":{"Frontier":{"trims":["S","SV","PRO-X","PRO-4X","SL"],"engines":["3.8L V6","4.0L V6"]},"Titan":{"trims":["S","SV","PRO-4X","Platinum Reserve"],"engines":["5.6L V8"]},"Altima":{"trims":["S","SV","SR","SL"],"engines":["2.5L I4","2.0L VC-Turbo I4"]},"Rogue":{"trims":["S","SV","SL","Platinum"],"engines":["1.5L VC-Turbo I3","2.5L I4"]},"Pathfinder":{"trims":["S","SV","SL","Rock Creek","Platinum"],"engines":["3.5L V6"]}},"Ram":{"1500":{"trims":["Tradesman","Big Horn","Laramie","Rebel","Limited Longhorn","Limited","TRX"],"engines":["3.6L Pentastar V6","3.0L Hurricane I6","5.7L HEMI V8","6.2L Supercharged V8"]},"2500":{"trims":["Tradesman","Big Horn","Laramie","Power Wagon","Limited Longhorn","Limited"],"engines":["6.4L HEMI V8","6.7L Cummins Diesel I6"]},"3500":{"trims":["Tradesman","Big Horn","Laramie","Limited Longhorn","Limited"],"engines":["6.4L HEMI V8","6.7L Cummins Diesel I6"]},"ProMaster":{"trims":["Cargo Van","Window Van"],"engines":["3.6L Pentastar V6"]}},"Jeep":{"Wrangler":{"trims":["Sport","Sport S","Willys","Sahara","Rubicon","High Altitude","Rubicon 392"],"engines":["2.0L Turbo I4","3.6L V6","3.0L EcoDiesel V6","6.4L V8","2.0L 4xe Plug-in Hybrid"]},"Grand Cherokee":{"trims":["Laredo","Altitude","Limited","Overland","Summit","Summit Reserve","Trailhawk"],"engines":["2.0L Turbo I4","3.6L V6","5.7L V8","2.0L 4xe Plug-in Hybrid"]},"Gladiator":{"trims":["Sport","Sport S","Willys","Mojave","Rubicon"],"engines":["3.6L V6","3.0L EcoDiesel V6"]},"Cherokee":{"trims":["Latitude","Latitude Plus","Limited","Trailhawk"],"engines":["2.0L Turbo I4","2.4L I4","3.2L V6"]}},"Hyundai":{"Elantra":{"trims":["SE","SEL","Limited","N Line","N"],"engines":["2.0L I4","1.6L Turbo I4","2.0L Turbo I4","1.6L Hybrid I4"]},"Sonata":{"trims":["SE","SEL","N Line","Limited"],"engines":["2.5L I4","2.5L Turbo I4","2.0L Hybrid I4"]},"Tucson":{"trims":["SE","SEL","XRT","Limited","Hybrid","Plug-in Hybrid"],"engines":["2.5L I4","1.6L Turbo Hybrid I4","1.6L Turbo Plug-in Hybrid I4"]},"Santa Fe":{"trims":["SE","SEL","XRT","Limited","Calligraphy","Hybrid"],"engines":["2.5L Turbo I4","1.6L Turbo Hybrid I4"]}},"Kia":{"Forte":{"trims":["LX","LXS","GT-Line","GT"],"engines":["2.0L I4","1.6L Turbo I4"]},"K5":{"trims":["LXS","GT-Line","EX","GT"],"engines":["1.6L Turbo I4","2.5L Turbo I4"]},"Sportage":{"trims":["LX","EX","SX","SX Prestige","X-Line","X-Pro","Hybrid","Plug-in Hybrid"],"engines":["2.5L I4","1.6L Turbo Hybrid I4","1.6L Turbo Plug-in Hybrid I4"]},"Sorento":{"trims":["LX","S","EX","SX","SX Prestige","X-Line","X-Pro","Hybrid","Plug-in Hybrid"],"engines":["2.5L I4","2.5L Turbo I4","1.6L Turbo Hybrid I4","1.6L Turbo Plug-in Hybrid I4"]},"Telluride":{"trims":["LX","S","EX","SX","SX Prestige","X-Line","X-Pro"],"engines":["3.8L V6"]}}};

const makes = ['Acura','Audi','BMW','Buick','Cadillac','Chevrolet','Chrysler','Dodge','Ford','GMC','Honda','Hyundai','Infiniti','Jeep','Kia','Lexus','Lincoln','Mazda','Mercedes-Benz','Mitsubishi','Nissan','Ram','Subaru','Tesla','Toyota','Volkswagen','Volvo','Other / Not Listed'];

function clone(x){return JSON.parse(JSON.stringify(x))}
function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem("mma_state")||"null");
    if(!s)return clone(DEFAULT_STATE);
    const merged=Object.assign(clone(DEFAULT_STATE),s,{business:Object.assign({},DEFAULT_STATE.business,s.business||{}),job:Object.assign({},DEFAULT_STATE.job,s.job||{})});
    if(!merged.setupAccepted)merged.screen="setup";
    return merged;
  }catch(e){return clone(DEFAULT_STATE)}
}
function saveState(){try{localStorage.setItem("mma_state",JSON.stringify(state))}catch(e){}}
function money(n){return "$"+Number(n||0).toFixed(2)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function notify(msg){const n=$("#notice");if(n){n.textContent=msg;n.classList.add("show");setTimeout(()=>n.classList.remove("show"),2600)}else alert(msg)}
function calc(){
  const parts=(state.job.parts||[]).reduce((a,x)=>a+(Number(x.q)||0)*(Number(x.p)||0),0);
  const labor=(state.job.labor||[]).reduce((a,x)=>a+(Number(x.h)||0)*(Number(x.r)||0),0);
  const fee=Number(state.business.service)||0, sub=parts+labor+fee, tax=sub*((Number(state.business.tax)||0)/100);
  return {parts,labor,fee,sub,tax,total:sub+tax};
}
function vehicleLabel(){
  return [state.job.year,state.job.make,state.job.model,state.job.trim].filter(Boolean).join(" ") || "Vehicle not entered";
}
function nav(){
  const items=[["dashboard","⌂","Home"],["jobs","🧰","Jobs"],["new","＋","New"],["history","🚗","History"],["settings","☰","More"]];
  return `<nav class="nav">${items.map(([k,i,l])=>`<button type="button" data-nav="${k}" class="${state.screen===k?"active":""} ${k==="new"?"plus":""}">${k==="new"?`<span>${i}</span>`:i}<div>${l}</div></button>`).join("")}</nav>`;
}
function progress(active){
  const names=["Intake","AI Workup","Findings","Quote","Approval","Invoice","Payment","Complete"];
  return `<div class="workflow">${names.map((x,i)=>`<span class="${i<active?"done":i===active?"current":""}">${i<active?"✓":i+1}<small>${x}</small></span>`).join("")}</div>`;
}
function shell(content,{title="Mobile Mechanic AI",customer=false,progressStep=null,hideNav=false}={}){
  document.body.classList.toggle("customer-mode",customer);
  app.innerHTML=`<div class="app ${customer?"customer-app":""}">
    <header class="topbar"><div class="brand"><div class="logo">🔧</div><div><b>${esc(title)}</b><small>${customer?"Service Request":"Mechanic Workspace"}</small></div></div><button type="button" class="iconbtn" id="homeTop" aria-label="Home">⌂</button></header>
    ${progressStep!==null?progress(progressStep):""}
    <main class="screen">${content}</main>
    ${hideNav?"":nav()}
    <div id="notice" class="notice" aria-live="polite"></div>
  </div>`;
  $("#homeTop").onclick=()=>go("dashboard");
  $$("[data-nav]").forEach(b=>b.onclick=()=>go(b.dataset.nav));
  $$("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}
function go(screen){state.screen=screen;saveState();render();window.scrollTo({top:0,behavior:"smooth"})}

function setup(){
  state.screen="setup";
  shell(`<section class="setup-brand"><div class="ai-mark">AI</div><div><h1>MOBILE<br><span>MECHANIC</span> AI</h1><p>POWERED BY AI. PROTECTED BY YOU.</p></div></section>
  <div class="card"><h2>Mechanic Protections</h2><p class="sub">Review and accept these protections before using the workflow.</p>
  ${["I understand AI is a tool and I do not rely solely on it for diagnosis or repair.","I understand all labor hours are estimates and final discretion is mine.","I understand customer approval is required before work begins.","I agree to protect customer data in accordance with the Privacy Policy.","I agree to the Terms of Service and will use this app responsibly."].map(x=>`<label class="protection"><input type="checkbox" class="setup-check" ${state.setupAccepted?"checked":""}><span><b>✓</b>${x}</span></label>`).join("")}
  <button class="btn primary row" id="acceptSetup">I AGREE & CONTINUE</button></div>
  <div class="legal-links"><button>Terms of Service</button><button>Privacy Policy</button><button>Copyright</button></div>`,{title:"Setup & Agreements",hideNav:true});
  $("#acceptSetup").onclick=()=>{if($$(".setup-check").some(x=>!x.checked))return notify("Check every protection before continuing.");state.setupAccepted=true;state.screen="dashboard";saveState();render()};
}

function dashboard(){
  state.screen="dashboard";
  const hasIntake=!!state.job.states;
  shell(`<section class="hero dark"><p class="eyebrow">Mobile Mechanic AI</p><h1>Run the job, not the paperwork.</h1><p>Customer intake, AI pre-workup, findings, estimate, approval, payment and history in one test workflow.</p></section>
  <div class="kpis"><div class="kpi"><b>${hasIntake?1:0}</b><div class="sub">Active request</div></div><div class="kpi"><b>${state.job.status}</b><div class="sub">Current stage</div></div><div class="kpi"><b>${state.job.paid?money(calc().total):"—"}</b><div class="sub">Paid</div></div></div>
  <div class="card"><h3>Quick actions</h3><div class="grid two">
    <button class="btn primary" type="button" id="shareIntake">Send Intake Link</button>
    <button class="btn secondary" type="button" data-go="intake">Open Customer Intake</button>
    <button class="btn secondary" type="button" data-go="workup" ${!hasIntake?"disabled":""}>Open AI Workup</button>
    <button class="btn secondary" type="button" data-go="findings" ${!hasIntake?"disabled":""}>Technician Findings</button>
    <button class="btn secondary" type="button" data-go="quote" ${!hasIntake?"disabled":""}>Quote / Estimate</button>
  </div>${!hasIntake?`<p class="sub">Complete an intake first to unlock the job workflow.</p>`:""}</div>
  <div class="card"><h3>Current Job</h3>${hasIntake?`<div class="job"><div><b>${esc(vehicleLabel())}</b><div class="sub">${esc(state.job.customer||"Customer")} • ${esc(state.job.engine||"Engine not entered")}</div></div><span class="pill status">${esc(state.job.status)}</span></div><button class="btn secondary row" data-go="workup">Continue Job</button>`:`<div class="mutedbox">No submitted customer intake yet.</div>`}</div>`);
  $("#shareIntake").onclick=shareIntakeLink;
}
async function shareIntakeLink(){
  const url=location.href.split(/[?#]/)[0]+"#intake";
  const data={title:"Mobile Mechanic AI Service Request",text:"Please fill out this vehicle service request.",url};
  try{if(navigator.share)await navigator.share(data);else window.prompt("Copy this customer intake link:",url)}catch(e){}
}

function intake(){
  state.screen="intake";
  state.intakeStep=Math.min(4,Math.max(1,Number(state.intakeStep)||1));
  const steps=["Vehicle","Issue","Details","Contact"];
  const stepper=`<div class="intake-steps">${steps.map((s,i)=>`<button type="button" class="${state.intakeStep===i+1?"active":state.intakeStep>i+1?"done":""}" data-intake-step="${i+1}"><span>${state.intakeStep>i+1?"✓":i+1}</span>${s}</button>`).join("")}</div>`;
  let body="";
  if(state.intakeStep===1) body=intakeVehicle();
  if(state.intakeStep===2) body=intakeIssue();
  if(state.intakeStep===3) body=intakeDetails();
  if(state.intakeStep===4) body=intakeContact();
  shell(`${stepper}${body}`,{title:"Customer Intake",customer:true,hideNav:true});
  bindIntakeCommon();
  if(state.intakeStep===1) bindVehicle();
  if(state.intakeStep===2) bindIssue();
  if(state.intakeStep===3) bindDetails();
  if(state.intakeStep===4) bindContact();
}
function intakeVehicle(){
  const years=[];for(let y=new Date().getFullYear()+1;y>=1930;y--)years.push(y);
  const models=state.job.make && vehicleCatalog[state.job.make]?Object.keys(vehicleCatalog[state.job.make]):[];
  const data=state.job.make&&state.job.model&&vehicleCatalog[state.job.make]?.[state.job.model];
  const trims=data?.trims||[], engines=data?.engines||[];
  return `<div class="customer-card"><div class="section-title"><span>🚘</span><div><h2>Vehicle & Service</h2><p>Choose the service and tell us exactly what vehicle this is.</p></div></div>
  <div class="field"><label>Service Type *</label><select id="serviceType">
    ${["Repair / Diagnosis","Maintenance","Pre-Purchase Inspection","Roadside / Tow","Fleet / Diesel"].map(x=>`<option ${x===state.job.serviceType?"selected":""}>${x}</option>`).join("")}
  </select></div>
  <div class="field"><label>VIN (optional but recommended)</label><div class="input-action"><input id="vin" maxlength="17" value="${esc(state.job.vin)}" placeholder="17-character VIN"><button id="scanVin" type="button">▣ Scan</button></div><input id="vinCamera" type="file" accept="image/*" capture="environment" hidden><small id="scanStatus">Scan the VIN or type all 17 characters. The app will decode it and auto-fill available vehicle information.</small></div>
  <div class="field"><label>License Plate</label><input id="plate" value="${esc(state.job.plate)}" placeholder="Plate number"></div>
  <div class="grid two">
    <div class="field"><label>Year *</label><select id="year"><option value="">Select Year</option>${years.map(y=>`<option ${String(y)===String(state.job.year)?"selected":""}>${y}</option>`).join("")}</select></div>
    <div class="field"><label>Make *</label><select id="make"><option value="">Select Make</option>${makes.map(x=>`<option ${x===state.job.make?"selected":""}>${x}</option>`).join("")}</select><input id="makeOther" class="other-input" style="display:${state.job.make==="Other / Not Listed"?"block":"none"}" placeholder="Enter manufacturer"></div>
    <div class="field"><label>Model *</label><select id="model"><option value="">Select Model</option>${models.map(x=>`<option ${x===state.job.model?"selected":""}>${x}</option>`).join("")}<option value="__other__">Other / Not Listed</option></select><input id="modelOther" class="other-input" style="display:none" placeholder="Enter model"></div>
    <div class="field"><label>Submodel / Trim</label><select id="trim"><option value="">Select Trim</option>${trims.map(x=>`<option ${x===state.job.trim?"selected":""}>${x}</option>`).join("")}<option value="__other__">Other / Not Listed</option></select><input id="trimOther" class="other-input" style="display:none" placeholder="Enter trim / submodel"></div>
    <div class="field"><label>Engine *</label><select id="engine"><option value="">Select Engine</option>${engines.map(x=>`<option ${x===state.job.engine?"selected":""}>${x}</option>`).join("")}<option value="__other__">Other / Not Listed</option></select><input id="engineOther" class="other-input" style="display:none" placeholder="e.g. 3.5L V6"></div>
    <div class="field"><label>Drivetrain</label><select id="drivetrain"><option value="">Select</option>${["2WD","FWD","RWD","AWD","4WD"].map(x=>`<option ${x===state.job.drivetrain?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Transmission</label><select id="transmission"><option value="">Select</option>${["Automatic","Manual","CVT","Other / Unknown"].map(x=>`<option ${x===state.job.transmission?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Mileage *</label><input id="mileage" type="number" inputmode="numeric" value="${esc(state.job.mileage)}" placeholder="Approx. mileage"></div>
  </div>
  <button class="btn primary row" id="vehicleNext">Continue</button><p class="fine">Step 1 of 4</p></div>`;
}
function intakeIssue(){
  const isPPI=/pre-purchase/i.test(state.job.serviceType||"");
  return `<div class="customer-card"><div class="section-title"><span>${isPPI?"🔍":"🗣️"}</span><div><h2>${isPPI?"What should we pay special attention to?":"What is the vehicle doing?"}</h2><p>${isPPI?"Tell us anything the buyer noticed, seller disclosed, or wants specifically checked.":"Describe the issue in as much detail as possible."}</p></div></div>
    <div class="segmented"><button id="typeMode" class="active" type="button">⌨ Type</button><button id="voiceMode" type="button">🎙 Voice</button></div>
    <div id="voicePanel" class="voice-panel" style="display:none"><button id="voiceRecord" class="mic" type="button">🎙</button><b>Tap to dictate</b><span id="voiceStatus">Your words will be added to the text box.</span></div>
    <div class="field"><label>${isPPI?"Buyer Notes / Concerns":"Customer States"} *</label><textarea id="complaint" rows="8" placeholder="${isPPI?"Example: Seller says no issues. Please check frame rust, oil leaks, brakes, tires, suspension, warning lights and signs of prior collision repair.":"Example: Truck hesitates and jerks when accelerating from a stop. Check engine light came on yesterday."}">${esc(state.job.states)}</textarea></div>
    <button class="btn primary row" id="issueNext">Continue</button><button class="textbtn" id="issueBack" type="button">Back</button><p class="fine">Step 2 of 4</p></div>`;
}
function intakeDetails(){
  const roadside=/roadside|tow/i.test(state.job.serviceType||"");
  const fleet=/fleet|diesel/i.test(state.job.serviceType||"");
  const special=roadside?`<div class="card mode-card"><h3>Roadside / Tow Details</h3><label class="check"><input id="towNeeded" type="checkbox" ${state.job.towNeeded?"checked":""}><span>The vehicle may need towing or freeway removal</span></label><div class="field"><label>Safe Location / Safety Concern</label><input id="roadsideSafety" value="${esc(state.job.roadsideSafety)}" placeholder="Shoulder, parking lot, traffic hazard, etc."></div><div class="field"><label>Preferred Tow Destination</label><input id="towDestination" value="${esc(state.job.towDestination)}" placeholder="Shop, home, or address if known"></div><button class="btn secondary row" id="findTow" type="button">Find Nearby Tow Trucks</button></div>`:fleet?`<div class="card mode-card"><h3>Fleet / Semi-Diesel Details</h3><div class="grid two"><div class="field"><label>Fleet / Company Name *</label><input id="fleetName" value="${esc(state.job.fleetName)}"></div><div class="field"><label>Unit Number *</label><input id="unitNumber" value="${esc(state.job.unitNumber)}"></div><div class="field"><label>USDOT Number</label><input id="dotNumber" value="${esc(state.job.dotNumber)}"></div><div class="field"><label>Trailer / Equipment Type</label><input id="trailerType" value="${esc(state.job.trailerType)}" placeholder="Tractor, reefer, flatbed, equipment"></div></div></div>`:"";
  return `<div class="customer-card"><div class="section-title"><span>📍</span><div><h2>Location & Details</h2><p>Where is the vehicle and when should we come?</p></div></div>
    <div class="field"><label>Service Location *</label><input id="address" value="${esc(state.job.address)}" placeholder="Use current location or enter address"></div>
    <button class="btn primary row" type="button" id="useLocation">📍 Use My Current Location</button><small id="locationStatus">Your phone will ask for permission.</small>
    ${special}
    <div class="field"><label>Photos / Video</label><input id="mediaFiles" type="file" accept="image/*,video/*" capture="environment" multiple><small id="mediaStatus">${state.job.mediaCount?state.job.mediaCount+" file(s) selected for this session.":"Add warning lights, leaks, damage, noises, etc."}</small></div>
    <div class="grid two"><div class="field"><label>Preferred Date</label><input id="serviceDate" type="date" value="${esc(state.job.serviceDate||"")}"></div><div class="field"><label>Best Time</label><select id="serviceTime"><option value="">Select</option>${["Morning","Afternoon","Evening","ASAP"].map(x=>`<option ${x===state.job.serviceTime?"selected":""}>${x}</option>`).join("")}</select></div></div>
    <button class="btn primary row" id="detailsNext">Continue</button><button class="textbtn" id="detailsBack" type="button">Back</button><p class="fine">Step 3 of 4</p></div>`;
}
function intakeContact(){
  return `<div class="customer-card"><div class="section-title"><span>👤</span><div><h2>Contact & Review</h2><p>One last step, then the mechanic gets the ${/pre-purchase/i.test(state.job.serviceType||"")?"pre-purchase inspection request":"AI pre-workup"}.</p></div></div>
    <div class="grid two"><div class="field"><label>First Name *</label><input id="firstName" value="${esc(state.job.firstName||"")}"></div><div class="field"><label>Last Name *</label><input id="lastName" value="${esc(state.job.lastName||"")}"></div></div>
    <div class="field"><label>Phone *</label><input id="phone" type="tel" value="${esc(state.job.phone)}"></div><div class="field"><label>Email</label><input id="email" type="email" value="${esc(state.job.email)}"></div>
    <div class="review"><b>${esc(vehicleLabel())}</b><span>${esc(state.job.engine||"Engine not entered")} • ${esc(state.job.mileage||"—")} mi</span><p>${esc(state.job.states||"No complaint entered")}</p><span>📍 ${esc(state.job.address||"Location not entered")}</span></div>
    <button class="btn primary row" id="submitIntake">Submit Service Request</button><button class="textbtn" id="contactBack" type="button">Back</button><p class="fine">Step 4 of 4</p></div>`;
}
function bindIntakeCommon(){
  $$("[data-intake-step]").forEach(b=>b.onclick=()=>{state.intakeStep=Number(b.dataset.intakeStep);saveState();intake()});
}

async function decodeVIN(vin){
  const clean=String(vin||"").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"");
  if(clean.length!==17) throw new Error("VIN must be 17 characters.");
  const status=$("#scanStatus");
  if(status) status.textContent="Decoding VIN and loading vehicle information…";
  const url=`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(clean)}?format=json`;
  const r=await fetch(url,{headers:{Accept:"application/json"}});
  if(!r.ok) throw new Error("VIN service did not respond.");
  const data=await r.json();
  const v=data?.Results?.[0];
  if(!v) throw new Error("No vehicle information was returned for that VIN.");
  const errorCode=String(v.ErrorCode||"").split(",").filter(Boolean);
  if(errorCode.length && !String(v.Make||"").trim() && !String(v.Model||"").trim()) {
    throw new Error(v.ErrorText||"VIN could not be decoded.");
  }

  const year=String(v.ModelYear||"").trim();
  const make=String(v.Make||"").trim();
  const model=String(v.Model||"").trim();
  const trim=String(v.Trim||v.Series||v.Series2||"").trim();

  let engine="";
  const disp=String(v.DisplacementL||"").trim();
  const cyl=String(v.EngineCylinders||"").trim();
  const config=String(v.EngineConfiguration||"").trim();
  const engModel=String(v.EngineModel||"").trim();
  if(disp) engine+=`${disp}L`;
  if(cyl) engine+=(engine?" ":"")+`${cyl}-cyl`;
  else if(config) engine+=(engine?" ":"")+config;
  if(!engine && engModel) engine=engModel;

  let drive=String(v.DriveType||"").trim();
  if(/four wheel|4x4|4wd/i.test(drive)) drive="4WD";
  else if(/all wheel|awd/i.test(drive)) drive="AWD";
  else if(/front wheel|fwd/i.test(drive)) drive="FWD";
  else if(/rear wheel|rwd/i.test(drive)) drive="RWD";

  let trans=String(v.TransmissionStyle||"").trim();
  if(!trans){
    const speeds=String(v.TransmissionSpeeds||"").trim();
    if(speeds) trans=`${speeds}-speed`;
  }

  const makeSelect=$("#make"), modelSelect=$("#model"), trimSelect=$("#trim"), engineSelect=$("#engine");
  if(year && $("#year")) $("#year").value=year;

  if(make && makeSelect){
    const makeOption=[...makeSelect.options].find(o=>o.value.toLowerCase()===make.toLowerCase());
    if(makeOption){
      makeSelect.value=makeOption.value;
      makeSelect.dispatchEvent(new Event("change"));
    }else{
      makeSelect.value="Other / Not Listed";
      makeSelect.dispatchEvent(new Event("change"));
      if($("#makeOther")){$("#makeOther").style.display="block";$("#makeOther").value=make;}
    }
  }

  if(model && modelSelect){
    await new Promise(res=>setTimeout(res,0));
    const modelOption=[...modelSelect.options].find(o=>o.value.toLowerCase()===model.toLowerCase());
    if(modelOption){
      modelSelect.value=modelOption.value;
      modelSelect.dispatchEvent(new Event("change"));
    }else{
      modelSelect.value="__other__";
      modelSelect.dispatchEvent(new Event("change"));
      if($("#modelOther")){$("#modelOther").style.display="block";$("#modelOther").value=model;}
    }
  }

  if(trim && trimSelect){
    await new Promise(res=>setTimeout(res,0));
    const trimOption=[...trimSelect.options].find(o=>o.value.toLowerCase()===trim.toLowerCase());
    if(trimOption){
      trimSelect.value=trimOption.value;
    }else{
      trimSelect.value="__other__";
      trimSelect.dispatchEvent(new Event("change"));
      if($("#trimOther")){$("#trimOther").style.display="block";$("#trimOther").value=trim;}
    }
  }

  if(engine && engineSelect){
    await new Promise(res=>setTimeout(res,0));
    let engOption=[...engineSelect.options].find(o=>o.value.toLowerCase()===engine.toLowerCase());
    if(!engOption && disp) engOption=[...engineSelect.options].find(o=>o.value.toLowerCase().startsWith(`${disp.toLowerCase()}l`));
    if(engOption){
      engineSelect.value=engOption.value;
    }else{
      engineSelect.value="__other__";
      engineSelect.dispatchEvent(new Event("change"));
      if($("#engineOther")){$("#engineOther").style.display="block";$("#engineOther").value=engine;}
    }
  }

  if(drive && $("#drivetrain")){
    const driveOption=[...$("#drivetrain").options].find(o=>o.value===drive);
    if(driveOption) $("#drivetrain").value=drive;
  }
  if(trans && $("#transmission")){
    const t=trans.toLowerCase();
    let normalized="";
    if(t.includes("cvt")) normalized="CVT";
    else if(t.includes("manual")) normalized="Manual";
    else if(t.includes("automatic")) normalized="Automatic";
    if(normalized && [...$("#transmission").options].some(o=>o.value===normalized)) $("#transmission").value=normalized;
  }

  state.job.vin=clean;
  if(status){
    const filled=[year&&"year",make&&"make",model&&"model",engine&&"engine",trim&&"trim",drive&&"drivetrain",trans&&"transmission"].filter(Boolean);
    status.textContent=filled.length?`VIN decoded. Auto-filled ${filled.join(", ")}. Review the details before continuing.`:"VIN decoded, but this vehicle returned limited specification data. Enter the remaining details manually.";
  }
  return v;
}

function bindVehicle(){
  const fill=(id,items,placeholder)=>{$(id).innerHTML=`<option value="">${placeholder}</option>`+items.map(x=>`<option>${esc(x)}</option>`).join("")+`<option value="__other__">Other / Not Listed</option>`};
  $("#make").onchange=()=>{
    state.job.make=$("#make").value;state.job.model="";state.job.trim="";state.job.engine="";
    $("#makeOther").style.display=state.job.make==="Other / Not Listed"?"block":"none";
    fill("#model",Object.keys(vehicleCatalog[state.job.make]||{}),"Select Model");fill("#trim",[],"Select Model First");fill("#engine",[],"Select Model First");
  };
  $("#model").onchange=()=>{
    const v=$("#model").value;$("#modelOther").style.display=v==="__other__"?"block":"none";
    const d=vehicleCatalog[$("#make").value]?.[v];fill("#trim",d?.trims||[],"Select Trim");fill("#engine",d?.engines||[],"Select Engine");
  };
  $("#trim").onchange=()=>$("#trimOther").style.display=$("#trim").value==="__other__"?"block":"none";
  $("#engine").onchange=()=>$("#engineOther").style.display=$("#engine").value==="__other__"?"block":"none";
  $("#scanVin").onclick=()=>$("#vinCamera").click();
  $("#vinCamera").onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;$("#scanStatus").textContent="Photo captured. Checking for a VIN barcode…";
    try{
      if("BarcodeDetector" in window){
        const det=new BarcodeDetector({formats:["code_39","code_128","data_matrix","qr_code"]});
        const bm=await createImageBitmap(f);
        const codes=await det.detect(bm);
        const raw=(codes[0]?.rawValue||"").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"");
        if(raw.length===17){
          $("#vin").value=raw;
          await decodeVIN(raw);
          return;
        }
      }
    }catch(err){
      $("#scanStatus").textContent=err.message||"VIN scan was captured but decode failed. Enter the VIN manually.";
      return;
    }
    $("#scanStatus").textContent="Photo captured. Automatic VIN barcode reading was unavailable. Enter the 17-character VIN and it will decode automatically.";
  };
  let vinTimer=null;
  $("#vin").addEventListener("input",()=>{
    clearTimeout(vinTimer);
    const clean=$("#vin").value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"");
    $("#vin").value=clean.slice(0,17);
    if(clean.length===17){
      vinTimer=setTimeout(async()=>{
        try{await decodeVIN(clean)}catch(err){$("#scanStatus").textContent=err.message||"VIN lookup failed. You can still enter vehicle details manually."}
      },350);
    }
  });
  $("#vin").addEventListener("blur",async()=>{
    const clean=$("#vin").value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"");
    if(clean.length===17){
      try{await decodeVIN(clean)}catch(err){$("#scanStatus").textContent=err.message||"VIN lookup failed. You can still enter vehicle details manually."}
    }
  });
  $("#vehicleNext").onclick=()=>{
    const make=$("#make").value, modelSel=$("#model").value, engineSel=$("#engine").value;
    const model=modelSel==="__other__"?$("#modelOther").value.trim():modelSel;
    const trim=$("#trim").value==="__other__"?$("#trimOther").value.trim():$("#trim").value;
    const engine=engineSel==="__other__"?$("#engineOther").value.trim():engineSel;
    const vals={serviceType:$("#serviceType").value,year:$("#year").value,make:make==="Other / Not Listed"?($("#makeOther").value.trim()||"Other"):make,model,trim,engine,drivetrain:$("#drivetrain").value,transmission:$("#transmission").value,mileage:$("#mileage").value,vin:$("#vin").value.trim().toUpperCase(),plate:$("#plate").value.trim().toUpperCase()};
    if(!vals.year||!vals.make||!vals.model||!vals.engine||!vals.mileage)return notify("Please enter Year, Make, Model, Engine and Mileage.");
    Object.assign(state.job,vals);state.intakeStep=2;saveState();intake();
  };
}
function bindIssue(){
  $("#voiceMode").onclick=()=>{$("#voicePanel").style.display="flex";$("#voiceMode").classList.add("active");$("#typeMode").classList.remove("active")};
  $("#typeMode").onclick=()=>{$("#voicePanel").style.display="none";$("#typeMode").classList.add("active");$("#voiceMode").classList.remove("active")};
  $("#voiceRecord").onclick=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return notify("Voice recognition is not supported here. Use your keyboard microphone or type the complaint.");
    const r=new SR();r.lang="en-US";r.interimResults=false;$("#voiceStatus").textContent="Listening…";r.onresult=e=>{$("#complaint").value+=($("#complaint").value?" ":"")+e.results[0][0].transcript;$("#voiceStatus").textContent="Added to transcription."};r.onerror=()=>$("#voiceStatus").textContent="Voice input stopped. Try again or type.";r.start();
  };
  $("#issueBack").onclick=()=>{state.intakeStep=1;intake()};
  $("#issueNext").onclick=()=>{const v=$("#complaint").value.trim();if(v.length<5)return notify("Please describe the vehicle problem.");state.job.states=v;state.intakeStep=3;saveState();intake()};
}
function bindDetails(){
  $("#mediaFiles").onchange=e=>{state.job.mediaCount=e.target.files?.length||0;$("#mediaStatus").textContent=`${state.job.mediaCount} file(s) selected for this session.`};
  $("#useLocation").onclick=()=>{
    const s=$("#locationStatus");if(!navigator.geolocation){s.textContent="Location is not supported. Enter the address manually.";return}
    s.textContent="Getting your current location…";
    navigator.geolocation.getCurrentPosition(async pos=>{
      const lat=pos.coords.latitude,lon=pos.coords.longitude;state.job.latitude=lat;state.job.longitude=lon;$("#address").value=`${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      s.textContent="Location captured. Looking up street address…";
      try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);if(r.ok){const d=await r.json();if(d.display_name){$("#address").value=d.display_name;s.textContent="Current location found.";return}}}catch(e){}
      s.textContent="GPS location captured; street address lookup was unavailable.";
    },()=>s.textContent="Could not get location. Allow location permission or enter the address manually.",{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  };
  $("#detailsBack").onclick=()=>{state.intakeStep=2;intake()};
  if($("#findTow"))$("#findTow").onclick=()=>{const where=$("#address").value.trim()||"current location";window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`tow truck near ${where}`)}`,"_blank","noopener")};
  $("#detailsNext").onclick=()=>{const a=$("#address").value.trim();if(!a)return notify("Please enter or use the current service location.");
    if($("#fleetName")&&(!$("#fleetName").value.trim()||!$("#unitNumber").value.trim()))return notify("Enter the fleet/company name and unit number.");
    Object.assign(state.job,{address:a,serviceDate:$("#serviceDate").value,serviceTime:$("#serviceTime").value,towNeeded:!!$("#towNeeded")?.checked,towDestination:$("#towDestination")?.value.trim()||"",roadsideSafety:$("#roadsideSafety")?.value.trim()||"",fleetName:$("#fleetName")?.value.trim()||state.job.fleetName,unitNumber:$("#unitNumber")?.value.trim()||state.job.unitNumber,dotNumber:$("#dotNumber")?.value.trim()||state.job.dotNumber,trailerType:$("#trailerType")?.value.trim()||state.job.trailerType});state.intakeStep=4;saveState();intake()};
}
function bindContact(){
  $("#contactBack").onclick=()=>{state.intakeStep=3;intake()};
  $("#submitIntake").onclick=()=>{
    const f=$("#firstName").value.trim(),l=$("#lastName").value.trim(),p=$("#phone").value.trim();
    if(!f||!l||!p)return notify("Please enter the customer's first name, last name and phone.");
    Object.assign(state.job,{firstName:f,lastName:l,customer:`${f} ${l}`,phone:p,email:$("#email").value.trim(),status:"AI Workup Ready"});
    state.job.assessment=generateAssessment(state.job.states);
    state.job.parts=clone(state.job.assessment.parts);
    state.job.labor=clone(state.job.assessment.labor);
    state.screen=/pre-purchase inspection/i.test(state.job.serviceType||"")?"inspection":"workup";saveState();render();
  };
}

function generateAssessment(text){
  const t=(text||"").toLowerCase();
  let a={summary:"Start with a basic diagnostic inspection and scan for trouble codes.",causes:[["General diagnostic issue","Medium"],["Electrical / sensor issue","Medium"],["Mechanical condition","Low"]],steps:["Scan for DTCs and record freeze-frame data","Perform visual inspection","Verify the complaint under safe conditions","Use test results to isolate the failed system"],parts:[],labor:[{d:"Diagnostic inspection",h:1,r:state.business.labor}]};
  if(/misfire|shak|rough idle|p030/.test(t)) a={summary:"Symptoms are consistent with a misfire. Ignition, fuel and air/vacuum faults should be checked before replacing parts.",causes:[["Ignition coil / spark plug issue","High"],["Fuel injector / fuel delivery","Medium"],["Vacuum / unmetered air leak","Medium"],["Mechanical compression issue","Low"]],steps:["Scan codes and misfire counters","Inspect spark plugs and coils","Swap-test suspect ignition coil","Check fuel trims / vacuum leaks","Verify injector operation and compression if needed"],parts:[{d:"Spark Plug(s) — verify application",q:1,p:14.99},{d:"Ignition Coil — only if confirmed failed",q:1,p:89.99}],labor:[{d:"Misfire diagnosis",h:1,r:state.business.labor}]};
  else if(/no start|won't start|wont start|crank/.test(t)) a={summary:"No-start symptoms require separating battery/starting, fuel, ignition and mechanical causes.",causes:[["Weak battery / connection","High"],["Starter / starting circuit","Medium"],["Fuel delivery","Medium"],["Crank/cam signal or ignition","Medium"]],steps:["Battery load test and terminal inspection","Verify cranking RPM","Check fuel pressure","Check spark / injector pulse","Scan for immobilizer and crank/cam codes"],parts:[],labor:[{d:"No-start diagnostic",h:1.2,r:state.business.labor}]};
  else if(/overheat|hot|coolant|temperature/.test(t)) a={summary:"Overheating can damage the engine. Verify coolant level and cooling-system operation before extended running.",causes:[["Low coolant / leak","High"],["Thermostat fault","Medium"],["Cooling fan fault","Medium"],["Water pump / circulation issue","Medium"]],steps:["Check coolant level cold and inspect for leaks","Pressure-test cooling system","Verify fan operation","Monitor thermostat opening and temperature data","Check coolant circulation / pump"],parts:[],labor:[{d:"Cooling-system diagnosis",h:1,r:state.business.labor}]};
  else if(/brake|grind|squeal/.test(t)) a={summary:"Brake complaints are safety-sensitive. Inspect the complete brake system before driving or quoting parts.",causes:[["Worn pads / rotors","High"],["Caliper or slide issue","Medium"],["Hydraulic issue","Medium"]],steps:["Inspect pad and rotor condition","Measure rotor thickness/runout as needed","Inspect calipers, hoses and leaks","Road test only if safe"],parts:[],labor:[{d:"Brake inspection / diagnosis",h:0.8,r:state.business.labor}]};
  else if(/ac |a\/c|air condition|not cold/.test(t)) a={summary:"A/C performance should be diagnosed with pressure/temperature checks before adding refrigerant or replacing parts.",causes:[["Low refrigerant from leak","High"],["Compressor / control issue","Medium"],["Condenser airflow issue","Medium"],["Blend-door / HVAC control issue","Low"]],steps:["Verify vent temperature and compressor command","Check static/running pressures","Leak inspect with approved method","Verify condenser fan/airflow","Check HVAC blend door if pressures are normal"],parts:[],labor:[{d:"A/C performance diagnosis",h:1,r:state.business.labor}]};
  if(/roadside|tow/i.test(state.job.serviceType||"")){
    a.summary=`Roadside safety comes first. ${a.summary}`;
    a.steps=["Confirm the vehicle and customer are in a safe location","Determine whether on-site diagnosis is safe and practical",...a.steps,"Arrange towing/freeway removal when the vehicle cannot be safely serviced on-site"];
  }
  if(/fleet|diesel/i.test(state.job.serviceType||"")){
    a.summary=`Fleet unit ${state.job.unitNumber||"(unit not entered)"}: ${a.summary}`;
    a.steps=["Record unit number, mileage/hours and driver complaint","Check fleet maintenance history and out-of-service safety concerns",...a.steps];
  }
  return a;
}
function workup(){
  if(!state.job.states){state.intakeStep=1;return go("intake")}
  state.screen="workup";if(!state.job.assessment)state.job.assessment=generateAssessment(state.job.states);
  const a=state.job.assessment;saveState();
  shell(`<div class="card ai-card"><div class="ai-head"><span>✦</span><div><p class="eyebrow">AI PRE-WORKUP</p><h2>Preliminary Assessment</h2></div></div><p>${esc(a.summary)}</p><div class="warning">Technician must verify diagnosis, parts, labor, pricing and safety procedures before performing work.</div></div>
  <div class="card"><h3>Customer Issue</h3><blockquote>${esc(state.job.states)}</blockquote></div>
  <div class="card"><h3>Top Likely Causes</h3>${a.causes.map((x,i)=>`<div class="cause"><b>${i+1}. ${esc(x[0])}</b><span class="risk ${x[1].toLowerCase()}">${x[1]}</span></div>`).join("")}</div>
  <div class="card"><h3>Recommended Diagnostic Path</h3><ol class="plan">${a.steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>
  <div class="card"><h3>AI Quote Starter</h3><p class="sub">Suggested items are a starting point only. You control what gets quoted.</p>${a.parts.length?a.parts.map(x=>`<div class="job"><span>${esc(x.d)}</span><b>${money(x.p)}</b></div>`).join(""):`<div class="mutedbox">No parts recommended until diagnosis confirms the failed component.</div>`}<div class="job"><span>Suggested diagnostic labor</span><b>${a.labor[0]?.h||1} hr</b></div></div>
  <div class="grid two"><button class="btn secondary" type="button" id="regenAI">Re-run Assessment</button><button class="btn secondary" type="button" id="findParts">Find Nearby Parts</button><button class="btn secondary" type="button" id="repairVideos">Repair Videos</button><button class="btn primary" type="button" id="useWorkup">Use This Workup</button></div>`,{progressStep:1});
  $("#regenAI").onclick=()=>{state.job.assessment=generateAssessment(state.job.states);state.job.parts=clone(state.job.assessment.parts);state.job.labor=clone(state.job.assessment.labor);saveState();workup();notify("Assessment refreshed.")};
  $("#findParts").onclick=()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`auto parts near ${state.job.address||"me"}`)}`,"_blank","noopener");
  $("#repairVideos").onclick=()=>window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${vehicleLabel()} ${state.job.engine} ${state.job.states} repair diagnosis`)}`,"_blank","noopener");
  $("#useWorkup").onclick=()=>{state.job.parts=clone(a.parts);state.job.labor=clone(a.labor);state.job.status="Technician Findings";saveState();go("findings")};
}

const inspectionSections = [
  ["Exterior / Body",["Body damage / dents / rust","Windshield / glass","Mirrors","Doors / hood / tailgate","Wipers / washers"]],
  ["Tires / Wheels",["Front tire condition","Rear tire condition","Tread depth / uneven wear","Wheel damage","Spare tire / jack"]],
  ["Brakes",["Front pads / rotors","Rear pads / rotors","Brake fluid","Parking brake","Brake warning / ABS"]],
  ["Steering / Suspension",["Ball joints / tie rods","Control arms / bushings","Shocks / struts","Wheel bearings","Steering operation"]],
  ["Engine Bay",["Engine oil level / condition","Coolant level / condition","Leaks","Belts / tensioners","Hoses","Battery / terminals","Air filter"]],
  ["Transmission / Drivetrain",["Transmission operation","Transmission fluid / leaks","CV axles / U-joints","Differential / transfer case","Driveshaft / mounts"]],
  ["Lights / Electrical",["Headlights","Brake / tail lights","Turn signals","Interior lights","Horn","Power windows / locks","Charging system"]],
  ["Interior / HVAC",["A/C operation","Heater / defrost","Dashboard warning lights","Seat belts","Seats / controls","Infotainment / camera"]],
  ["Road Test",["Engine performance","Transmission shifting","Brake performance","Steering tracking","Suspension noise","Vibration / wheel balance","Cruise / driver assists"]]
];

function ensureInspection(){
  if(state.job.inspection) return;
  const items={};
  inspectionSections.forEach(([section,list])=>list.forEach(item=>items[item]={status:"Not Checked",note:""}));
  state.job.inspection={type:"Pre-Purchase Inspection",items,overall:"Pending",summary:"",recommendations:[]};
}
function inspection(){
  if(!state.job.states && !state.job.customer){state.intakeStep=1;return go("intake")}
  state.screen="inspection";ensureInspection();
  const insp=state.job.inspection;
  const sectionHtml=inspectionSections.map(([section,list])=>`<div class="card inspection-section"><h3>${section}</h3>${list.map(item=>{
    const it=insp.items[item]||{status:"Not Checked",note:""};
    return `<div class="inspection-row">
      <div class="inspection-label">${item}</div>
      <select class="inspection-status" data-item="${esc(item)}">
        ${["Not Checked","Pass","Needs Attention","Fail"].map(s=>`<option ${s===it.status?"selected":""}>${s}</option>`).join("")}
      </select>
      <input class="inspection-note" data-note="${esc(item)}" value="${esc(it.note||"")}" placeholder="Optional note">
    </div>`;
  }).join("")}</div>`).join("");

  shell(`<div class="card"><div class="section-title"><span>🔍</span><div><h2>Pre-Purchase Inspection</h2><p>${esc(vehicleLabel())} • ${esc(state.job.engine||"")}</p></div></div>
    <p class="sub">Customer requested a pre-purchase inspection. Review the buyer's notes, inspect each system, document photos/findings, and generate the inspection report.</p>
    ${state.job.states?`<div class="mutedbox"><b>Buyer notes:</b><br>${esc(state.job.states)}</div>`:""}</div>
    ${sectionHtml}
    <div class="card"><h3>Inspection Photos</h3><input id="inspectionFiles" type="file" accept="image/*,video/*" capture="environment" multiple><p class="sub" id="inspectionPhotoStatus">${state.job.inspectionPhotos||0} photo/video file(s) selected in this test session.</p></div>
    <div class="card"><h3>Overall Condition</h3><select id="inspectionOverall">
      ${["Pending","Pass","Pass With Recommendations","Needs Repair","Unsafe / Do Not Drive"].map(s=>`<option ${s===insp.overall?"selected":""}>${s}</option>`).join("")}
    </select></div>
    <button class="btn ai-button row" id="generateInspectionSummary" type="button">✦ Generate AI Inspection Summary</button>
    <div class="card" id="inspectionSummary">${insp.summary?`<h3>Inspection Summary</h3><p>${esc(insp.summary)}</p>${insp.recommendations.length?`<h4>Recommended Repairs / Follow-Up</h4><ul>${insp.recommendations.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}`:`<div class="mutedbox">Complete the checklist, then generate the inspection summary.</div>`}</div>
    <div class="grid two"><button class="btn secondary" id="saveInspection" type="button">Save Inspection</button><button class="btn primary" id="inspectionToQuote" type="button">Create Quote From Findings</button></div>`,{progressStep:2});

  $$(".inspection-status").forEach(el=>el.onchange=()=>{ensureInspection();state.job.inspection.items[el.dataset.item].status=el.value;saveState()});
  $$(".inspection-note").forEach(el=>el.oninput=()=>{ensureInspection();state.job.inspection.items[el.dataset.note].note=el.value;saveState()});
  $("#inspectionFiles").onchange=e=>{state.job.inspectionPhotos=e.target.files?.length||0;$("#inspectionPhotoStatus").textContent=`${state.job.inspectionPhotos} photo/video file(s) selected in this test session.`;saveState()};
  $("#inspectionOverall").onchange=()=>{state.job.inspection.overall=$("#inspectionOverall").value;saveState()};
  $("#generateInspectionSummary").onclick=()=>{syncInspection();generateInspectionSummary();saveState();inspection()};
  $("#saveInspection").onclick=()=>{syncInspection();generateInspectionSummary();state.job.status="Inspection Complete";saveState();notify("Inspection saved.")};
  $("#inspectionToQuote").onclick=()=>{syncInspection();generateInspectionSummary();buildQuoteFromInspection();state.job.status="Quote Draft";saveState();go("quote")};
}
function syncInspection(){
  ensureInspection();
  $$(".inspection-status").forEach(el=>state.job.inspection.items[el.dataset.item].status=el.value);
  $$(".inspection-note").forEach(el=>state.job.inspection.items[el.dataset.note].note=el.value);
  if($("#inspectionOverall"))state.job.inspection.overall=$("#inspectionOverall").value;
}
function generateInspectionSummary(){
  ensureInspection();
  const failed=[], attention=[], passed=[];
  Object.entries(state.job.inspection.items).forEach(([item,v])=>{
    const label=v.note?`${item} — ${v.note}`:item;
    if(v.status==="Fail")failed.push(label);
    else if(v.status==="Needs Attention")attention.push(label);
    else if(v.status==="Pass")passed.push(label);
  });
  let summary=`Inspection completed for ${vehicleLabel()}. `;
  if(failed.length)summary+=`${failed.length} item(s) failed inspection. `;
  if(attention.length)summary+=`${attention.length} item(s) need attention. `;
  if(!failed.length&&!attention.length&&passed.length)summary+="No major concerns were marked during the completed checks. ";
  summary+=`Overall condition: ${state.job.inspection.overall}. Technician should verify all safety-sensitive findings and measurements before making repair decisions.`;
  state.job.inspection.summary=summary;
  state.job.inspection.recommendations=[...failed.map(x=>`Repair / replace: ${x}`),...attention.map(x=>`Inspect / service soon: ${x}`)];
  state.job.finding=[state.job.finding,state.job.inspection.summary,...state.job.inspection.recommendations].filter(Boolean).join("\n");
}
function buildQuoteFromInspection(){
  ensureInspection();
  const items=state.job.inspection.items;
  const addPart=(desc,price=0)=>{if(!state.job.parts.some(x=>x.d===desc))state.job.parts.push({d:desc,q:1,p:price})};
  const addLabor=(desc,h=.5)=>{if(!state.job.labor.some(x=>x.d===desc))state.job.labor.push({d:desc,h,r:state.business.labor})};
  Object.entries(items).forEach(([item,v])=>{
    if(!["Fail","Needs Attention"].includes(v.status))return;
    const i=item.toLowerCase();
    if(i.includes("front pads")||i.includes("rear pads")){addPart("Brake pads — verify application",0);addLabor("Brake service — verify scope",1.5)}
    else if(i.includes("battery")){addPart("Battery — verify group size/specification",0);addLabor("Battery replacement / charging-system verification",.5)}
    else if(i.includes("air filter")){addPart("Engine air filter — verify application",0);addLabor("Air filter replacement",.3)}
    else if(i.includes("wiper")){addPart("Wiper blades — verify sizes",0);addLabor("Wiper blade replacement",.2)}
    else if(i.includes("tire")){addLabor("Tire / wheel service — verify required repair",.7)}
    else if(i.includes("oil")){addPart("Engine oil / filter — verify specification",0);addLabor("Oil service / leak inspection",.7)}
    else {addLabor(`${item} — inspect / repair as confirmed`,.5)}
  });
}

function findings(){
  state.screen="findings";
  shell(`<div class="card"><h3>Customer States</h3><p>${esc(state.job.states)}</p></div>
  <div class="card"><h3>Technician Findings</h3><textarea id="finding" rows="7" placeholder="Enter what you actually found…">${esc(state.job.finding)}</textarea><div class="grid two"><button class="btn secondary" id="dictateFinding" type="button">🎙 Dictate Findings</button><button class="btn secondary" id="evidenceBtn" type="button">📷 Add Evidence</button></div><input id="evidenceFiles" type="file" accept="image/*,video/*,.pdf" multiple hidden><small id="evidenceStatus"></small></div>
  <div class="card"><h3>Diagnostics Performed</h3>${["Scan codes / freeze-frame","Visual inspection","Component test / verification","Road test (if safe)"].map(x=>`<label class="check"><input type="checkbox"><span>${x}</span></label>`).join("")}</div>
  <button class="btn primary row" id="saveFinding">Update Draft Quote</button>`,{progressStep:2});
  $("#dictateFinding").onclick=()=>dictateInto("#finding");
  $("#evidenceBtn").onclick=()=>$("#evidenceFiles").click();
  $("#evidenceFiles").onchange=e=>$("#evidenceStatus").textContent=`${e.target.files?.length||0} evidence file(s) selected for this session.`;
  $("#saveFinding").onclick=()=>{const v=$("#finding").value.trim();if(!v)return notify("Enter technician findings before building the final quote.");state.job.finding=v;state.job.status="Quote Draft";saveState();go("quote")};
}
function dictateInto(sel){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return notify("Voice recognition is unavailable here. Use the phone keyboard microphone or type.");
  const r=new SR();r.lang="en-US";r.onresult=e=>{$(sel).value+=($(sel).value?" ":"")+e.results[0][0].transcript};r.start();
}
function quote(){
  state.screen="quote";if(!state.job.assessment)state.job.assessment=generateAssessment(state.job.states);
  if(!state.job.labor?.length)state.job.labor=clone(state.job.assessment.labor);
  shell(`<div class="card"><div class="section-title"><span>✦</span><div><h2>AI-Assisted Quote</h2><p>${esc(vehicleLabel())} • ${esc(state.job.engine)}</p></div></div><button class="btn ai-button row" id="aiQuote" type="button">✦ Build / Refresh Quote From Assessment</button></div>
  <div class="card"><h3>Technician Findings</h3><p>${esc(state.job.finding||"No technician findings entered yet.")}</p></div>
  <div class="card"><h3>Parts</h3><div id="partsList"></div><button class="btn secondary" id="addPart" type="button">+ Add Part</button></div>
  <div class="card"><h3>Labor</h3><div id="laborList"></div><button class="btn secondary" id="addLabor" type="button">+ Add Labor</button></div>
  <div class="card" id="totals"></div>
  <button class="btn primary row" id="saveQuote" type="button">Save Quote & Continue to Approval</button>`,{progressStep:3});
  renderQuoteLines();
  $("#aiQuote").onclick=()=>{const a=generateAssessment(`${state.job.states} ${state.job.finding}`);state.job.assessment=a;state.job.parts=clone(a.parts);state.job.labor=clone(a.labor);if(state.job.finding&&/coil/i.test(state.job.finding)&&!state.job.parts.some(x=>/coil/i.test(x.d)))state.job.parts.push({d:"Ignition Coil — technician confirmed",q:1,p:89.99});saveState();renderQuoteLines();notify("Quote starter rebuilt from the assessment and findings.")};
  $("#addPart").onclick=()=>{state.job.parts.push({d:"New part",q:1,p:0});renderQuoteLines()};
  $("#addLabor").onclick=()=>{state.job.labor.push({d:"Additional labor",h:0.5,r:state.business.labor});renderQuoteLines()};
  $("#saveQuote").onclick=()=>{syncQuote();state.job.status="Awaiting Approval";saveState();go("approval")};
}
function renderQuoteLines(){
  const p=$("#partsList"),l=$("#laborList");if(!p||!l)return;
  p.innerHTML=(state.job.parts||[]).map((x,i)=>`<div class="lineitem"><input data-part="d" data-i="${i}" value="${esc(x.d)}"><input data-part="q" data-i="${i}" type="number" min="0" step="1" value="${x.q}"><input data-part="p" data-i="${i}" type="number" min="0" step=".01" value="${x.p}"><button class="remove" data-rpart="${i}" type="button">×</button></div>`).join("")||`<div class="mutedbox">No parts added yet.</div>`;
  l.innerHTML=(state.job.labor||[]).map((x,i)=>`<div class="lineitem"><input data-labor="d" data-i="${i}" value="${esc(x.d)}"><input data-labor="h" data-i="${i}" type="number" min="0" step=".1" value="${x.h}"><input data-labor="r" data-i="${i}" type="number" min="0" step=".01" value="${x.r}"><button class="remove" data-rlabor="${i}" type="button">×</button></div>`).join("");
  $$("[data-part],[data-labor]").forEach(el=>el.oninput=()=>{syncQuote();updateTotals()});
  $$("[data-rpart]").forEach(b=>b.onclick=()=>{state.job.parts.splice(Number(b.dataset.rpart),1);renderQuoteLines()});
  $$("[data-rlabor]").forEach(b=>b.onclick=()=>{state.job.labor.splice(Number(b.dataset.rlabor),1);renderQuoteLines()});
  updateTotals();
}
function syncQuote(){
  $$("[data-part]").forEach(el=>{const i=+el.dataset.i,k=el.dataset.part;if(state.job.parts[i])state.job.parts[i][k]=k==="d"?el.value:Number(el.value)});
  $$("[data-labor]").forEach(el=>{const i=+el.dataset.i,k=el.dataset.labor;if(state.job.labor[i])state.job.labor[i][k]=k==="d"?el.value:Number(el.value)});
  saveState();
}
function updateTotals(){
  const c=calc(),t=$("#totals");if(t)t.innerHTML=`<h3>Estimate Summary</h3><div class="job"><span>Parts</span><b>${money(c.parts)}</b></div><div class="job"><span>Labor</span><b>${money(c.labor)}</b></div><div class="job"><span>Service fee</span><b>${money(c.fee)}</b></div><div class="job"><span>Tax (${state.business.tax}%)</span><b>${money(c.tax)}</b></div><div class="total">${money(c.total)}</div>`;
}
function approval(){
  state.screen="approval";const c=calc();
  shell(`<div class="card"><h2>Customer Approval Required</h2><p>Review the estimate with the customer and choose how they will approve it.</p></div>
  <div class="approval-options"><button class="option active" id="approveHere" type="button"><b>1. Approve Here on This Device</b><span>Customer reviews and signs on this phone.</span></button><button class="option" id="sendApproval" type="button"><b>2. Send Secure Approval Link</b><span>Creates a test share link for this estimate.</span></button><button class="option" id="customerApp" type="button"><b>3. Customer App</b><span>Opens the customer approval view in this test app.</span></button></div>
  <div class="card"><h3>Estimate Total</h3><div class="total">${money(c.total)}</div><label class="check"><input type="checkbox" id="approveCheck"><span>I approve this estimate and authorize the listed work.</span></label><div class="field"><label>Customer Signature / Name</label><input id="signature" placeholder="Type customer name"></div><button class="btn primary row" id="approveBtn" type="button">Confirm Approval</button></div>`,{progressStep:4});
  $("#approveHere").onclick=()=>selectApproval("On Device","#approveHere");
  $("#sendApproval").onclick=()=>{selectApproval("Secure Link","#sendApproval");shareApprovalLink()};
  $("#customerApp").onclick=()=>{selectApproval("Customer App","#customerApp");notify("Customer approval view is ready on this device for testing.")};
  $("#approveBtn").onclick=()=>{if(!$("#approveCheck").checked||!$("#signature").value.trim())return notify("Customer acknowledgement and signature/name are required.");state.job.approved=true;state.job.approvalMethod=state.job.approvalMethod||"On Device";state.job.signature=$("#signature").value.trim();state.job.status="Approved";saveState();go("invoice")};
}
function selectApproval(method,sel){state.job.approvalMethod=method;$$(".option").forEach(x=>x.classList.remove("active"));$(sel).classList.add("active");saveState()}
async function shareApprovalLink(){
  const url=location.href.split("?")[0]+"?approval=demo";
  const data={title:"Mobile Mechanic AI Estimate",text:`Estimate for ${vehicleLabel()} — ${money(calc().total)}`,url};
  try{if(navigator.share){await navigator.share(data)}else{window.prompt("Copy this approval link:",url)}}catch(e){}
}
function invoice(){
  state.screen="invoice";const c=calc();
  shell(`<div class="card"><h2>Invoice #INV-000145</h2><p>${esc(state.job.customer)} • ${esc(vehicleLabel())}</p><span class="pill status">${state.job.approved?"Approved":"Draft"}</span></div>
  <div class="card"><h3>Services & Totals</h3>${state.job.parts.map(x=>`<div class="job"><span>${esc(x.d)} × ${x.q}</span><b>${money(x.q*x.p)}</b></div>`).join("")}${state.job.labor.map(x=>`<div class="job"><span>${esc(x.d)} • ${x.h} hr</span><b>${money(x.h*x.r)}</b></div>`).join("")}<div class="job"><span>Service fee</span><b>${money(c.fee)}</b></div><div class="job"><span>Tax</span><b>${money(c.tax)}</b></div><div class="total">${money(c.total)}</div></div>
  <div class="field"><label>Invoice Notes</label><textarea id="invoiceNotes">Thank you for your business.</textarea></div><button class="btn primary row" id="toPayment" type="button">Proceed to Payment</button>`,{progressStep:5});
  $("#toPayment").onclick=()=>{state.job.invoiceNotes=$("#invoiceNotes").value;state.job.status="Payment Due";saveState();go("payment")};
}
function payment(){
  state.screen="payment";const c=calc();const methods=["Square","Cash App","Venmo","PayPal","Zelle","Cash"];
  shell(`<div class="card"><h2>Payment</h2><div class="total">${money(c.total)}</div><p class="sub">Select how the customer paid for this test job.</p></div><div class="grid two">${methods.map(x=>`<button type="button" class="btn secondary paymethod ${state.job.paymentMethod===x?"selected":""}" data-pay="${x}">${x}</button>`).join("")}</div>
  <div class="card"><h3>Receipt Delivery</h3><div class="grid two"><button class="btn secondary receipt" data-receipt="Email" type="button">Email</button><button class="btn secondary receipt" data-receipt="Text" type="button">Text</button><button class="btn secondary" id="printInvoice" type="button">Print</button><button class="btn secondary" id="previewReceipt" type="button">Preview Receipt</button></div></div>
  <button class="btn success row" id="paid" type="button">Record Payment Received</button>`,{progressStep:6});
  $$("[data-pay]").forEach(b=>b.onclick=()=>{state.job.paymentMethod=b.dataset.pay;saveState();payment()});
  $$("[data-receipt]").forEach(b=>b.onclick=()=>notify(`${b.dataset.receipt} receipt selected. Live delivery will require the messaging/email integration.`));
  $("#printInvoice").onclick=()=>window.print();
  $("#previewReceipt").onclick=()=>notify(`Receipt preview: INV-000145 • ${money(c.total)} • ${state.job.paymentMethod||"payment method not selected"}`);
  $("#paid").onclick=()=>{if(!state.job.paymentMethod)return notify("Select a payment method first.");state.job.paid=true;state.job.status="Complete";saveState();go("complete")};
}
function complete(){
  state.screen="complete";const c=calc();
  shell(`<div class="complete-banner">✓ JOB COMPLETED & PAID IN FULL</div><div class="card"><h2>${esc(vehicleLabel())}</h2><p>${esc(state.job.engine)} • ${esc(state.job.drivetrain||"")} • ${esc(state.job.mileage)} mi</p><p class="sub">${esc(state.job.customer)} • ${esc(state.job.address)}</p></div>
  <div class="card"><h3>Job Summary</h3><p><b>Customer complaint:</b> ${esc(state.job.states)}</p><p><b>Technician findings:</b> ${esc(state.job.finding)}</p><p><b>Total paid:</b> ${money(c.total)} via ${esc(state.job.paymentMethod)}</p></div>
  <div class="card"><h3>Photos & Documents</h3><input id="docUpload" type="file" accept="image/*,.pdf" multiple><div id="docStatus" class="sub">${state.job.documents.length} document(s) recorded in this test session.</div></div>
  <div class="grid two"><button class="btn secondary" id="printFinal" type="button">Print Invoice</button><button class="btn secondary" id="viewReceipt" type="button">View Receipt</button><button class="btn secondary" id="shareSummary" type="button">Share Job Summary</button><button class="btn primary" data-go="carfax" type="button">Complete & Report</button></div>`,{progressStep:7});
  $("#docUpload").onchange=e=>{state.job.documents=[...state.job.documents,...[...(e.target.files||[])].map(f=>f.name)];saveState();$("#docStatus").textContent=`${state.job.documents.length} document(s) recorded in this test session.`};
  $("#printFinal").onclick=()=>window.print();
  $("#viewReceipt").onclick=()=>notify(`Receipt INV-000145 — ${money(c.total)} paid by ${state.job.paymentMethod}.`);
  $("#shareSummary").onclick=async()=>{const text=`${vehicleLabel()} — completed. Total ${money(c.total)}. ${state.job.finding}`;try{if(navigator.share)await navigator.share({title:"Mobile Mechanic AI Job Summary",text});else window.prompt("Copy job summary:",text)}catch(e){}};
}
function carfax(){
  state.screen="carfax";
  shell(`<div class="card report-card"><div class="carfax-word">CARFAX <span>✓</span></div><h2>Service Report Ready</h2><p>The completed job record is ready for an authorized CARFAX service-history connection.</p><div class="review"><b>${esc(vehicleLabel())}</b><span>VIN: ${esc(state.job.vin||"Not provided")}</span><span>${new Date().toLocaleDateString()} • ${money(calc().total)}</span></div><div class="warning">Live reporting requires an approved CARFAX provider account and secure server connection. This test build safely stores the report as pending.</div><button class="btn primary row" id="queueCarfax">Save Pending Report</button><button class="btn secondary row" data-go="customerAlerts">Open Customer Alerts</button></div>`,{title:"Service Report",hideNav:true});
  $("#queueCarfax").onclick=()=>{state.job.carfaxStatus="Pending authorized connection";saveState();notify("Service report saved as pending.")};
}
function customerAlerts(){
  state.screen="customerAlerts";
  shell(`<div class="card"><h2>My Vehicle</h2><p>${esc(vehicleLabel())}</p></div><div class="segmented dark-tabs"><button class="active">Alerts</button><button>Progress</button><button>Notes</button></div><div class="alert-list">${[["Estimate Approved","Work was authorized."],["Vehicle In Service","Technician is working on your vehicle."],["Payment Received",`${money(calc().total)} received.`],["Job Completed","Your vehicle is ready."]].map(x=>`<div class="alert-card"><b>✓</b><div><h3>${x[0]}</h3><p>${x[1]}</p><small>Today</small></div></div>`).join("")}</div><button class="btn primary row" data-go="history">View Service History</button>`,{title:"Customer App",customer:true,hideNav:true});
}
function settings(){
  state.screen="settings";
  shell(`<div class="card"><h3>Business Defaults</h3><div class="field"><label>Business Name</label><input id="bizName" value="${esc(state.business.name)}"></div><div class="grid two"><div class="field"><label>Labor / hr</label><input id="labor" type="number" value="${state.business.labor}"></div><div class="field"><label>Service Call Fee</label><input id="serviceFee" type="number" value="${state.business.service}"></div><div class="field"><label>Tax %</label><input id="tax" type="number" step=".01" value="${state.business.tax}"></div><div class="field"><label>Accent</label><input id="accent" type="color" value="${state.business.accent}"></div></div><button class="btn primary row" id="saveBiz" type="button">Save Defaults</button></div>
  <div class="card"><h3>Integrations</h3>${["Live AI API","Payments","SMS / Email","Service History / CARFAX"].map(x=>`<div class="job"><span>${x}</span><button class="btn secondary integration" type="button" data-int="${x}">Not Connected</button></div>`).join("")}<p class="sub">The test build runs a local symptom-based assessment engine so no private API key is exposed in browser code.</p></div>
  <div class="card"><h3>Test Data</h3><button class="btn danger-btn row" id="resetApp" type="button">Reset App Test Data</button></div>`);
  $("#saveBiz").onclick=()=>{Object.assign(state.business,{name:$("#bizName").value,labor:Number($("#labor").value)||75,service:Number($("#serviceFee").value)||0,tax:Number($("#tax").value)||0,accent:$("#accent").value});document.documentElement.style.setProperty("--accent",state.business.accent);saveState();notify("Business defaults saved.")};
  $$(".integration").forEach(b=>b.onclick=()=>notify(`${b.dataset.int} requires a live backend/provider connection. It is intentionally not faked in this static build.`));
  $("#resetApp").onclick=()=>{if(confirm("Reset all test data in this browser?")){state=clone(DEFAULT_STATE);saveState();render()}};
}
function jobs(){state.screen="jobs";shell(`<div class="card"><h2>Jobs</h2>${state.job.states?`<div class="job"><div><b>${esc(vehicleLabel())}</b><div class="sub">${esc(state.job.customer||"Customer")}</div></div><button class="btn secondary" data-go="${state.job.status==="Complete"?"complete":"workup"}" type="button">Open</button></div>`:`<div class="mutedbox">No jobs yet.</div>`}</div>`)}
function history(){state.screen="history";shell(`<div class="card"><h2>Vehicle History</h2>${state.job.status==="Complete"?`<div class="job"><div><b>${esc(vehicleLabel())}</b><div class="sub">${esc(state.job.finding)} • ${esc(state.job.mileage)} mi</div></div><button class="btn secondary" data-go="complete" type="button">Open</button></div>`:`<div class="mutedbox">Complete a job to create its first history record.</div>`}</div>`)}
function newJob(){state.screen="new";shell(`<div class="card"><h2>New Job</h2><p class="sub">Choose the workflow for this request.</p><div class="grid two"><button class="btn primary typeJob" data-type="Repair / Diagnosis" type="button">Repair / Diagnostic</button><button class="btn secondary typeJob" data-type="Maintenance" type="button">Maintenance</button><button class="btn secondary typeJob" data-type="Pre-Purchase Inspection" type="button">Pre-Purchase Inspection</button><button class="btn secondary typeJob" data-type="Roadside / Tow" type="button">Roadside / Tow</button><button class="btn secondary typeJob" data-type="Fleet / Diesel" type="button">Fleet / Semi-Diesel</button></div></div>`);$$(".typeJob").forEach(b=>b.onclick=()=>{state.job.serviceType=b.dataset.type;state.intakeStep=1;saveState();go("intake")})}

function render(){
  document.documentElement.style.setProperty("--accent",state.business.accent||"#d61f2c");
  const params=new URLSearchParams(location.search);
  if(!deepLinkHandled){
    if(location.hash==="#intake")state.screen="intake";
    else if(location.hash.startsWith("#approval-")||params.has("approval"))state.screen="approval";
    deepLinkHandled=true;
  }
  if(!state.setupAccepted&&state.screen!=="setup"&&location.hash!=="#intake"&&!location.hash.startsWith("#approval-")&&!params.has("approval"))state.screen="setup";
  const map={setup,dashboard,jobs,new:newJob,history,settings,intake,workup,inspection,findings,quote,approval,invoice,payment,complete,carfax,customerAlerts};
  (map[state.screen]||dashboard)();
}
render();
