import {inquiryFields,bindUnknowns,travelFields} from './inquiry-details.js?v=2';
// Staging repair: restore inquiry module.
import {additionalTimeControl,setAdditionalTimeAvailable} from './additional-time.js?v=205';
import {foamSticksControl} from './foam-sticks.js?v=205';
import {newId} from './request-id.js?v=180';
import {openDeclineDraft,responseDraftCard} from './decline-ui.js?v=181';
import {arrangeAddons} from './addon-layout.js?v=180';
import {chooseEvent,eventChoices} from './event-picker.js?v=180';
import {privateIntake} from './private-intake.js?v=212';
import {schoolIntake} from './school-intake.js?v=214';
import {weddingPackages,weddingAddons,quoteWeddingPackage,ceremonyCondition,soundCapacityNotice} from './wedding-packages.js?v=180';
import {packageDetails,packageFeatures,syncWeddingLighting,syncWeddingAddons} from './package-ui.js?v=211';
import {calculateDeposit} from './pricing.js?v=180';
export function bookingUI({api,app,head,esc,field,area,money,message}){
 const openStates=['Pending','Ready for review','Awaiting information'];
 const deskUrl=()=>location.origin+location.pathname.replace(/index\.(php|html)$/i,'');
 async function updateDetails(id,token){
  const endpoint='intake/requests/'+encodeURIComponent(id)+'/details';
  try {
   const details=await api(endpoint,'POST',{token,preview:true});
   app.innerHTML=head('YOUR INQUIRY','Update your event details','DJ Jesse B will review the information you share.')+
    `<section class="card"><form>${inquiryFields(details,true,esc)}<button>Save details</button></form></section>`;
   const form=app.querySelector('form');
   bindUnknowns(form);
   form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('button');
    button.disabled=true;
    try {
     const result=await api(endpoint,'POST',{...Object.fromEntries(new FormData(form)),token});
     app.innerHTML=head('YOUR INQUIRY','Thank you for the update.',esc(result.message));
     history.replaceState(null,'',location.pathname+location.search);
    } catch(err){message(err.message,true,err.field);button.disabled=false;}
   };
  } catch(err){app.innerHTML=head('YOUR INQUIRY','Update link unavailable',esc(err.message));}
 }
 function reviewForm(r){
  return `<form data-review-form><details><summary>Edit venue or event hours</summary>${inquiryFields(r,true,esc)}<button type="button" data-save-details>Save details</button></details>
   ${r.missingDetails?.length?`<p>Required before approval: ${esc(r.missingDetails.join(', '))}.</p>`:''}
   ${travelFields(r.travelSettings,esc)}
   <label>Optional hold (hours)<input name="holdHours" type="number" min="0" max="168" value="0"></label>
   <details><summary>Administrative override</summary><label>Reason for proceeding with missing information<input name="overrideReason" maxlength="1000"></label></details>
   <button type="button" class="secondary" data-request-information>Prepare request for information</button></form>`;
 }
 function historyPanel(r){
  return r.inquiryHistory?.length?`<details><summary>Inquiry history</summary><ul>${r.inquiryHistory.map(item=>`<li>${esc(new Date(item.at).toLocaleString())} · ${esc(item.action)} · ${esc(item.actor)}${item.reason?' · '+esc(item.reason):''}</li>`).join('')}</ul></details>`:'';
 }
 function travelEstimate(review){
  const parts=[];
  if(review.totalMinutes!==undefined){
   parts.push('Estimated total day '+Math.floor(review.totalMinutes/60)+' hr '+review.totalMinutes%60+' min',
    'estimated arrival home '+review.arrivalHome);
  }
  if(review.warnings?.length)parts.push(review.warnings.join(', '));
  if(review.missing?.length)parts.push('Still needed: '+review.missing.join(', '));
  return parts.join(' · ')||'Save the venue and event hours to calculate the total day and arrival time.';
 }
 function inquiryActions(r,q){
  const preliminary=r.state==='Preliminarily approved';
  const canReopen=preliminary||['Declined','Withdrawn'].includes(r.state);
  const canRevise=preliminary||openStates.includes(r.state);
  if(r.eventId||(!canReopen&&!canRevise))return '';
  return `${preliminary?`<p>${r.holdUntil?'Hold expires '+esc(new Date(r.holdUntil).toLocaleString()):'No date hold set.'}</p><button type="button" data-inquiry-action="prepare-contract">Prepare contract</button>`:''}
   <details><summary>Manage inquiry</summary><form data-manage-inquiry>
   ${canRevise?`<label>Revised quote total<input name="amount" type="number" min="0" max="1000000" step="0.01" value="${esc(q.total)}"></label>`:''}
   <label>Reason for change<input name="reason" maxlength="1000"></label>
   ${canReopen?'<button type="button" data-inquiry-action="reopen">Reopen inquiry</button>':''}
   ${preliminary?'<button type="button" data-inquiry-action="withdraw">Withdraw approval</button>':''}
   ${canRevise?'<button type="button" data-inquiry-action="revise-quote">Revise quote</button>':''}
   </form></details>`;
 }
 async function intake(selected=''){
 const key=newId();app.innerHTML=head('LET’S MAKE A GREAT NIGHT','Let’s plan your event.','Explore your options and request your date with DJ Jesse B.')+`<div class="intake-type-bar"><span data-selected-event>Choose your event</span><button type="button" class="secondary" id="changeEventType">Change event type</button></div><select id="intakeType" hidden aria-hidden="true" tabindex="-1"><option value=""></option>${eventChoices.map(c=>`<option>${c.value}</option>`).join('')}</select><section class="card intake-details" hidden><div class="intake-details-heading"><span class="badge purple">LET’S MAKE IT YOURS</span><h2 data-intake-title></h2></div><div id="intakeBody"></div></section><p><a class="button secondary" href="#dashboard">← Home / sign in</a></p>`;
 const type=document.querySelector('#intakeType');type.onchange=()=>{const panel=app.querySelector('.intake-details');panel.hidden=!type.value;app.querySelector('[data-selected-event]').textContent=type.value;app.querySelector('[data-intake-title]').textContent=type.value+' details';const body=document.querySelector('#intakeBody');if(['Private party','Corporate event'].includes(type.value)){privateIntake({body,key,api,app,head,esc,field,area,money,message,type:type.value==='Corporate event'?'Corporate':'Private party'});return;}if(type.value==='School dance'){schoolIntake({body,key,api,app,head,esc,field,area,money,message});return;}if(type.value!=='Wedding'){body.innerHTML=type.value?'<p class="hint">The '+esc(type.value.toLowerCase())+' booking flow will be completed later. Inquiries are currently accepted for weddings, school dances, and private events.</p>':'';return;}
  body.innerHTML=`<form id="dateRequest"><details class="intake-package-comparison"><summary>See all packages</summary><p>Compare the four wedding options. Choosing a package updates the coverage answers to match its included services.</p><div class="package-comparison-grid">${weddingPackages.map(p=>`<article class="package-comparison-option"><h3>${esc(p.name)}</h3><strong class="package-comparison-price">${money(p.price)}</strong><p>Up to ${p.hours} hours total wedding coverage</p><ul class="package-features">${packageFeatures(p.features,esc)}</ul>${p.ceremony?`<p class="input-guidance">${esc(ceremonyCondition)}</p>`:''}<button type="button" class="secondary" data-select-intake-package="${p.id}">Choose this package</button></article>`).join('')}</div></details><div class="grid"><label><span class="visually-hidden">Will you need ceremony coverage?</span><select name="ceremony" required><option value="">Will you need ceremony coverage?</option><option>Yes</option><option>No</option></select></label><label><span class="visually-hidden">Will you need cocktail-hour coverage?</span><select name="cocktail" required><option value="">Will you need cocktail-hour coverage?</option><option>Yes</option><option>No</option></select></label></div><p id="recommendation" class="hint">Answer the coverage questions to see a recommended package.</p><label>Your package<select name="packageId" required>${weddingPackages.map(p=>`<option value="${p.id}">${esc(p.name)} — ${money(p.price)}</option>`).join('')}</select></label>${field('How many guests will be attending?','guests','','number','required min="1" max="100000" step="1"')}<label><span class="visually-hidden">What color DJ booth would you like?</span><select name="booth"><option value="TBD">What color DJ booth would you like?</option><option>White</option><option>Black</option></select><figure class="booth-color-preview" data-booth-preview hidden><img data-addon-photo role="button" tabindex="0" width="240" height="180" title="Click to enlarge"><figcaption data-booth-caption></figcaption></figure></label><details class="intake-package-comparison intake-addons" open><summary>See all add-ons</summary><p>Choose optional upgrades below. Lighting upgrades can be combined.</p><div class="grid package-options">${additionalTimeControl('name',0,150,4)}<label>Lighting upgrade<select name="lighting"><option value="none">No lighting upgrade</option><option value="uplighting">8 wireless uplights — $250</option><option value="premium">Premium Lighting Package — $750</option></select><small class="input-guidance" data-lighting-description aria-live="polite">The dance-floor lighting included with your selected wedding package.</small></label><div></div>${foamSticksControl()}</div></details><p class="input-guidance">Additional time chosen now is booked in advance at $150 per half-hour. If the client voluntarily ends the event early, unused reserved time is nonrefundable. Same-day overtime, if available, costs $150 per half-hour and requires DJ approval plus full payment through Stripe or in cash before confirmation. Venue restrictions, availability, and other commitments may prevent extensions. This does not limit remedies if DJ Jesse B cannot provide contracted services.</p><div id="requestQuote"></div><h2>Request your date</h2><div class="grid">${field('Your name','name','','text','required maxlength="300"')}${field('Email address','email','','email','required')}${field('Phone (optional)','phone')}${field('Requested wedding date','date','','date','required')}${inquiryFields()}${area('Anything else we should know?','notes','')}</div><p class="hint">Submitting a request does not reserve a date. DJ Jesse B will review availability, then provide a contract and request the <span data-retainer>the calculated</span> non-refundable retainer. Planning access follows the signed contract.</p><label class="check-row"><input type="checkbox" name="demo" required checked><span>I confirm that the requested date and event details above are accurate.</span></label><div class="actions"><button type="submit">Request this date</button><small>Availability requires DJ approval.</small></div></form>`;
 const form=body.querySelector('form');bindUnknowns(form);arrangeAddons(form);let lastCoverage='';form.querySelectorAll('[data-select-intake-package]').forEach(button=>button.onclick=()=>{const chosen=weddingPackages.find(p=>p.id===button.dataset.selectIntakePackage);form.elements.ceremony.value=chosen.ceremony?'Yes':'No';form.elements.cocktail.value=chosen.cocktail?'Yes':'No';render();form.elements.packageId.value=chosen.id;render();form.querySelector('.intake-package-comparison').open=false;form.elements.packageId.focus();});
 function syncBoothPreview(){const color=form.elements.booth.value,preview=form.querySelector('[data-booth-preview]');preview.hidden=!['White','Black'].includes(color);if(preview.hidden)return;const photo=preview.querySelector('img'),src=color==='White'?'./booth-only-white.webp':'./booth-only-black.webp';if(photo.getAttribute('src')!==src)photo.src=src;photo.alt=color+' DJ booth and speakers preview';photo.setAttribute('aria-label','Enlarge '+color.toLowerCase()+' DJ booth and speakers preview');preview.querySelector('[data-booth-caption]').textContent=color+' booth · tap to enlarge';}
 function selection(){return {foamSticks:Number(form.elements.foamSticks.value),id:form.elements.packageId.value,guestCount:Number(form.elements.guests.value),extraTopPairs:0,extraSubwoofers:0,additionalSound:false,booth:form.elements.booth.value,extraHalfHours:Number(form.elements.extraHalfHours.value),lighting:form.elements.lighting.value,bubbles:false,haze:false,bubblesApproval:'Pending',hazeApproval:'Pending',additionalCharge:0,chargeNote:''};}
 function render(){syncBoothPreview();syncWeddingAddons(form,form.elements.packageId.value);syncWeddingLighting(form.elements.lighting,form.elements.packageId.value);const lighting=form.elements.lighting.value;form.querySelector('[data-lighting-description]').textContent=lighting==='leafSpinner'?'Two forward-facing moving-head lights on black flat-base poles, plus four light tubes.':lighting==='premium'?'Includes 4 tube lights, 2 moving heads, 4 color wash lights, custom lighting design, and custom light-show programming. Wireless uplighting is a separate upgrade.':lighting==='uplighting'?'Includes 8 wireless uplights to add color and atmosphere around your venue.':'The dance-floor lighting included with your selected wedding package.';const ceremony=form.elements.ceremony.value,cocktail=form.elements.cocktail.value;if(!ceremony||!cocktail)return;const recommended=ceremony==='Yes'?'full':cocktail==='Yes'?'gold':'basic';const coverage=ceremony+cocktail;for(const option of form.elements.packageId.options){const p=weddingPackages.find(p=>p.id===option.value);option.disabled=ceremony==='Yes'?p.id!=='full':p.id==='full'||cocktail==='Yes'&&!p.cocktail;}if(coverage!==lastCoverage){form.elements.packageId.value=recommended;lastCoverage=coverage;}document.querySelector('#recommendation').textContent=(ceremony==='Yes'?'Ceremony coverage: ':cocktail==='Yes'?'Cocktail hour without ceremony: ':'Reception only: ')+weddingPackages.find(p=>p.id===recommended).name+' is our recommendation.';try{document.querySelector('#requestQuote').innerHTML=packageDetails(quoteWeddingPackage(selection()),esc,money);form.querySelector('[data-retainer]').textContent=money(calculateDeposit(quoteWeddingPackage(selection()).total));}catch(err){document.querySelector('#requestQuote').textContent=err.message;}}
 form.addEventListener('input',render);form.addEventListener('change',render);
 form.onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type=submit]');button.disabled=true;try{const result=await api('intake/requests','POST',{...data,guests:Number(data.guests),key,type:'Wedding',ceremony:data.ceremony==='Yes',cocktail:data.cocktail==='Yes',demo:form.elements.demo.checked,selection:selection()});app.innerHTML=head('REQUEST RECEIVED','Your date is awaiting DJ review.','Thank you! Your availability inquiry has been submitted to DJ Jesse B.')+`<section class="card"><p>Reference: <b>${esc(result.reference)}</b></p><p>Next: DJ Jesse B reviews the date, then prepares a contract and requests the ${money(calculateDeposit(quoteWeddingPackage(selection()).total))} retainer. Your planning app opens after signing.</p><a class="button secondary" href="#inquire">Back to event selection</a></section>`;message('Your date request has been saved for admin review.');}catch(err){message(err.message,true,err.field);button.disabled=false;}};
 };
 const pick=()=>chooseEvent(choice=>{if(location.hash==='#inquire/'+choice.id){type.value=choice.value;type.onchange();}else location.hash='#inquire/'+choice.id;});app.querySelector('#changeEventType').onclick=pick;const initial=eventChoices.find(c=>c.id===selected);if(initial){type.value=initial.value;type.onchange();}else pick();
 }
 function normalizeQuote(q,r){
  if(q&&q.package&&Array.isArray(q.items)&&typeof q.total==='number')return q;
  const total=(q&&typeof q.total==='number')?q.total:(Number(r?.amount)||2500);
  const pkgName=q?.package?.name||(r?.type==='Wedding'?'The Full Wedding Experience':r?.type==='School dance'?'The Total Prom Experience':'Corporate event à la carte services');
  return {
   catalogVersion:'2026-11-fallback',
   selection:q?.selection||{id:'full',guestCount:Number(r?.guests)||120,booth:'White'},
   package:{id:q?.package?.id||'full',name:pkgName,price:total,hours:4,features:['Sound system & microphones','DJ & MC service','Dance-floor lighting']},
   items:(Array.isArray(q?.items)&&q.items.length)?q.items:[{name:pkgName,quantity:1,unitPrice:total,total}],
   total
  };
 }
 async function requests(){
  const rows=await api('admin/requests');
  const availabilityPanel=r=>{
   const check=r.availability||{level:'review',events:[],requests:[],reasons:['Availability could not be verified.']};
   const ready=check.level==='available';
   const eventLines=(check.events||[]).map(e=>`<li>${esc(e.name)} — ${esc(e.status)}${e.startTime?' · '+esc(e.startTime):''}${e.endTime?'–'+esc(e.endTime):''}</li>`).join('');
   const inquiryLines=(check.requests||[]).map(e=>`<li>${esc(e.name)} — ${e.holdUntil?'hold until '+esc(new Date(e.holdUntil).toLocaleString()):'open inquiry'}</li>`).join('');
   return `<div class="availability-review" role="group" aria-label="Availability and conflict review"><h3>Availability & conflict check <span class="badge ${ready?'':'purple'}">${ready?'No known conflicts':'Review required'}</span></h3><p>${ready?'No known same-day events or pending inquiries in Event Desk. Confirm outside commitments before proceeding.':'Review these items before making your decision:'}</p>${eventLines||inquiryLines?`<ul>${eventLines}${inquiryLines}</ul>`:''}${(check.reasons||[]).length?`<ul>${check.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`:''}<p class="hint">Checks use Event Desk records only. Outside calendars, travel, equipment and venue rules are not automatically verified.</p>${!ready?`<label class="check-row"><input type="checkbox" data-review-ack="${esc(r.id)}"> I reviewed these details and personally verified that I can take this booking.</label>`:''}</div>`;
  };
  app.innerHTML=head('NEW BUSINESS','Date requests','Review availability before reserving a date or preparing a contract.','<a class="button secondary" href="#inquire">Preview customer intake →</a>')+`<div id="requestRows">${rows.map(r=>{
   const q=normalizeQuote(r.quote,r);
   const reqName=esc(r.name||r.clientName||'Date request');
   const reqDate=esc(r.date||'');
   const reqEmail=esc(r.email||r.clientEmail||'');
   const reqPhone=esc(r.phone||r.clientPhone||'No phone supplied');
   const reqVenue=esc(r.venue||'Venue to be decided');
   const reqNotes=esc(r.notes||r.message||'No additional notes.');
   const wf=r.workflow||{stage:'Pending review',depositReceived:0,planningUnlocked:false};
   return `<section class="card request-card" data-request="${r.id}"><div class="heading"><div><span class="badge">${esc(r.state||'Pending')}</span><h2>${reqName} · ${reqDate}</h2><p>${reqEmail} · ${reqPhone}<br>${reqVenue}</p></div><strong>${money(q.total)}</strong></div><p>${esc(q.package.name)} · ${esc(r.guests||'TBD')} guests · ${r.type==='School dance'?(r.prom?'Prom':'Standard school dance'):r.type!=='Wedding'?esc(r.type): 'Ceremony '+(r.ceremony?'requested':'not requested')+' · Cocktail hour '+(r.cocktail?'requested':'not requested')}</p><p class="preserved-answer">${reqNotes}</p><details><summary>Requested package & extras</summary>${packageDetails(q,esc,money)}</details>${openStates.includes(r.state)?`${availabilityPanel(r)}${reviewForm(r)}<div class="request-actions"><button type="button" data-approve="${r.id}">Preliminarily approve</button><button type="button" class="secondary" data-decline="${r.id}">Decline request</button></div>`:r.eventId?`<p>${esc(wf.stage||'Approved')} · Retainer received ${money(wf.depositReceived||0)} / $250</p><div class="request-actions"><a class="button secondary" href="#event/${r.eventId}">Event HQ</a><a class="button" href="#client-plan/${r.eventId}">${wf.planningUnlocked?'Review planner':'Prepare contract & retainer request'}</a><button type="button" class="secondary" data-access="${r.id}">${wf.planningUnlocked?'Create client planning link':'Create signing-access link'}</button></div>`:''}${r.state==='Declined'?responseDraftCard(r,esc):''}${r.state==='Preliminarily approved'?availabilityPanel(r):''}${inquiryActions(r,q)}${historyPanel(r)}<div class="request-link" role="status"></div></section>`;
  }).join('')||'<section class="card"><p>No requests yet. Try the customer intake preview to create a fictional event request.</p></section>'}</div>`;
 for(const form of app.querySelectorAll('[data-review-form]')){
  const card=form.closest('.request-card'),r=rows.find(row=>row.id===card.dataset.request);
  bindUnknowns(form);
  form.onsubmit=event=>event.preventDefault();
  const estimate=form.querySelector('[data-travel-estimate]');
  form.addEventListener('input',event=>{
   if(event.target.name==='acknowledgeTravel')return;
   form.elements.acknowledgeTravel.checked=false;
   estimate.textContent='';
  });
  form.querySelector('[data-preview-travel]').onclick=async event=>{
   const button=event.currentTarget;
   button.disabled=true;
   try{
    const data=Object.fromEntries(new FormData(form));
    const result=await api('admin/requests/'+r.id+'/travel-preview','POST',{...data,version:r.version});
    estimate.textContent=travelEstimate(result);
   }catch(err){estimate.textContent=err.message;}
   finally{button.disabled=false;}
  };
  form.querySelector('[data-save-details]').onclick=async event=>{
   const button=event.currentTarget;
   button.disabled=true;
   try{
    const result=await api('admin/requests/'+r.id+'/details','POST',{...Object.fromEntries(new FormData(form)),version:r.version});
    await requests();
    message(result.message);
   }catch(err){message(err.message,true,err.field);button.disabled=false;}
  };
  form.querySelector('[data-request-information]').onclick=async event=>{
   const button=event.currentTarget;
   button.disabled=true;
   try{
    const result=await api('admin/requests/'+r.id+'/request-information','POST',{version:r.version});
    await requests();
    const target=app.querySelector('[data-request="'+r.id+'"] .request-link');
    const url=deskUrl()+'#inquiry-update/'+r.id+'/'+result.token;
    const missing=r.missingDetails?.join(', ')||'the venue and event schedule';
    target.innerHTML=`<p>The link works for one submission and expires in seven days.</p><label>Subject<input name="subject" value="A few details for your DJ inquiry"></label>
     <label>Email draft<textarea name="body" rows="7">${esc('Hi '+r.name+',\n\nCould you confirm '+missing+' for your event? You can update those details here:\n'+url+'\n\nThanks,\nDJ Jesse B.')}</textarea></label>
     <label>Customer update link<input readonly value="${esc(url)}"></label><a class="button">Open email draft</a>`;
    const draft=target.querySelector('a'),subject=target.querySelector('[name=subject]'),body=target.querySelector('[name=body]');
    const updateDraft=()=>{draft.href='mailto:'+encodeURIComponent(r.email||'')+'?subject='+encodeURIComponent(subject.value)+'&body='+encodeURIComponent(body.value);};
    target.addEventListener('input',updateDraft);
    updateDraft();
   }catch(err){message(err.message,true,err.field);button.disabled=false;}
  };
 }
 for(const form of app.querySelectorAll('[data-manage-inquiry]'))form.onsubmit=event=>event.preventDefault();
 for(const button of app.querySelectorAll('[data-inquiry-action]'))button.onclick=async()=>{
  const card=button.closest('.request-card'),r=rows.find(row=>row.id===card.dataset.request);
  const data=Object.fromEntries(new FormData(card.querySelector('[data-manage-inquiry]')));
  button.disabled=true;
  try{
   const result=await api('admin/requests/'+r.id+'/'+button.dataset.inquiryAction,'POST',{
    ...data,version:r.version,acknowledgeReview:!!card.querySelector('[data-review-ack]')?.checked
   });
   await requests();
   if(result.eventId&&result.token){
    const current=app.querySelector('[data-request="'+r.id+'"]');
    showLink(current,deskUrl()+'#invite/'+result.token,'Tentative booking created. Prepare the contract before sharing this signing-access link.');
   }
   message(result.message);
  }catch(err){message(err.message,true,err.field);button.disabled=false;}
 };
 const editDecline=(request,reason)=>openDeclineDraft({request,reason,esc,onSave:async draft=>{const result=await api('admin/requests/'+request.id+'/'+(request.state==='Declined'?'response':'decline'),'POST',{...draft,version:request.version});await requests();message(result.message);}});
 app.querySelectorAll('[data-edit-response]').forEach(button=>button.onclick=()=>editDecline(rows.find(r=>r.id===button.dataset.editResponse)));
 app.querySelectorAll('[data-copy-response]').forEach(button=>button.onclick=async()=>{const draft=rows.find(r=>r.id===button.dataset.copyResponse).declineResponse;try{await navigator.clipboard.writeText('Subject: '+draft.subject+'\n\n'+draft.body);button.closest('.saved-decline-draft').querySelector('[data-response-copy-status]').textContent='Response copied. Nothing has been sent.';}catch{button.closest('.saved-decline-draft').querySelector('[data-response-copy-status]').textContent='Copy is unavailable in this browser. Select and copy the response above.';}});
 const showLink=(card,url,label)=>{const box=card.querySelector('.request-link');box.textContent=label;const input=document.createElement('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label','Client access link');input.onclick=()=>input.select();box.append(input);};
 app.querySelectorAll('[data-approve],[data-decline]').forEach(button=>button.onclick=async()=>{const id=button.dataset.approve||button.dataset.decline,r=rows.find(r=>r.id===id),card=button.closest('.request-card');if(button.dataset.decline){editDecline(r,card.querySelector('[name=lodging]')?.value==='Decline'?'travel':'unavailable');return;}const requiresReview=r.availability?.level!=='available';const acknowledged=!!card.querySelector('[data-review-ack]')?.checked;if(requiresReview&&!acknowledged){message('Review the availability warnings and check the confirmation box first.',true);return;}button.disabled=true;try{const result=await api('admin/requests/'+id+'/approve','POST',{version:r.version,acknowledgeReview:acknowledged,travel:Object.fromEntries(new FormData(card.querySelector('[data-review-form]'))),overrideReason:card.querySelector('[name=overrideReason]').value,acknowledgeTravel:card.querySelector('[name=acknowledgeTravel]').checked,holdHours:card.querySelector('[name=holdHours]').value||0});await requests();if(result.eventId){const current=app.querySelector(`[data-request="${id}"]`);const appUrl=(location.origin+location.pathname).replace(/index\.(php|html)$/i,'');showLink(current,appUrl+(result.token?'#invite/'+result.token:'#portal/'+result.eventId),'Preliminary approval saved. Prepare the contract in Event HQ before sharing this signing-access link. No email has been sent.');}message(result.message||'Date approved.');}catch(err){message(err.message,true,err.field);button.disabled=false;}});
 app.querySelectorAll('[data-access]').forEach(button=>button.onclick=async()=>{const r=rows.find(r=>r.id===button.dataset.access);try{const result=await api('admin/events/'+r.eventId+'/access','POST',{email:r.email});const appUrl=(location.origin+location.pathname).replace(/index\.(php|html)$/i,'');showLink(button.closest('.request-card'),appUrl+(result.token?'#invite/'+result.token:'#portal/'+r.eventId),'Copy this link for the client. New-account invitations expire in 24 hours. No email has been sent.');}catch(err){message(err.message,true,err.field);}});
 }
 return {intake,requests,updateDetails};
}
