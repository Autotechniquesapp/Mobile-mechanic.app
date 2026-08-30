(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
let state=null;
let mounting=false;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));return {db,shop,job};}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function toast(msg,type=''){document.querySelector('.next-invoice-toast')?.remove();const d=document.createElement('div');d.className=`toast next-invoice-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3000);}
function blank(){return {status:'draft',parts:[],labor:[],note:'Additional parts and labor for the next invoice.'};}

async function load(job){
  if(!sb||!job?.id)return blank();
  const {data,error}=await sb.from('jobs').select('ai_workup').eq('id',job.id).maybeSingle();
  if(error)throw error;
  const n=structuredClone(data?.ai_workup?.work_order?.next_invoice||blank());
  n.parts=Array.isArray(n.parts)?n.parts:[];n.labor=Array.isArray(n.labor)?n.labor:[];return n;
}
function total(n){return [...n.parts,...n.labor].reduce((s,x)=>s+(Number.isFinite(Number(x.amount))?Number(x.amount):0),0);}
function line(item,type,index){const pending=item.amount===null||item.amount===undefined||item.amount==='';return `<div class="nxi-row"><div class="nxi-main"><b>${esc(item.name)}</b>${item.note?`<small>${esc(item.note)}</small>`:''}</div><label>$ <input type="number" step="0.01" min="0" placeholder="Price" value="${pending?'':esc(item.amount)}" data-nxi-amount data-nxi-type="${type}" data-nxi-index="${index}"></label><button type="button" class="nxi-remove" aria-label="Remove" data-nxi-remove data-nxi-type="${type}" data-nxi-index="${index}">×</button></div>`;}
function group(title,type,items){return `<div class="nxi-group"><div class="nxi-head"><h4>${title}</h4><button class="btn btn-soft" type="button" data-nxi-add="${type}">+ Add ${type==='parts'?'Part':'Labor'}</button></div>${items.length?items.map((x,i)=>line(x,type,i)).join(''):`<div class="nxi-empty">No ${type} added yet.</div>`}</div>`;}
function markup(n){const known=total(n),hasPending=[...n.parts,...n.labor].some(x=>x.amount===null||x.amount===undefined||x.amount==='');return `<section class="nxi" data-next-invoice><div class="nxi-title"><div><div class="eyebrow">NEXT INVOICE / ADDED WORK</div><h3>Parts + Labor</h3></div><span class="badge orange">Draft</span></div>${group('Parts for Next Invoice','parts',n.parts)}${group('Labor for Next Invoice','labor',n.labor)}<div class="nxi-total"><span>Known added-work subtotal</span><strong>${money(known)}</strong></div>${hasPending?'<div class="nxi-note">Some items are still waiting for a price.</div>':''}${n.note?`<div class="nxi-note">${esc(n.note)}</div>`:''}</section>`;}
function css(){if(document.getElementById('next-invoice-style'))return;const s=document.createElement('style');s.id='next-invoice-style';s.textContent=`
.nxi{border-top:1px solid #2c343d;margin-top:12px;padding-top:12px}.nxi-title,.nxi-head,.nxi-total{display:flex;align-items:center;justify-content:space-between;gap:8px}.nxi-title h3{margin:2px 0 0;font-size:15px}.nxi-group{margin-top:10px}.nxi-head h4{margin:0;font-size:12px;text-transform:uppercase}.nxi-head .btn{padding:4px 8px!important;min-height:28px!important;font-size:11px!important}.nxi-row{display:grid;grid-template-columns:minmax(0,1fr) 112px 28px;gap:7px;align-items:center;background:#0a0e13;border:1px solid #28313a;border-radius:8px;padding:7px 8px;margin-top:5px}.nxi-main b{display:block;font-size:12px}.nxi-main small{display:block;font-size:10px;color:#8e99a5;margin-top:2px}.nxi-row label{display:flex;align-items:center;gap:3px;font-size:11px}.nxi-row input{width:92px;background:#111820;color:#fff;border:1px solid #39434d;border-radius:6px;padding:6px}.nxi-remove{border:0;background:transparent;color:#d7dce1;font-size:20px;line-height:1}.nxi-total{margin-top:10px;background:#0a0e13;border:1px solid #39434d;border-radius:8px;padding:9px;font-size:12px}.nxi-note{font-size:10px;color:#9da7b2;margin-top:5px}.nxi-empty{font-size:11px;color:#8e99a5;padding:7px}
@media(max-width:620px){.nxi-row{grid-template-columns:minmax(0,1fr) 102px 24px}.nxi-row input{width:82px}}
`;document.head.appendChild(s);}
async function save(){
  const {job}=context();if(!sb||!job?.id||!state)return;
  try{const {data,error}=await sb.from('jobs').select('ai_workup').eq('id',job.id).single();if(error)throw error;const ai={...(data?.ai_workup||{})};ai.work_order={...(ai.work_order||{}),next_invoice:{...state,updated_at:new Date().toISOString()}};const r=await sb.from('jobs').update({ai_workup:ai,updated_at:new Date().toISOString()}).eq('id',job.id);if(r.error)throw r.error;toast('Next invoice updated.','good');}catch(err){toast(err?.message||'Could not save next invoice.','bad');}
}
function rerender(){const el=document.querySelector('[data-next-invoice]');if(el&&state)el.outerHTML=markup(state);}
function add(type){if(!state)return;const name=prompt(type==='parts'?'Part description:':'Labor description:');if(!name?.trim())return;const raw=prompt('Price/charge (leave blank if not decided yet):','');const amount=raw?.trim()===''||raw===null?null:Number(raw);state[type].push({name:name.trim(),amount:Number.isFinite(amount)?amount:null,status:'pending price'});rerender();save();}
function bind(){
  document.addEventListener('change',e=>{const i=e.target.closest?.('[data-nxi-amount]');if(!i||!state)return;const type=i.dataset.nxiType,index=Number(i.dataset.nxiIndex);if(!state[type]?.[index])return;state[type][index].amount=i.value===''?null:Number(i.value);save();rerender();},true);
  document.addEventListener('click',e=>{const a=e.target.closest?.('[data-nxi-add]');if(a){e.preventDefault();add(a.dataset.nxiAdd);return;}const r=e.target.closest?.('[data-nxi-remove]');if(r&&state){e.preventDefault();const type=r.dataset.nxiType,index=Number(r.dataset.nxiIndex);state[type]?.splice(index,1);rerender();save();}},true);
}
async function mount(){if(mounting||document.querySelector('[data-next-invoice]'))return;const {db,job}=context();if(db.session?.role!=='shop'||!job)return;const work=document.querySelector('[data-job-work-order]');if(!work)return;mounting=true;try{css();state=await load(job);const fin=work.querySelector('.jwo-fin');if(fin)fin.insertAdjacentHTML('beforebegin',markup(state));else work.insertAdjacentHTML('beforeend',markup(state));}catch(err){console.error('next invoice mount',err);}finally{mounting=false;}}
bind();new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{state=null;setTimeout(mount,150);});setTimeout(mount,1100);
})();