export async function mountFollowups({app,event,api,esc,message,onClosed,workspace='finance',isBookingDirty=()=>false,closeoutNote}){
 const root=document.createElement('section');root.className='card followup-workspace';root.dataset.section=workspace;root.hidden=true;root.innerHTML='<h2>Follow-ups & close-out</h2><p>Loading follow-up settings…</p>';app.append(root);
 const path='admin/events/'+event.id+'/followups';
 async function render(){
  const data=await api(path),s=data.settings;
  const settingsOpen=root.querySelector('.followup-settings')?.open;
  root.innerHTML=`<h2>Follow-ups & close-out</h2><p class="hint">Automatic draft preparation · Email delivery is not connected. While this local app is running, it checks for due reminders every minute. Review and send drafts through your email app using <strong>djgourmet@me.com</strong> as the sender.</p><details class="event-hq-disclosure followup-settings" ${settingsOpen?'open':''}><summary>Automatic follow-up settings</summary><form data-followup-settings><label class="check-row"><input name="enabled" type="checkbox" ${s.enabled?'checked':''}> Automatically prepare follow-up drafts for this event</label><div class="grid"><label>What are we waiting for?<select name="kind">${[['auto','Choose automatically from contract/payment status'],['information','More information before confirming'],['contract','Contract signature'],['deposit','Retainer'],['balance','Remaining balance']].map(([v,t])=>`<option value="${v}" ${s.kind===v?'selected':''}>${t}</option>`).join('')}</select></label><label>First follow-up after (days)<input name="afterDays" type="number" min="1" max="30" required value="${s.afterDays}"></label><label>Wait between follow-ups (days)<input name="repeatDays" type="number" min="1" max="30" required value="${s.repeatDays}"></label><label>Maximum reminders per stage<input name="maxReminders" type="number" min="1" max="5" required value="${s.maxReminders}"></label><label class="wide">What information do you need? (included in information reminders)<textarea name="details" maxlength="2000" placeholder="For example: venue address, start/end times, and expected guest count">${esc(s.details)}</textarea></label></div><button type="submit">Save follow-up settings</button></form></details><p>${s.enabled?(s.count||0)>=s.maxReminders?'Reminder limit reached for this stage.':s.nextDue?'Next draft eligible: '+esc(new Date(s.nextDue).toLocaleString()):'Waiting for an applicable stage.':'Follow-up preparation is paused.'}</p><div data-followup-drafts></div><details class="event-closeout"><summary>Event didn’t pan out? Close it out</summary><p><strong>Archive</strong> an inquiry that did not become a booking. Choose <strong>Canceled</strong> for a booking that was called off. Both keep client details, contracts, payment records, and planners, and stop follow-ups. Reopen later through Booking state in Overview.</p><label>Internal close-out note<textarea data-close-reason maxlength="1000" placeholder="For example: client chose another date or no longer needs DJ services"></textarea></label><div class="followup-actions"><button type="button" class="secondary" data-close-event="Archived">Archive event</button><button type="button" class="secondary" data-close-event="Canceled">Mark canceled</button></div></details>${data.closeouts?.length?`<details><summary>Close-out history</summary>${data.closeouts.map(c=>`<p>${esc(c.status)} · ${esc(new Date(c.at).toLocaleString())}<br>${esc(c.reason)}</p>`).join('')}</details>`:''}`;
  root.querySelector('[data-followup-settings]').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;try{await api(path,'PUT',{enabled:form.elements.enabled.checked,kind:form.elements.kind.value,details:form.elements.details.value,afterDays:Number(form.elements.afterDays.value),repeatDays:Number(form.elements.repeatDays.value),maxReminders:Number(form.elements.maxReminders.value)});await render();message('Follow-up settings saved. Drafts are prepared locally; no email is sent automatically.');}catch(error){message(error.message,true);}};
  const drafts=root.querySelector('[data-followup-drafts]');drafts.innerHTML='<h3>Reminder drafts & history</h3>'+(data.drafts.length?data.drafts.map(d=>`<details class="followup-draft" ${d.status==='Needs review'?'open':''} data-draft="${d.id}"><summary>${esc(d.kind==='deposit'?'retainer':d.kind)} · ${esc(d.status)} · ${esc(new Date(d.createdAt).toLocaleString())}</summary><p>From: <strong>${esc(d.from||'djgourmet@me.com')}</strong><br>To: <strong>${esc(d.to)}</strong></p><label>Subject<input data-subject maxlength="300" value="${esc(d.subject)}" ${d.status==='Needs review'?'':'readonly'}></label><label>Message<textarea data-body maxlength="8000" ${d.status==='Needs review'?'':'readonly'}>${esc(d.body)}</textarea></label>${d.status==='Needs review'?'<div class="followup-actions"><button type="button" data-email>Open email draft ↗</button><button type="button" class="secondary" data-copy>Copy message</button><button type="button" class="secondary" data-draft-status="Shared manually">I sent this manually</button><button type="button" class="secondary" data-draft-status="Dismissed">Dismiss</button></div><small>Opening an email draft does not send it or mark it sent. Mark it only after you send it in your email app.</small>':''}</details>`).join(''):'<p>No reminder drafts yet.</p>');
  for(const d of data.drafts.filter(d=>d.status==='Needs review')){const row=drafts.querySelector('[data-draft="'+d.id+'"]'),values=()=>({subject:row.querySelector('[data-subject]').value,body:row.querySelector('[data-body]').value});row.querySelector('[data-email]').onclick=()=>{const v=values();if(!v.subject.trim()||/[\r\n]/.test(v.subject)||!v.body.trim())return message('Enter a single-line subject and message.',true);location.href='mailto:'+encodeURIComponent(d.to)+'?subject='+encodeURIComponent(v.subject)+'&body='+encodeURIComponent(v.body);};row.querySelector('[data-copy]').onclick=async()=>{try{const v=values();await navigator.clipboard.writeText('To: '+d.to+'\nSubject: '+v.subject+'\n\n'+v.body);message('Reminder copied. Paste it into your email app.');}catch{row.querySelector('[data-body]').select();message('Select and copy the message, then paste it into your email.');}};row.querySelectorAll('[data-draft-status]').forEach(button=>button.onclick=async()=>{try{await api(path+'/'+d.id,'POST',{...values(),status:button.dataset.draftStatus});await render();message('Reminder history updated.');}catch(error){message(error.message,true);}});}
  const note=root.querySelector('[data-close-reason]');
  if(closeoutNote!==undefined){
   note.value=closeoutNote;
   note.closest('details').open=true;
   closeoutNote=undefined;
  }
  const closeButtons=[...root.querySelectorAll('[data-close-event]')];
  for(const button of closeButtons)button.onclick=async()=>{
   if(isBookingDirty())return message('Save your booking changes before closing the event.',true);
   closeButtons.forEach(item=>item.disabled=true);
   try{
    const status=button.dataset.closeEvent;
    const reason=note.value;
    const close=async()=>{
     const current=await api('events/'+event.id);
     if(!root.isConnected||isBookingDirty())return null;
     if(current.status===status){
      onClosed(current);
      message('Event is already '+status.toLowerCase()+'.');
      return null;
     }
     if(current.status!==event.status){
      onClosed(current,reason);
      message('The booking state changed to '+current.status+'. Review it before closing the event.');
      return null;
     }
     return api('admin/events/'+event.id+'/close','POST',{version:current.version,status,reason});
    };
    let result;
    try{result=await close();}
    catch(error){
     if(error.status!==409)throw error;
     result=await close();
    }
    if(!result)return;
    if(result.event?.id!==event.id||result.event.status!==status){
     throw Error('The booking status could not be verified. Reopen the booking before trying again.');
    }
    if(!root.isConnected)return;
    onClosed(result.event);
    const sync=result.calendarSync;
    const warning=sync?.status==='error'?' Calendar sync failed: '+sync.error:'';
    message('Event '+status.toLowerCase()+'.'+warning,Boolean(warning));
   }catch(error){
    if(root.isConnected)message(error.message,true);
   }finally{
    closeButtons.forEach(item=>item.disabled=false);
   }
  };
 }
 await render();
}
