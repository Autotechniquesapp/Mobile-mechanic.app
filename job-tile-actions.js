(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
const read=()=>{try{return JSON.parse(localStorage.getItem(DBKEY))||{};}catch{return {};}};
const write=db=>localStorage.setItem(DBKEY,JSON.stringify(db));
const esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const ic=name=>`<svg class="svg-icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const vehicleText=v=>[v?.year,v?.make,v?.model,v?.trim||v?.submodel].filter(Boolean).join(' ')||'Vehicle details pending';
function ensureStyles(){if(document.getElementById('jobTileActionsDarkStyles'))return;const s=document.createElement('style');s.id='jobTileActionsDarkStyles';s.textContent=`
[data-job-tile-actions-modal]{background:rgba(0,0,0,.78)!important;backdrop-filter:blur(6px);padding:14px!important;}
[data-job-tile-actions-modal] .modal{background:#07090c!important;color:#f7f7f8!important;border:1px solid rgba(239,42,49,.72)!important;box-shadow:0 22px 70px rgba(0,0,0,.7),0 0 0 1px rgba(239,42,49,.22)!important;max-height:92vh;overflow:auto;}
[data-job-tile-actions-modal] .modal-head{border-bottom:1px solid rgba(239,42,49,.35)!important;background:#0d1117!important;color:#fff!important;}
[data-job-tile-actions-modal] h2,[data-job-tile-actions-modal] h3,[data-job-tile-actions-modal] b{color:#fff!important;}
[data-job-tile-actions-modal] p,[data-job-tile-actions-modal] td{color:#d7dbe3!important;}
[data-job-tile-actions-modal] .job-banner,[data-job-tile-actions-modal] .work-card{background:#101319!important;color:#f7f7f8!important;border:1px solid rgba(239,42,49,.38)!important;border-radius:8px!important;}
[data-job-tile-actions-modal] .avatar{background:#ef2a31!important;color:#fff!important;}
[data-job-tile-actions-modal] .table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.1)!important;border-radius:8px!important;background:#080a0f!important;}
[data-job-tile-actions-modal] table{width:100%;border-collapse:collapse;background:#080a0f!important;color:#f7f7f8!important;}
[data-job-tile-actions-modal] th,[data-job-tile-actions-modal] td{background:#080a0f!important;border-bottom:1px solid rgba(255,255,255,.08)!important;padding:10px;text-align:left;vertical-align:top;}
[data-job-tile-actions-modal] th{color:#ff5b61!important;width:38%;font-weight:800;}
[data-job-tile-actions-modal] .btn-soft{background:#171b22!important;color:#fff!important;border:1px solid rgba(255,255,255,.14)!important;}
[data-job-tile-actions-modal] .btn-primary{background:#ef2a31!important;color:#fff!important;border-color:#ef2a31!important;}
[data-job-tile-actions-modal] .btn-danger{background:#7f1117!important;color:#fff!important;border-color:#ef2a31!important;}
[data-job-tile-actions-modal] .btn-green{background:#167a3d!important;color:#fff!important;border-color:#22a35a!important;}
[data-job-tile-actions-modal] .close-btn{background:#171b22!important;color:#fff!important;border:1px solid rgba(255,255,255,.18)!important;}
.mma-completed-hidden{display:none!important;}
.mma-completed-section{margin-top:14px;background:#0d1117!important;border:1px solid rgba(239,42,49,.38)!important;border-radius:8px!important;padding:10px!important;color:#f7f7f8!important;}
.mma-completed-section summary{cursor:pointer;font-weight:900;color:#fff!important;list-style:none;display:flex;justify-content:space-between;gap:12px;align-items:center;}
.mma-completed-section summary::-webkit-details-marker{display:none;}
.mma-completed-section summary span{color:#ff5b61!important;font-weight:800;}
.mma-completed-list{display:grid;gap:8px;margin-top:10px;}
.mma-completed-job{width:100%;text-align:left;background:#080a0f!important;color:#f7f7f8!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:8px!important;padding:10px!important;}
.mma-completed-job b{display:block;color:#fff!important;}
.mma-completed-job small{color:#b8c0cc!important;}
.mma-vehicle-card{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;background:#080a0f!important;border:1px solid rgba(239,42,49,.45)!important;border-radius:8px!important;padding:12px!important;margin-bottom:10px!important;}
.mma-vehicle-icon{width:42px;height:42px;border-radius:8px;background:#ef2a31!important;color:#fff!important;display:grid;place-items:center;}
.mma-vehicle-main{min-width:0;}
.mma-vehicle-title{display:block;color:#fff!important;font-size:1.08rem!important;font-weight:900!important;line-height:1.25!important;margin-bottom:5px;}
.mma-vehicle-meta{display:flex;flex-wrap:wrap;gap:6px;}
.mma-vehicle-chip{background:#151922!important;border:1px solid rgba(255,255,255,.12)!important;color:#d7dbe3!important;border-radius:999px!important;padding:5px 8px!important;font-size:.86rem!important;}
.mma-clickable-name{cursor:pointer!important;text-decoration:underline;text-decoration-color:#ef2a31;text-underline-offset:3px;}
`;document.head.appendChild(s);}
function shop(){const db=read();return db.shops?.[db.session?.shopId]||null;}
function jobById(id){return shop()?.jobs?.find(j=>String(j.id)===String(id))||null;}
function scheduleEnd(start,j){const mins=Math.max(15,Math.round(Number(j.estimatedLaborHours||1)*60)+Number(j.travelMinutes||0)+Number(j.bufferMinutes??15));return new Date(new Date(start).getTime()+mins*60000);}
function scheduleWindow(j){if(!j?.scheduledStart)return j?.availability||j?.preferredTime||j?.preferredDate||'Schedule time not set';const start=new Date(j.scheduledStart),end=j.scheduledEnd?new Date(j.scheduledEnd):scheduleEnd(j.scheduledStart,j);return `${start.toLocaleDateString()} ${start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} - ${end.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;}
function toast(msg,type='good'){document.querySelector('.toast')?.remove();const d=document.createElement('div');d.className=`toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2700);}
function close(){document.querySelector('[data-job-tile-actions-modal]')?.remove();}
function setActive(id){const db=read();if(db.session){db.session.activeJobId=id;write(db);}}
function label(k){return String(k).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function plain(v){if(v==null||v==='')return '';if(Array.isArray(v))return v.filter(x=>x!=null&&x!=='').map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(', ');if(typeof v==='object')return '';return String(v);}
function fieldRows(obj,skip=new Set(),prefix=''){
  if(!obj||typeof obj!=='object')return [];
  const rows=[];
  Object.entries(obj).forEach(([k,v])=>{
    if(skip.has(k)||k.startsWith('_'))return;
    if(v==null||v===''||(Array.isArray(v)&&!v.length))return;
    if(typeof v==='object'&&!Array.isArray(v)){Object.entries(v).forEach(([ck,cv])=>{const pv=plain(cv);if(pv)rows.push([`${prefix}${label(k)} ${label(ck)}`,pv]);});return;}
    const pv=plain(v);if(pv)rows.push([`${prefix}${label(k)}`,pv]);
  });
  return rows;
}
function intakeRows(j){
  const skip=new Set(['id','customerId','assignedTo','createdAt','updatedAt','completedAt','cancelledAt','deletedAt','status','estimate','invoice','approval','photos','receipts','carfax','findings']);
  const rows=[['Customer',j.customerName||j.name],['Phone',j.phone],['Email',j.email],['Vehicle',vehicleText(j.vehicle)],['Complaint / Request',j.complaint||j.concern||j.description],['Preferred Time',scheduleWindow(j)],['Location',j.location||j.address]].filter(([,v])=>v&&v!=='Vehicle details pending');
  fieldRows(j.intake||j.intakeForm||j.form||j.request||{},new Set()).forEach(r=>rows.push(r));
  fieldRows(j,skip).forEach(r=>{if(!rows.some(([a])=>a===r[0]))rows.push(r);});
  return rows.slice(0,60);
}
function vehicleCard(j){
  const v=j.vehicle||{};
  const chips=[
    v.engine&&`Engine: ${v.engine}`,
    v.mileage&&`Mileage: ${v.mileage}`,
    v.drive&&`Drive: ${v.drive}`,
    v.plate&&`Plate: ${v.plate}`,
    v.vin&&`VIN: ${v.vin}`
  ].filter(Boolean);
  return `<div class="mma-vehicle-card"><div class="mma-vehicle-icon">${ic('car')}</div><div class="mma-vehicle-main"><b class="mma-vehicle-title">${esc(vehicleText(v))}</b><div class="mma-vehicle-meta">${chips.length?chips.map(x=>`<span class="mma-vehicle-chip">${esc(x)}</span>`).join(''):'<span class="mma-vehicle-chip">Vehicle details pending</span>'}</div></div></div>`;
}
function nameClickedInTile(e,tile,j){
  const hit=e.target.closest('button,a,[role="button"],b,strong,span,h2,h3,h4,p,small');
  if(!hit||!j)return false;
  const txt=(hit.textContent||'').trim().toLowerCase();
  const name=String(j.customerName||j.name||'').trim().toLowerCase();
  return !!name && txt.includes(name);
}
function patchCustomerNames(){
  document.querySelectorAll('[data-open-job],.mmp-job-row[data-job]').forEach(el=>{
    const j=jobById(el.dataset.openJob||el.dataset.job);
    const name=String(j?.customerName||j?.name||'').trim();
    if(!name)return;
    el.querySelectorAll('b,strong,span,h2,h3,h4,p,small,button,a').forEach(n=>{
      if((n.textContent||'').trim().includes(name))n.classList.add('mma-clickable-name');
    });
  });
}
function intakeTable(j){const rows=intakeRows(j);if(!rows.length)return '<p>No intake answers saved on this job.</p>';return `<div class="table-wrap"><table class="estimate-table"><tbody>${rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;}
function isCompleted(j){return String(j?.status||'').toLowerCase()==='completed'||!!j?.completedAt;}
function completedJobs(){const s=shop();const seen=new Set(),out=[];[...(s?.completedJobs||[]),...(s?.jobs||[]).filter(isCompleted)].forEach(j=>{const id=String(j.id||'');if(id&&!seen.has(id)){seen.add(id);out.push(j);}});return out.sort((a,b)=>String(b.completedAt||b.updatedAt||b.createdAt||'').localeCompare(String(a.completedAt||a.updatedAt||a.createdAt||'')));}
function tileLabel(j){return `${j.customerName||'Customer'} - ${vehicleText(j.vehicle)}`;}
function renderCompletedSection(){
  const route=(location.hash||'#dashboard').replace('#','').split('?')[0]||'dashboard';
  if(!['jobs','dashboard','calendar'].includes(route))return;
  const jobs=completedJobs();
  const root=document.querySelector('.content')||document.getElementById('app')||document.body;
  document.querySelectorAll('[data-open-job],.mmp-job-row[data-job]').forEach(el=>{
    const id=String(el.dataset.openJob||el.dataset.job||'');
    const j=jobById(id);
    if(j&&isCompleted(j))el.classList.add('mma-completed-hidden');
  });
  const existing=document.querySelector('[data-mma-completed-section]');
  if(!jobs.length){existing?.remove();return;}
  const sig=jobs.map(j=>String(j.id)+':' + String(j.completedAt||j.status||'')).join('|');
  if(existing?.dataset.sig===sig)return;
  existing?.remove();
  const details=document.createElement('details');
  details.className='mma-completed-section';
  details.dataset.mmaCompletedSection='1';
  details.dataset.sig=sig;
  details.innerHTML=`<summary>Completed Jobs <span>${jobs.length}</span></summary><div class="mma-completed-list">${jobs.map(j=>`<button class="mma-completed-job" type="button" data-mma-completed-open="${esc(j.id)}"><b>${esc(tileLabel(j))}</b><small>${esc(j.completedAt?new Date(j.completedAt).toLocaleString():'Completed')}</small></button>`).join('')}</div>`;
  root.appendChild(details);
}
function removeCompletedFromActive(id){document.querySelectorAll(`[data-open-job="${CSS.escape(String(id))}"],.mmp-job-row[data-job="${CSS.escape(String(id))}"]`).forEach(el=>el.classList.add('mma-completed-hidden'));}
function openNativeJob(id){const tile=document.querySelector(`[data-open-job="${CSS.escape(String(id))}"]`);if(tile){tile.dataset.mmaNativeOpen='1';close();tile.click();setTimeout(()=>delete tile.dataset.mmaNativeOpen,0);return;}location.hash='#jobs';}
function openSchedule(id){close();let btn=document.querySelector(`[data-action="schedule-job"][data-job="${CSS.escape(String(id))}"]`);if(btn){btn.click();return;}location.hash='#calendar';setTimeout(()=>document.querySelector(`[data-action="schedule-job"][data-job="${CSS.escape(String(id))}"]`)?.click(),250);}
function markTileCompleted(id){document.querySelectorAll(`[data-open-job="${CSS.escape(String(id))}"],.mmp-job-row[data-job="${CSS.escape(String(id))}"]`).forEach(tile=>{tile.classList.add('completed');tile.querySelectorAll('.badge,small,span,b').forEach(n=>{if(/AI Pre-Workup|Scheduled|In Progress|Needs Time|Awaiting Approval|Job/i.test(n.textContent||''))n.textContent=(n.textContent||'').replace(/AI Pre-Workup|Scheduled|In Progress|Needs Time|Awaiting Approval|Job/i,'Completed');});});}
function completeJob(id){const db=read(),s=db.shops?.[db.session?.shopId];if(!s?.jobs)return toast('Job not found.','bad');const j=s.jobs.find(x=>String(x.id)===String(id));if(!j)return toast('Job not found.','bad');j.status='Completed';j.completedAt=new Date().toISOString();j.carfax={...(j.carfax||{}),status:'Ready'};s.completedJobs=s.completedJobs||[];if(!s.completedJobs.some(x=>String(x.id)===String(id)))s.completedJobs.unshift({...j});write(db);markTileCompleted(id);removeCompletedFromActive(id);close();toast('Job marked completed.','good');location.hash='#jobs';setTimeout(()=>{renderCompletedSection();if(window.dispatchEvent)window.dispatchEvent(new HashChangeEvent('hashchange'));},120);}
function deleteJob(id){const db=read(),s=db.shops?.[db.session?.shopId];if(!s?.jobs)return toast('Job not found.','bad');const idx=s.jobs.findIndex(x=>String(x.id)===String(id));if(idx<0)return toast('Job not found.','bad');const j=s.jobs[idx];const ok=window.confirm(`Delete this job from active jobs?\n\nUse this when the customer declined or does not want anything done. A cancelled copy will be saved in Declined.`);if(!ok)return;s.declined=s.declined||[];s.declined.unshift({...j,status:'Cancelled',cancelReason:'Customer declined / no work done',cancelledAt:new Date().toISOString()});s.jobs.splice(idx,1);if(db.session?.activeJobId===id)delete db.session.activeJobId;write(db);document.querySelectorAll(`[data-open-job="${CSS.escape(String(id))}"],.mmp-job-row[data-job="${CSS.escape(String(id))}"]`).forEach(el=>el.remove());close();toast('Job deleted from active jobs.','good');location.hash='#jobs';setTimeout(()=>location.reload(),300);}
function maps(j){const loc=j?.location||j?.address||'';if(!loc)return toast('No location saved.','bad');window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`,'_blank','noopener');}
function openPanel(id){ensureStyles();const j=jobById(id);if(!j)return;setActive(j.id);close();const done=j.status==='Completed';const d=document.createElement('div');d.className='modal-backdrop';d.dataset.jobTileActionsModal='1';d.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="Job intake and options"><div class="modal-head"><h2>${esc(j.customerName||'Customer Intake')}</h2><button class="close-btn" type="button" data-job-panel-close aria-label="Close">×</button></div><div class="job-banner" style="margin-bottom:10px"><div class="avatar">${esc(String(j.customerName||'J').split(/\s+/).map(x=>x[0]).join('').slice(0,2))}</div><div class="job-banner-main"><b class="mma-clickable-name">${esc(j.customerName||'Customer')}</b><p>${esc(j.complaint||j.concern||j.description||'No complaint entered')}</p></div><span class="badge ${done?'green':'red'}">${esc(j.status||'Job')}</span></div>${vehicleCard(j)}<div class="work-card"><h3>Customer Intake Form</h3>${intakeTable(j)}</div><div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" data-job-panel-open="${esc(j.id)}">${ic('wrench')} Open Full Job</button><button class="btn btn-soft" data-job-panel-schedule="${esc(j.id)}">${ic('calendar')} ${j.scheduledStart?'Edit Time':'Schedule'}</button><button class="btn btn-soft" data-job-panel-findings="${esc(j.id)}">Findings</button><button class="btn btn-soft" data-job-panel-estimate="${esc(j.id)}">${ic('money')} Estimate</button><button class="btn btn-soft" data-job-panel-maps="${esc(j.id)}">Google Maps</button>${done?'<span class="badge green">Already completed</span>':`<button class="btn btn-green" data-job-panel-complete="${esc(j.id)}">${ic('check')} Complete</button>`}<button class="btn btn-danger" data-job-panel-delete="${esc(j.id)}">Delete / Customer Declined</button></div></div>`;document.body.appendChild(d);}
function patchLabels(){document.querySelectorAll('[data-open-job],[data-job]').forEach(el=>{const id=el.dataset.openJob||el.dataset.job,j=jobById(id);if(!j)return;el.querySelectorAll('b,small').forEach(node=>{if(node.textContent&&!node.textContent.includes('Vehicle details pending'))return;node.textContent=node.textContent.replace('Vehicle details pending',vehicleText(j.vehicle));});});}
document.addEventListener('click',e=>{const completedOpen=e.target.closest('[data-mma-completed-open]');if(completedOpen){e.preventDefault();openPanel(completedOpen.dataset.mmaCompletedOpen);return;}const closeBtn=e.target.closest('[data-job-panel-close]');if(closeBtn||e.target.matches('[data-job-tile-actions-modal]')){e.preventDefault();close();return;}const del=e.target.closest('[data-job-panel-delete]');if(del){e.preventDefault();deleteJob(del.dataset.jobPanelDelete);return;}const complete=e.target.closest('[data-job-panel-complete]');if(complete){e.preventDefault();completeJob(complete.dataset.jobPanelComplete);return;}const schedule=e.target.closest('[data-job-panel-schedule]');if(schedule){e.preventDefault();openSchedule(schedule.dataset.jobPanelSchedule);return;}const mapsBtn=e.target.closest('[data-job-panel-maps]');if(mapsBtn){e.preventDefault();maps(jobById(mapsBtn.dataset.jobPanelMaps));return;}const full=e.target.closest('[data-job-panel-open],[data-job-panel-estimate]');if(full){e.preventDefault();openNativeJob(full.dataset.jobPanelOpen||full.dataset.jobPanelEstimate);return;}const findings=e.target.closest('[data-job-panel-findings]');if(findings){e.preventDefault();setActive(findings.dataset.jobPanelFindings);close();location.hash='#findings';return;}const tile=e.target.closest('[data-open-job],.mmp-job-row[data-job]');if(tile&&!tile.dataset.mmaNativeOpen){const id=tile.dataset.openJob||tile.dataset.job;const j=jobById(id);if(nameClickedInTile(e,tile,j)||!e.target.closest('button,a,input,select,textarea')){e.preventDefault();e.stopImmediatePropagation();openPanel(id);return;}}},true);
document.addEventListener('keydown',e=>{const tile=e.target.closest?.('[data-open-job],.mmp-job-row[data-job]');if(tile&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openPanel(tile.dataset.openJob||tile.dataset.job);}},true);
let patchTimer=0;
function schedulePatch(){clearTimeout(patchTimer);patchTimer=setTimeout(()=>{patchLabels();patchCustomerNames();renderCompletedSection();},180);}
const appRoot=document.getElementById('app')||document.body;
new MutationObserver(schedulePatch).observe(appRoot,{subtree:true,childList:true});
window.addEventListener('hashchange',schedulePatch);
window.addEventListener('load',schedulePatch);
schedulePatch();
})();
