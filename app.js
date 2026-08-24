const defaultState={
  screen:'dashboard',
  mode:'Repair / Diagnostic',
  business:{
    name:"Caesar's Mobile Mechanic",
    labor:120,tax:7.25,diag:135,service:45,after:175,shop:12.5,accent:'#d11f2f'
  },
  job:{
    customer:'James Taylor',
    phone:'(555) 555-0188',
    address:'Mesa, AZ 85201',
    vehicle:'2021 Toyota Tacoma TRD Off Road',
    year:'2021',make:'Toyota',model:'Tacoma',trim:'TRD Off Road',engine:'3.5L V6',drivetrain:'4WD',
    vin:'3TMCZ5AN1MM123456',
    states:'Customer states engine is shaking at idle and the check engine light is on.',
    finding:'Cylinder 2 misfire confirmed. Ignition coil failing intermittently.',
    parts:[{d:'Ignition Coil',q:1,p:89.99}],
    labor:[{d:'Diagnose misfire / replace coil',h:1.2,r:120}],
    status:'Diagnosing',
    diagnostics:['Scan codes / freeze-frame','Coil swap confirmation'],
    approval:null,
    payment:null,
    attachments:[]
  }
};

function clone(x){return JSON.parse(JSON.stringify(x))}
function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem('mobileMechanicState')||'null');
    return saved?Object.assign(clone(defaultState),saved):clone(defaultState);
  }catch(e){return clone(defaultState)}
}
let state=loadState();

const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];
const app=$('#app');

