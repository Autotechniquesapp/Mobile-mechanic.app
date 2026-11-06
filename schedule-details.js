(() => {
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function destination(job){
  const loc=job?.currentLocation||{},lat=loc.latitude??loc.lat,lng=loc.longitude??loc.lng??loc.lon;
  return String(job?.location||job?.address||loc.raw||'').trim() || (Number.isFinite(lat)&&Number.isFinite(lng)?`${lat},${lng}`:'');
}
const mapsUrl=value=>value?`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(value)}`:'';
function notes(job){
  return [['Customer',job.customerName],['Phone',job.phone],['Address',destination(job)],['Vehicle',[job.vehicle?.year,job.vehicle?.make,job.vehicle?.model,job.vehicle?.engine].filter(Boolean).join(' ')],['Customer states',job.complaint]].filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join('\n');
}
function markup(job){
  const lead=job.scheduleReminderMinutes,custom=Number.isInteger(lead)&&lead>=0&&![0,15,30,60,120,1440].includes(lead),value=lead==null?'default':lead===-1?'off':custom?'custom':String(lead),loc=destination(job);
  return `<div class="field"><label for="scheduleLocation">Service location</label><input id="scheduleLocation" value="${esc(loc)}" placeholder="Street address or GPS coordinates"><a id="scheduleNavigate" class="btn btn-soft" href="${esc(mapsUrl(loc))}" target="_blank" rel="noopener" ${loc?'':'hidden'}>Navigate in Maps</a></div><div class="field"><label for="scheduleNotes">Notes</label><textarea id="scheduleNotes" rows="6" placeholder="Gate code, parking, parts pickup...">${esc(job.scheduleNotes||notes(job))}</textarea></div><div class="field"><label for="scheduleReminder">Remind me</label><select id="scheduleReminder">${[['default','Use Android reminder setting'],['off','No reminder'],['0','At appointment time'],['15','15 minutes before'],['30','30 minutes before'],['60','1 hour before'],['120','2 hours before'],['1440','1 day before'],['custom','Custom…']].map(([v,label])=>`<option value="${v}" ${v===value?'selected':''}>${label}</option>`).join('')}</select></div><div id="scheduleReminderCustom" class="row2" style="display:${custom?'grid':'none'}" ${custom?'':'hidden'}><div class="field"><label for="scheduleReminderAmount">How long before?</label><input id="scheduleReminderAmount" type="number" min="1" step="1" value="${custom?lead:45}"></div><div class="field"><label for="scheduleReminderUnit">Unit</label><select id="scheduleReminderUnit"><option value="1">Minutes</option><option value="60">Hours</option><option value="1440">Days</option></select></div></div><p class="small muted">Phone alerts use the Android app with notifications allowed. Connected calendars use their own notifications. Google Calendar supports up to 4 weeks of advance notice.</p>`;
}
function bind(job={}){
  const select=document.getElementById('scheduleReminder'),input=document.getElementById('scheduleLocation');
  if(input){input.originalValue=input.value;input.originalLocation=job.currentLocation||{};}
  select?.addEventListener('change',()=>{const block=document.getElementById('scheduleReminderCustom');block.hidden=select.value!=='custom';block.style.display=select.value==='custom'?'grid':'none';});
  input?.addEventListener('input',()=>{const a=document.getElementById('scheduleNavigate');a.hidden=!input.value.trim();a.href=mapsUrl(input.value.trim());});
}
function read(){
  const choice=document.getElementById('scheduleReminder')?.value||'default';
  let minutes=choice==='default'?null:choice==='off'?-1:choice==='custom'?Number(document.getElementById('scheduleReminderAmount').value)*Number(document.getElementById('scheduleReminderUnit').value):Number(choice);
  if(minutes!==null&&(!Number.isSafeInteger(minutes)||minutes< -1||minutes>2147483647||(choice==='custom'&&minutes<1)))throw new Error('Enter a positive whole reminder time in minutes, hours, or days.');
  const input=document.getElementById('scheduleLocation'),raw=input?.value.trim()||'',current_location=raw===input?.originalValue?{...input.originalLocation,raw}:{raw};
  return {schedule_reminder_minutes:minutes,current_location,schedule_notes:document.getElementById('scheduleNotes')?.value||''};
}
window.MobileMechanicScheduleDetails={destination,mapsUrl,notes,markup,bind,read};
})();
