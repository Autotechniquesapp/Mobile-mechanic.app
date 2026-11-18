(() => {
'use strict';
function zone(){
  let shop;
  try{
    const cache=JSON.parse(localStorage.getItem('mobile_mechanic_ai_approved_v7')||'{}');
    shop=cache.shops?.[cache.session?.shopId];
  }catch{}
  return shop?.timezone||
    (/autotechniques/i.test(String(shop?.name||'').replace(/\s/g,''))?'America/Phoenix':Intl.DateTimeFormat().resolvedOptions().timeZone);
}
const formatters=new Map();
function wallValue(value,timezone=zone()){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  if(!formatters.has(timezone))formatters.set(timezone,new Intl.DateTimeFormat('en-CA',{
    timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }));
  const parts=Object.fromEntries(formatters.get(timezone).formatToParts(date).map(({type,value})=>[type,value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function toInstant(value,timezone=zone()){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
  const target=Date.parse(value+'Z');
  if(!Number.isFinite(target))return null;
  let instant=target;
  for(let i=0;i<3;i++){
    const wall=wallValue(instant,timezone);
    if(wall===value)return new Date(instant);
    instant+=target-Date.parse(wall+'Z');
  }
  return null;
}
function requestedValue(raw){
  const value=String(raw||'').trim();
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return toInstant(value)?value:'';
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return wallValue(value);
  const legacy=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!legacy)return '';
  const [,month,day,year,hour,minute,meridiem]=legacy;
  if(+hour<1||+hour>12)return '';
  const pad=n=>String(n).padStart(2,'0');
  return requestedValue(`${year}-${pad(month)}-${pad(day)}T${pad(+hour%12+(meridiem.toLowerCase()==='pm'?12:0))}:${minute}`);
}
window.MobileMechanicScheduleTime={zone,wallValue,toInstant,requestedValue};
})();