function saveState(){
  localStorage.setItem('mobileMechanicState',JSON.stringify(state));
}
function money(n){return '$'+Number(n||0).toFixed(2)}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function calc(){
  const parts=state.job.parts.reduce((a,x)=>a+(Number(x.q)||0)*(Number(x.p)||0),0);
  const labor=state.job.labor.reduce((a,x)=>a+(Number(x.h)||0)*(Number(x.r)||0),0);
  const fee=Number(state.business.service)||0;
  const sub=parts+labor+fee;
  const tax=sub*((Number(state.business.tax)||0)/100);
  return{parts,labor,fee,sub,tax,total:sub+tax}
}
function toast(msg){
  let t=document.createElement('div');
  t.textContent=msg;
  Object.assign(t.style,{position:'fixed',left:'50%',bottom:'95px',transform:'translateX(-50%)',background:'#202024',color:'#fff',padding:'10px 14px',borderRadius:'10px',zIndex:99,maxWidth:'85%',textAlign:'center',boxShadow:'0 8px 24px rgba(0,0,0,.35)'});
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2200);
}
function applyAccent(){
  document.documentElement.style.setProperty('--accent',state.business.accent||'#d11f2f');
}
function shell(content,title='Mobile Mechanic AI'){
  applyAccent();
  app.innerHTML=`<div class="app"><header class="topbar"><div class="brand"><div class="logo">🔧</div><div>${esc(title)}</div></div><span class="pill">Working build</span></header><main class="screen">${content}</main>${nav()}</div>`;
  bindNav();
}
function nav(){
  const items=[['dashboard','⌂','Home'],['jobs','🧰','Jobs'],['new','＋','New'],['history','🚗','History'],['settings','☰','More']];
  return `<nav class="nav">${items.map(([k,i,l])=>`<button data-nav="${k}" class="${state.screen===k?'active':''} ${k==='new'?'plus':''}">${k==='new'?`<span>${i}</span>`:i}<div>${l}</div></button>`).join('')}</nav>`
}
function bindNav(){
  $$('[data-nav]').forEach(b=>b.onclick=()=>{state.screen=b.dataset.nav;saveState();render()})
}
function bindGo(){
  $$('[data-go]').forEach(b=>b.onclick=()=>{state.screen=b.dataset.go;saveState();render()})
}
function safeShare(title,text,url=location.href){
  if(navigator.share) return navigator.share({title,text,url}).catch(()=>{});
  if(navigator.clipboard) return navigator.clipboard.writeText(text+'\n'+url).then(()=>toast('Copied to clipboard'));
  prompt('Copy this:',text+'\n'+url);
}
function listenTo(targetId){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Voice dictation is not supported in this browser.');return}
  const r=new SR(); r.lang='en-US'; r.interimResults=false; r.maxAlternatives=1;
  toast('Listening…');
  r.onresult=e=>{
    const text=e.results[0][0].transcript;
    const el=document.getElementById(targetId);
    el.value=(el.value?el.value+' ':'')+text;
    el.dispatchEvent(new Event('input'));
  };
  r.onerror=()=>toast('Voice dictation stopped.');
  r.start();
}
function makeLocalAssessment(text){
  const s=(text||'').toLowerCase();
  let causes=[],plan=[],parts=[],laborDesc='Diagnostic inspection',hours=1.0;
  if(/misfire|shak|rough|check engine/.test(s)){
    causes=['Ignition coil or spark plug fault','Fuel injector / wiring fault','Vacuum or compression issue'];
    plan=['Scan DTCs and freeze-frame data','Identify affected cylinder(s)','Swap coil / inspect plug and retest','Verify injector command and compression if misfire remains'];
    parts=[{d:'Spark Plug / Ignition Coil (verify)',q:1,p:0}];
    laborDesc='Diagnose engine misfire'; hours=1.2;
  }else if(/brake|squeal|grind|stop/.test(s)){
    causes=['Worn brake pads','Rotor damage or runout','Caliper / hydraulic issue'];
    plan=['Inspect pad thickness and rotor condition','Check caliper slide movement','Inspect for leaks and verify pedal feel','Road test after repair'];
    parts=[{d:'Brake parts (verify axle / fitment)',q:1,p:0}];
    laborDesc='Brake inspection / diagnosis'; hours=1.0;
  }else if(/start|crank|click|no start/.test(s)){
    causes=['Battery / cable voltage drop','Starter circuit fault','Fuel / ignition / security issue'];
    plan=['Verify battery state and voltage drop','Check starter command and relay output','Scan immobilizer / PCM codes','Verify fuel pressure and ignition as applicable'];
    parts=[{d:'Starting-system part (verify)',q:1,p:0}];
    laborDesc='No-start diagnosis'; hours=1.0;
  }else if(/overheat|hot|coolant/.test(s)){
    causes=['Low coolant / leak','Thermostat or water pump issue','Cooling fan / airflow issue'];
    plan=['Pressure-test cooling system','Verify coolant level and circulation','Command cooling fans / inspect airflow','Check thermostat behavior and temperature data'];
    parts=[{d:'Cooling-system part (verify)',q:1,p:0}];
    laborDesc='Cooling-system diagnosis'; hours=1.2;
  }else{
    causes=['Additional diagnosis required','Electrical / mechanical fault related to complaint','Maintenance or wear-related condition'];
    plan=['Verify customer complaint','Scan for codes and review live data','Perform visual / functional inspection','Test the most likely system before replacing parts'];
  }
  return {causes,plan,parts,laborDesc,hours};
}
async function decodeVin(vin){
  vin=(vin||'').trim().toUpperCase();
  if(vin.length!==17){toast('VIN must be 17 characters.');return}
  toast('Decoding VIN…');
  try{
    const u=`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;
    const res=await fetch(u);
    if(!res.ok) throw new Error('VIN service error');
    const j=await res.json(),x=j.Results&&j.Results[0];
    if(!x) throw new Error('No VIN result');
    state.job.vin=vin;
    state.job.year=x.ModelYear||state.job.year;
    state.job.make=x.Make||state.job.make;
    state.job.model=x.Model||state.job.model;
    state.job.trim=x.Trim||x.Series||state.job.trim;
    state.job.engine=[x.DisplacementL?x.DisplacementL+'L':'',x.EngineConfiguration||'',x.EngineCylinders?x.EngineCylinders+' cyl':''].filter(Boolean).join(' ');
    state.job.drivetrain=x.DriveType||state.job.drivetrain;
    state.job.vehicle=[state.job.year,state.job.make,state.job.model,state.job.trim].filter(Boolean).join(' ');
    saveState(); render(); toast('VIN decoded');
  }catch(e){toast('VIN lookup failed. You can enter the vehicle manually.')}
}
function useLocation(){
  if(!navigator.geolocation){toast('Location is not supported in this browser.');return}
  toast('Getting location…');
  navigator.geolocation.getCurrentPosition(p=>{
    state.job.address=`GPS: ${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
    saveState(); render(); toast('Location added');
  },()=>toast('Location permission was not granted.'),{enableHighAccuracy:true,timeout:10000});
}
function pickFiles(kind='attachments'){
  const input=document.createElement('input');
  input.type='file'; input.multiple=true; input.accept='image/*,video/*,application/pdf';
  input.onchange=()=>{
    [...input.files].forEach(f=>state.job.attachments.push({name:f.name,type:f.type,size:f.size,kind}));
    saveState(); render(); toast(`${input.files.length} file(s) added`);
  };
  input.click();
}
function dashboard(){
  shell(`<div class="kpis"><div class="kpi"><b>3</b><div class="sub">Today</div></div><div class="kpi"><b>1</b><div class="sub">New request</div></div><div class="kpi"><b>$742</b><div class="sub">Today</div></div></div>
  <div class="card"><h3>Quick actions</h3><div class="grid two"><button class="btn primary" id="shareIntake">Send Intake Link</button><button class="btn secondary" data-go="workup">Open AI Workup</button><button class="btn secondary" data-go="findings">Voice Findings</button><button class="btn secondary" data-go="quote">Create Quote</button></div></div>
  <div class="card"><h3>Today</h3><div class="job"><div><b>${esc(state.job.vehicle)}</b><div class="sub">${esc(state.job.customer)} • 10:30 AM</div></div><span class="pill">${esc(state.job.status)}</span></div><div class="job"><div><b>2018 Ford F-150</b><div class="sub">Maria G. • 1:00 PM</div></div><span class="pill">Scheduled</span></div></div>
  <div class="card"><h3>Workflow</h3><div class="steps">${['Intake','AI Workup','Findings','Quote','Approval','Invoice','Payment','Complete'].map((x,i)=>`<span class="step ${i<3?'on':''}">${x}</span>`).join('')}</div></div>`);
  bindGo();
  $('#shareIntake').onclick=()=>safeShare('Customer Intake','Please complete your vehicle intake form.',location.href.split('#')[0]+'#intake');
}
function intake(){
  state.screen='intake';
  shell(`<div class="card"><h3>${esc(state.mode)} — Customer Intake</h3><p class="sub">Customer can type or use voice. VIN lookup is powered by the public NHTSA decoder when internet access is available.</p>
    <div class="grid two">
      <div class="field"><label>Name</label><input id="customer" value="${esc(state.job.customer)}"></div>
      <div class="field"><label>Phone</label><input id="phone" value="${esc(state.job.phone)}"></div>
    </div>
    <div class="field"><label>Service address / location</label><input id="address" value="${esc(state.job.address)}"></div>
    <button class="btn secondary" id="useLocation">📍 Use my location</button>
  </div>
  <div class="card"><h3>Vehicle</h3>
    <div class="field"><label>VIN</label><input id="vin" maxlength="17" value="${esc(state.job.vin)}"></div>
    <button class="btn secondary" id="decodeVin">Decode VIN</button>
    <div class="grid two" style="margin-top:10px">
      <div class="field"><label>Year</label><input id="year" value="${esc(state.job.year)}"></div>
      <div class="field"><label>Make</label><input id="make" value="${esc(state.job.make)}"></div>
      <div class="field"><label>Model</label><input id="model" value="${esc(state.job.model)}"></div>
      <div class="field"><label>Trim / Sub-model</label><input id="trim" value="${esc(state.job.trim)}"></div>
      <div class="field"><label>Engine</label><input id="engine" value="${esc(state.job.engine)}"></div>
      <div class="field"><label>Drivetrain</label><input id="drivetrain" value="${esc(state.job.drivetrain)}"></div>
    </div>
  </div>
  <div class="card"><h3>Customer States</h3><div class="field"><textarea id="states">${esc(state.job.states)}</textarea></div>
    <div class="actions"><button class="btn primary" id="voiceStates">🎙 Voice input</button><button class="btn secondary" id="addMedia">📷 Add photos/video</button></div>
    ${state.job.attachments.length?`<p class="sub" style="margin-top:10px">${state.job.attachments.map(a=>esc(a.name)).join(' • ')}</p>`:''}
  </div>
  <button class="btn primary row" id="submitIntake">Submit Intake + Build Workup</button>`);
  const ids=['customer','phone','address','vin','year','make','model','trim','engine','drivetrain','states'];
  ids.forEach(id=>$('#'+id).oninput=e=>{
    state.job[id]=e.target.value;
    if(['year','make','model','trim'].includes(id)) state.job.vehicle=[state.job.year,state.job.make,state.job.model,state.job.trim].filter(Boolean).join(' ');
    saveState();
  });
  $('#useLocation').onclick=useLocation;
  $('#decodeVin').onclick=()=>decodeVin($('#vin').value);
  $('#voiceStates').onclick=()=>listenTo('states');
  $('#addMedia').onclick=()=>pickFiles('intake');
  $('#submitIntake').onclick=()=>{saveState();state.screen='workup';render()}
}
function workup(){
  state.screen='workup';
  const a=makeLocalAssessment(state.job.states);
  shell(`<div class="steps">${['Overview','Diagnostic Plan','Parts','Labor','Repair Videos'].map((x,i)=>`<span class="step ${i===0?'on':''}">${x}</span>`).join('')}</div>
  <div class="card danger"><h3>AI / RULE-BASED PRE-WORKUP</h3><p class="sub">This build creates an immediate local assessment from the complaint. A production AI model can replace this when an API is connected. Technician verification is required.</p></div>
  <div class="card"><h3>Customer States</h3><p>${esc(state.job.states)}</p></div>
  <div class="card"><h3>Likely causes</h3><ol>${a.causes.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>
  <div class="card"><h3>Diagnostic plan</h3>${a.plan.map((x,i)=>`<p>${i+1}. ${esc(x)}</p>`).join('')}</div>
  <div class="card"><h3>Suggested labor</h3><div class="grid two"><div class="field"><label>Suggested hours — verify</label><input id="laborHours" type="number" step="0.1" value="${a.hours}"></div><div class="field"><label>Business rate</label><input id="laborRate" type="number" value="${state.business.labor}"></div></div><button class="btn secondary" id="applySuggestion">Apply to quote</button></div>
  <div class="card"><h3>Repair Videos</h3><button class="btn secondary row" id="repairVideos">Search YouTube for this repair</button></div>
  <button class="btn primary row" data-go="findings">Continue to Technician Findings</button>`);
  $('#applySuggestion').onclick=()=>{
    state.job.labor=[{d:a.laborDesc,h:Number($('#laborHours').value)||a.hours,r:Number($('#laborRate').value)||state.business.labor}];
    if(a.parts.length && state.job.parts.length===0) state.job.parts=a.parts;
    saveState();toast('Suggestion applied to quote')
  };
  $('#repairVideos').onclick=()=>{
    const q=encodeURIComponent(`${state.job.vehicle} ${state.job.states} repair`);
    window.open(`https://www.youtube.com/results?search_query=${q}`,'_blank');
  };
  bindGo();
}
function findings(){
  state.screen='findings';
  shell(`<div class="card"><h3>Customer States</h3><p class="sub">Preserved from intake</p><p>${esc(state.job.states)}</p></div>
  <div class="card"><h3>Technician Findings</h3><div class="field"><textarea id="finding">${esc(state.job.finding)}</textarea></div><div class="actions"><button class="btn primary" id="voiceFinding">🎙 Dictate findings</button><button class="btn secondary" id="addEvidence">📷 Add evidence</button></div></div>
  <div class="card"><h3>Diagnostics performed</h3>
    ${['Scan codes / freeze-frame','Visual inspection','Voltage / pressure test','Road test','Coil swap confirmation','Injector test'].map(x=>`<label class="check"><input class="diag" type="checkbox" value="${esc(x)}" ${state.job.diagnostics.includes(x)?'checked':''}><span>${esc(x)}</span></label>`).join('')}
  </div>
  <button class="btn primary row" id="saveFinding">Update draft quote</button>`);
  $('#finding').oninput=e=>{state.job.finding=e.target.value;saveState()};
  $('#voiceFinding').onclick=()=>listenTo('finding');
  $('#addEvidence').onclick=()=>pickFiles('evidence');
  $$('.diag').forEach(c=>c.onchange=()=>{
    state.job.diagnostics=$$('.diag:checked').map(x=>x.value);saveState()
  });
  $('#saveFinding').onclick=()=>{state.screen='quote';saveState();render()}
}
function quote(){
  state.screen='quote'; const c=calc();
  shell(`<div class="card"><h3>Quote / Estimate</h3><p class="sub">Everything below is editable.</p><p><b>${esc(state.job.vehicle)}</b><br><span class="sub">${esc(state.job.customer)}</span></p></div>
  <div class="card"><h3>Technician Findings</h3><p>${esc(state.job.finding)}</p></div>
  <div class="card"><h3>Parts</h3><div id="partsList">${state.job.parts.map((x,i)=>partRow(x,i)).join('')}</div><button class="btn secondary" id="addPart">+ Add part</button></div>
  <div class="card"><h3>Labor</h3><div id="laborList">${state.job.labor.map((x,i)=>laborRow(x,i)).join('')}</div><button class="btn secondary" id="addLabor">+ Add labor</button></div>
  <div class="card"><div class="grid two"><div><div class="sub">Parts</div><b>${money(c.parts)}</b></div><div><div class="sub">Labor</div><b>${money(c.labor)}</b></div><div><div class="sub">Service fee</div><b>${money(c.fee)}</b></div><div><div class="sub">Tax (${state.business.tax}%)</div><b>${money(c.tax)}</b></div></div><hr style="border-color:#303034"><div class="total">${money(c.total)}</div></div>
  <div class="grid two"><button class="btn secondary" data-go="approval">Approve Here</button><button class="btn primary" id="secureApproval">Send Secure Approval Link</button></div>`);
  bindQuoteInputs();
  $('#addPart').onclick=()=>{state.job.parts.push({d:'New part',q:1,p:0});saveState();render()};
  $('#addLabor').onclick=()=>{state.job.labor.push({d:'Additional labor',h:1,r:state.business.labor});saveState();render()};
  $('#secureApproval').onclick=()=>{
    const token=btoa(unescape(encodeURIComponent(JSON.stringify({customer:state.job.customer,vehicle:state.job.vehicle,total:calc().total})))).slice(0,24);
    const url=location.href.split('#')[0]+'#approval-'+token;
    safeShare('Estimate Approval',`Estimate for ${state.job.vehicle}: ${money(calc().total)}. Open to review/approve.`,url);
  };
  bindGo();
}
function partRow(x,i){return `<div class="lineitem"><div class="field"><label>Description</label><input data-part="${i}" data-k="d" value="${esc(x.d)}"></div><div class="field"><label>Qty</label><input data-part="${i}" data-k="q" type="number" step="1" value="${x.q}"></div><div class="field"><label>Price</label><input data-part="${i}" data-k="p" type="number" step=".01" value="${x.p}"></div></div><button class="btn secondary" data-remove-part="${i}" style="margin:6px 0 12px">Remove</button>`}
function laborRow(x,i){return `<div class="lineitem"><div class="field"><label>Description</label><input data-labor="${i}" data-k="d" value="${esc(x.d)}"></div><div class="field"><label>Hours</label><input data-labor="${i}" data-k="h" type="number" step=".1" value="${x.h}"></div><div class="field"><label>Rate</label><input data-labor="${i}" data-k="r" type="number" step=".01" value="${x.r}"></div></div><button class="btn secondary" data-remove-labor="${i}" style="margin:6px 0 12px">Remove</button>`}
function bindQuoteInputs(){
  $$('[data-part]').forEach(el=>el.onchange=()=>{let i=+el.dataset.part,k=el.dataset.k;state.job.parts[i][k]=k==='d'?el.value:Number(el.value);saveState();render()});
  $$('[data-labor]').forEach(el=>el.onchange=()=>{let i=+el.dataset.labor,k=el.dataset.k;state.job.labor[i][k]=k==='d'?el.value:Number(el.value);saveState();render()});
  $$('[data-remove-part]').forEach(b=>b.onclick=()=>{state.job.parts.splice(+b.dataset.removePart,1);saveState();render()});
  $$('[data-remove-labor]').forEach(b=>b.onclick=()=>{state.job.labor.splice(+b.dataset.removeLabor,1);saveState();render()});
}
function approval(){
  state.screen='approval'; const c=calc();
  shell(`<div class="card"><h3>Customer Approval</h3><p class="sub">Approval records the current estimate total and timestamp on this device.</p></div>
  <div class="card"><h3>Estimate summary</h3><div class="total">${money(c.total)}</div><p class="sub">Parts ${money(c.parts)} • Labor ${money(c.labor)} • Fees/tax included</p></div>
  <label class="check"><input type="checkbox" id="approveCheck"><span>I authorize the listed work and understand additional work requires additional approval.</span></label>
  <div class="field"><label>Customer name / signature</label><input id="approvalName" value="${esc(state.job.customer)}"></div>
  <button class="btn primary row" id="approveBtn">Customer Confirms</button>`);
  $('#approveBtn').onclick=()=>{
    if(!$('#approveCheck').checked)return toast('Customer acknowledgement is required.');
    state.job.approval={name:$('#approvalName').value||state.job.customer,amount:calc().total,at:new Date().toISOString()};
    state.job.status='Approved';saveState();state.screen='invoice';render()
  }
}
function invoice(){
  state.screen='invoice'; const c=calc();
  shell(`<div class="card"><h3>Invoice</h3><p><b>INV-${String(Date.now()).slice(-6)}</b> <span class="pill status">${state.job.approval?'Approved quote':'Draft'}</span></p><p class="sub">${esc(state.job.customer)} • ${esc(state.job.vehicle)}</p></div>
  <div class="card"><h3>Totals</h3><div class="job"><span>Parts</span><b>${money(c.parts)}</b></div><div class="job"><span>Labor</span><b>${money(c.labor)}</b></div><div class="job"><span>Service fee</span><b>${money(c.fee)}</b></div><div class="job"><span>Tax</span><b>${money(c.tax)}</b></div><div class="total" style="margin-top:12px">${money(c.total)}</div></div>
  <div class="card"><h3>Payment methods</h3><div class="actions">${['Square','Cash App','Venmo','PayPal','Zelle','Cash'].map(x=>`<span class="pill">${x}</span>`).join('')}</div><p class="sub">External payment apps require their own account/API connection. Cash can be recorded directly.</p></div>
  <div class="field"><label>Invoice notes</label><textarea id="invoiceNotes">Thank you for your business.</textarea></div>
  <div class="grid two"><button class="btn secondary" id="printInvoice">Print / Save PDF</button><button class="btn primary" data-go="payment">Proceed to Payment</button></div>`);
  $('#printInvoice').onclick=()=>window.print(); bindGo()
}
function payment(){
  state.screen='payment'; const c=calc();
  shell(`<div class="card"><h3>Payment + Receipt</h3><div class="total">${money(c.total)}</div><p class="sub">Select the method actually received.</p></div>
  <div class="card"><h3>Select payment method</h3><div class="grid two">${['Square','Cash App','Venmo','PayPal','Zelle','Cash'].map(x=>`<button class="btn secondary paymethod" data-pay="${x}">${x}</button>`).join('')}</div></div>
  <div class="card"><h3>Receipt delivery</h3><div class="grid two"><button class="btn secondary" id="shareReceipt">Share receipt</button><button class="btn secondary" id="printReceipt">Print / Save PDF</button></div></div>
  <button class="btn success row" id="paid" disabled>Record Payment Received</button>`);
  let method=state.job.payment&&state.job.payment.method||'';
  const paid=$('#paid');
  function select(m){method=m;paid.disabled=false;$$('.paymethod').forEach(b=>b.classList.toggle('primary',b.dataset.pay===m))}
  $$('.paymethod').forEach(b=>b.onclick=()=>select(b.dataset.pay));
  if(method)select(method);
  $('#shareReceipt').onclick=()=>safeShare('Receipt',`${state.job.customer} — ${state.job.vehicle} — ${money(c.total)}`);
  $('#printReceipt').onclick=()=>window.print();
  paid.onclick=()=>{state.job.payment={method,amount:c.total,at:new Date().toISOString()};state.job.status='Paid';saveState();state.screen='complete';render()}
}
function complete(){
  state.screen='complete'; const c=calc();
  shell(`<div class="card"><h3>✓ Job Completed</h3><p class="sub">Service record is saved locally in this browser.</p><p><b>${esc(state.job.vehicle)}</b><br>${esc(state.job.customer)}</p></div>
  <div class="card"><h3>Final technician findings</h3><p>${esc(state.job.finding)}</p></div>
  <div class="card"><h3>Invoice & Payment</h3><div class="total">${money(c.total)}</div><span class="pill status">${state.job.payment?'Paid via '+esc(state.job.payment.method):'Not recorded'}</span></div>
  <div class="card"><h3>Documents & Receipts</h3>${state.job.attachments.length?state.job.attachments.map(a=>`<div class="job"><span>${esc(a.kind)}</span><b>${esc(a.name)}</b></div>`).join(''):'<p class="sub">No attachments yet.</p>'}<button class="btn secondary" id="addDoc">+ Add document / receipt photo</button></div>
  <div class="card"><h3>CARFAX / Service History</h3><div class="mutedbox">Not connected. A real service-history provider account/API is required before this app can submit records.</div></div>
  <div class="grid two"><button class="btn secondary" id="printFinal">Print Invoice</button><button class="btn secondary" id="shareSummary">Share Job Summary</button><button class="btn primary" data-go="dashboard">Done</button></div>`);
  $('#addDoc').onclick=()=>pickFiles('document');
  $('#printFinal').onclick=()=>window.print();
  $('#shareSummary').onclick=()=>safeShare('Job Summary',`${state.job.customer}\n${state.job.vehicle}\n${state.job.finding}\nTotal: ${money(c.total)}`);
  bindGo()
}
function settings(){
  state.screen='settings';
  shell(`<div class="card"><h3>Business Setup</h3><div class="field"><label>Business name</label><input id="bizName" value="${esc(state.business.name)}"></div><div class="grid two">
    <div class="field"><label>Standard labor / hr</label><input id="labor" type="number" value="${state.business.labor}"></div>
    <div class="field"><label>Diagnostic rate</label><input id="diag" type="number" value="${state.business.diag}"></div>
    <div class="field"><label>Service call fee</label><input id="serviceFee" type="number" value="${state.business.service}"></div>
    <div class="field"><label>After-hours / hr</label><input id="after" type="number" value="${state.business.after}"></div>
    <div class="field"><label>Shop/supply fee</label><input id="shop" type="number" value="${state.business.shop}"></div>
    <div class="field"><label>Tax %</label><input id="tax" type="number" step=".01" value="${state.business.tax}"></div>
  </div><div class="field"><label>Accent color</label><input id="accent" type="color" value="${state.business.accent}"></div><button class="btn primary row" id="saveBiz">Save Defaults</button></div>
  <div class="card"><h3>Integrations</h3>
    <div class="job"><span>NHTSA VIN decoder</span><span class="pill status">Available</span></div>
    <div class="job"><span>Browser speech-to-text</span><span class="pill">Device dependent</span></div>
    <div class="job"><span>Square</span><span class="pill">Needs account/API</span></div>
    <div class="job"><span>CARFAX / service history</span><span class="pill">Needs provider access</span></div>
  </div>
  <button class="btn secondary row" id="resetDemo">Reset local demo data</button>`);
  $('#saveBiz').onclick=()=>{
    Object.assign(state.business,{
      name:$('#bizName').value,labor:+$('#labor').value,diag:+$('#diag').value,service:+$('#serviceFee').value,
      after:+$('#after').value,shop:+$('#shop').value,tax:+$('#tax').value,accent:$('#accent').value
    });
    saveState();applyAccent();toast('Business defaults saved');
  };
  $('#resetDemo').onclick=()=>{if(confirm('Reset all locally saved demo data?')){state=clone(defaultState);saveState();render()}}
}
function jobs(){
  state.screen='jobs';
  shell(`<div class="card"><h3>Jobs</h3><div class="job"><div><b>${esc(state.job.vehicle)}</b><div class="sub">${esc(state.job.customer)}</div></div><button class="btn secondary" data-go="workup">Open</button></div><div class="job"><div><b>2018 Ford F-150</b><div class="sub">Maria G.</div></div><span class="pill">Scheduled</span></div></div>`);
  bindGo()
}
function history(){
  state.screen='history';
  shell(`<div class="card"><h3>Vehicle History</h3><div class="job"><div><b>${esc(state.job.vehicle)}</b><div class="sub">${state.job.payment?'Paid service record':'Current job'} • locally saved</div></div><button class="btn secondary" data-go="complete">Open</button></div></div>`);
  bindGo()
}
function newJob(){
  state.screen='new';
  shell(`<div class="card"><h3>New Job</h3><div class="grid two"><button class="btn primary mode" data-mode="Repair / Diagnostic">Repair / Diagnostic</button><button class="btn secondary mode" data-mode="Maintenance">Maintenance</button><button class="btn secondary mode" data-mode="Pre-Purchase Inspection">Pre-Purchase Inspection</button><button class="btn secondary mode" data-mode="Roadside">Roadside</button><button class="btn secondary mode" data-mode="Fleet / Diesel">Fleet / Diesel</button></div></div>`);
  $$('.mode').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;state.job.status='New';saveState();state.screen='intake';render()})
}
function render(){
  const map={dashboard,jobs,new:newJob,history,settings,intake,workup,findings,quote,approval,invoice,payment,complete};
  (map[state.screen]||dashboard)()
}
window.addEventListener('hashchange',()=>{
  if(location.hash==='#intake'){state.screen='intake';render()}
  if(location.hash.startsWith('#approval-')){state.screen='approval';render()}
});
if(location.hash==='#intake')state.screen='intake';
if(location.hash.startsWith('#approval-'))state.screen='approval';
render();
