(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
let busy=false;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function ctx(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find?.(j=>String(j.id)===String(db.session?.activeJobId));return {db,sid,shop,job};}
function toast(msg,type=''){document.querySelector('.identifix-import-toast')?.remove();const d=document.createElement('div');d.className=`toast identifix-import-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3400);}
function cleanName(v=''){return String(v).replace(/^(labor|operation|procedure|description|name)\s*[:\-]\s*/i,'').replace(/[|:;\-–—]+$/,'').trim();}
function parse(text=''){
  const raw=String(text||'').trim();if(!raw)return null;
  const inline=raw.match(/^\s*(.+?)\s*(?:\||[-–—:]\s*)\s*(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/im);
  const hm=inline||raw.match(/(?:labor\s*(?:time|hours?)\s*[:\-]?\s*)?(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i);
  let hours=null,name='';
  if(inline){name=cleanName(inline[1]);hours=Number(inline[2]);}
  else if(hm){hours=Number(hm[1]);const lines=raw.split(/\r?\n/).map(x=>cleanName(x)).filter(Boolean);name=lines.find(x=>!/(?:\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i.test(x)&&!/^(labor\s*)?(time|hours?)\b/i.test(x))||'';}
  if(!Number.isFinite(hours)||hours<=0)return null;
  return {name,hours};
}
async function clipboardText(){try{return await navigator.clipboard.readText();}catch{return prompt('Paste the Identifix labor operation and time here:','')||'';}}
async function addLabor(){
  if(busy)return;busy=true;
  try{
    const {sid,shop,job}=ctx();if(!sb||!sid||!job)throw new Error('Open a job first.');
    let text=await clipboardText(),parsed=parse(text);
    if(!parsed){const hoursRaw=prompt('Labor time in hours:','');const hours=Number(hoursRaw);if(!Number.isFinite(hours)||hours<=0)throw new Error('No valid labor time found.');parsed={name:'',hours};}
    let name=parsed.name;
    if(!name)name=(prompt('Labor operation name:','')||'').trim();
    if(!name)throw new Error('Labor operation name is required.');
    const rate=Number(shop?.settings?.laborRate||75),amount=Math.round(parsed.hours*rate*100)/100;
    const {data,error}=await sb.from('jobs').select('ai_workup').eq('id',job.id).eq('shop_id',sid).single();if(error)throw error;
    const ai={...(data?.ai_workup||{})},wo={...(ai.work_order||{})},est={...(wo.next_invoice||{status:'draft',parts:[],labor:[]})};
    est.parts=Array.isArray(est.parts)?est.parts:[];est.labor=Array.isArray(est.labor)?est.labor:[];
    const key=name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),idx=est.labor.findIndex(x=>String(x.name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()===key);
    const item={name,hours:parsed.hours,rate,amount,status:'estimated'};
    if(idx>=0)est.labor[idx]={...est.labor[idx],...item,note:''};else est.labor.push(item);
    est.note='Additional work estimate. Keep separate from the original Square invoice until customer authorization and final billing.';
    est.updated_at=new Date().toISOString();wo.next_invoice=est;ai.work_order=wo;
    const r=await sb.from('jobs').update({ai_workup:ai,updated_at:new Date().toISOString()}).eq('id',job.id).eq('shop_id',sid);if(r.error)throw r.error;
    document.querySelector('[data-next-invoice]')?.remove();
    toast(`${name} — ${parsed.hours} hr added.`,'good');
  }catch(err){toast(err?.message||'Could not add labor time.','bad');}finally{busy=false;}
}
function css(){if(document.getElementById('identifix-labor-import-style'))return;const s=document.createElement('style');s.id='identifix-labor-import-style';s.textContent=`
[data-labor-guide-button]{gap:6px;flex-wrap:wrap}.nxe-labor{grid-template-columns:minmax(0,1fr) 92px 28px!important;align-items:center!important}.nxe-labor .nxe-main small,.nxe-labor label:nth-of-type(2),.nxe-labor .nxe-line-total{display:none!important}.nxe-labor label:first-of-type{display:flex!important;align-items:center;justify-content:flex-end;gap:4px}.nxe-labor label:first-of-type span{display:none!important}.nxe-labor label:first-of-type input{width:62px!important;text-align:right}.nxe-labor label:first-of-type::after{content:'hr';font-size:11px;color:#aeb6c0}.nxe-labor .nxe-remove{grid-column:3!important;grid-row:1!important}
@media(max-width:700px){.nxe-labor{grid-template-columns:minmax(0,1fr) 82px 24px!important}.nxe-labor .nxe-remove{grid-column:3!important;grid-row:1!important}}
`;document.head.appendChild(s);}
function mount(){css();const box=document.querySelector('[data-labor-guide-button]');if(!box||box.querySelector('[data-identifix-add-labor]'))return;const b=document.createElement('button');b.type='button';b.className='btn btn-primary';b.dataset.identifixAddLabor='1';b.style.cssText='padding:6px 10px;min-height:32px;font-size:12px';b.textContent='+ Add Labor Time';box.appendChild(b);}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-identifix-add-labor]');if(!b)return;e.preventDefault();addLabor();},true);
new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,180));
setTimeout(mount,1300);
})();