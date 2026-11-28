import {mountPlannerMusic} from './music-ui.js?v=180';
import {chooseEvent} from './event-picker.js?v=180';
import {mountSchool} from './school-ui.js?v=180';
import {schoolFields} from './school-schema.js?v=180';
import {depositPolicy,calculateDeposit} from './pricing.js?v=180';
import {mountPackageSummary} from './package-ui.js?v=205';
import {timeField,bindTimeFields,readTime} from './time-input.js?v=180';
import {mountWedding} from './wedding-ui.js?v=192';
import {bindPlaybookButton} from './playbook.js?v=1';
import {mountContracts} from './contracts-ui.js?v=229';
import {stripePaymentUrl} from './stripe-ui.js?v=182';
import {mountSchoolInvoices,showSchoolInvoice} from './school-invoice-ui.js?v=234';

export function momentTitle(item) {
 const title = [item.detail, item.activity].find(value => typeof value === 'string' && value.trim());
 if (title) return title.trim();
 const source = [item.notes, item.music].find(value => typeof value === 'string' && value.trim());
 if (!source) return '';
 const line = source.trim().split(/\r?\n/, 1)[0].trim();
 return line.length <= 80 ? line : line.slice(0, 79).trimEnd() + '…';
}
function mountClock(anchor,event){
 const card=document.createElement('section');card.className='event-clock card';
 card.innerHTML='<div class="clock-heading"><div><h2>Event clock</h2></div><button type="button" class="clock-toggle" aria-expanded="false" aria-controls="liveEventClock">◷ &nbsp; Show live clock & countdown</button></div><div id="liveEventClock" hidden><div class="clock-displays"><div><span>Current local time</span><strong id="clockTime"></strong><small id="clockDate"></small></div><div><span id="countdownLabel"></span><strong id="clockCountdown"></strong><small id="countdownDate"></small></div></div><p class="clock-zone">Times use this device’s timezone.</p></div>';
 anchor.before(card);
 const button=card.querySelector('button'),panel=card.querySelector('#liveEventClock');let timer;
 function update(){
 if(!card.isConnected){clearInterval(timer);return;}
 const now=new Date();card.querySelector('#clockTime').textContent=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});card.querySelector('#clockDate').textContent=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
 const target=new Date(event.date+'T'+(event.startTime||'00:00')+':00');
 card.querySelector('#countdownDate').textContent=target.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+(event.startTime?' · '+target.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}):' · Start time to be arranged');
 card.querySelector('#countdownLabel').textContent=event.startTime?'Until your event starts':'Until your event day';
 if(event.startTime){const seconds=Math.max(0,Math.floor((target-now)/1000));card.querySelector('#clockCountdown').textContent=target<=now?'Event start time has arrived':`${Math.floor(seconds/86400)}d ${String(Math.floor(seconds/3600)%24).padStart(2,'0')}h ${String(Math.floor(seconds/60)%60).padStart(2,'0')}m ${String(seconds%60).padStart(2,'0')}s`;}
 else{const days=Math.round((Date.UTC(target.getFullYear(),target.getMonth(),target.getDate())-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);card.querySelector('#clockCountdown').textContent=days>0?`${days} day${days===1?'':'s'}`:days===0?'Today’s the day!':'Event day has passed';}
 }
 button.onclick=()=>{panel.hidden=!panel.hidden;const expanded=!panel.hidden;button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Hide live clock & countdown':'◷  Show live clock & countdown';clearInterval(timer);if(expanded){update();timer=setInterval(update,1000);}};
}
function disclosePlannerSections(form){
 for(const disclosure of form.querySelectorAll(':scope > details.card')){
  disclosure.classList.remove('collapsed-planner-section');
  disclosure.classList.add('client-plan-section');
  const summary=disclosure.querySelector(':scope > summary');
  const content=document.createElement('div');
  content.className='client-plan-section-content';
  content.append(...[...disclosure.childNodes].filter(node=>node!==summary));
  disclosure.append(content);
 }
 const sections=[...form.querySelectorAll(':scope > section.card')];
 sections.forEach(section=>{
  const heading=section.querySelector(':scope > h2');
  if(!heading)return;
  const disclosure=document.createElement('details');
  disclosure.className=section.className+' client-plan-section';
  const summary=document.createElement('summary');
  heading.textContent=heading.textContent.replace(/^\d+\. /,'');
  summary.append(heading);
  section.querySelector(':scope > .badge')?.remove();
  const content=document.createElement('div');
  content.className='client-plan-section-content';
  content.append(...section.childNodes);
  disclosure.append(summary,content);
  section.replaceWith(disclosure);
 });
}
export function portalUI({api,app,head,esc,field,area,money,date,message,onLogin,onDirty}){
 function login(invite=''){
 const signInForm=`<form id="signin">${invite?'':field('Email','email','','email','required autocomplete="username"')}${field('Password','password','','password',`required minlength="${invite?14:1}" maxlength="200" autocomplete="${invite?'new-password':'current-password'}"`)}<button type="submit" class="${invite?'':'secondary'}">${invite?'Continue to your event':'Sign in'} →</button><p id="loginError" role="alert"></p></form>`;
 app.innerHTML=invite?head('YOUR EVENT, YOUR WAY','Welcome to your event.','Create a password with at least 14 characters to open your private event workspace.')+`<section class="card login-card">${signInForm}</section>`:head('DJ JESSE B · LET’S MAKE IT MEMORABLE','Your next great event starts here.','Music, energy, and a celebration that feels like you.','<a class="button secondary" href="../" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:700;color:#b6ff35;padding:10px 16px;border:1px solid #64734e;border-radius:8px;">← Return to Main Website</a>')+`<section class="card request-date-hero" aria-labelledby="requestDateTitle"><span class="badge purple">LET’S PLAN SOMETHING GREAT</span><h2 id="requestDateTitle">Have a date in mind?</h2><p>Tell us what you’re celebrating, explore your options, and request your date with DJ Jesse B.</p><div class="event-type-tags"><span>Weddings</span><span>School dances & proms</span><span>Private parties</span><span>Corporate events</span></div><a class="button request-date-primary" href="#inquire">Request a date →</a><p class="request-date-note">Start with your event. DJ Jesse B will review availability and help with the details.</p></section><section class="card login-card secondary-signin" aria-labelledby="returningClientTitle"><h2 id="returningClientTitle">Already planning with us?</h2><p>Clients and DJ Jesse B can sign in to their workspace below.</p>${signInForm}<p style="margin-top:20px;text-align:center;"><a href="../" style="color:var(--lime);font-size:13px;font-weight:700;text-decoration:none;">← Return to Main Website</a></p></section><details class="card login-card demo-accounts"><summary>Explore the local demo</summary><p>Fictional accounts only.</p><p><b>Admin:</b> admin@example.com<br><code>ElectricNight!Demo27</code></p><p><b>Wedding client:</b> demo0@example.com<br><code>Wedding!Demo2027</code></p><p><b>School dance client:</b> demo1@example.com<br><code>SchoolDance!Demo2027</code></p></details>`;

 if(!invite)app.querySelector('.request-date-primary').addEventListener('click',event=>{event.preventDefault();chooseEvent(choice=>{location.hash='#inquire/'+choice.id;});});
 document.querySelector('#signin').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{const result=await api('auth/'+(invite?'accept':'login'),'POST',invite?{token:invite,password:f.elements.password.value}:{email:f.elements.email.value,password:f.elements.password.value});await onLogin(result);}catch(err){document.querySelector('#loginError').textContent=err.message;message(err.message,true,err.field);b.disabled=false;}};
 }
 async function home(){const events=await api('portal/events');app.innerHTML=head('WELCOME TO YOUR BACKSTAGE PASS','Your celebration starts here.','A little planning. A lot of great memories.','<a class="button secondary" href="../" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:700;color:#b6ff35;padding:10px 16px;border:1px solid #64734e;border-radius:8px;">← Return to Main Website</a>')+`<div class="columns">${events.map(e=>`<section class="card"><span class="badge purple">${esc(e.type)}</span><h2>${esc(e.name)}</h2><p>${date(e.date)} · ${esc(e.venue||'Venue to be decided')}</p><p>${esc(e.status)} · Contract ${esc(e.contractStatus.toLowerCase())}</p><a class="button" href="#portal/${e.id}">${e.bookingStep?.stage==='retainer'?'Pay retainer →':e.bookingStep?.stage==='contract'?'Review contract →':'Plan your event →'}</a></section>`).join('')||'<section class="card"><h2>No events shared yet</h2><p>Ask DJ Jesse B to grant your account access.</p></section>'}</div>`;}
 function bookingProgress(stage, school=false) {
  const steps=[['contract','Sign contract'],['retainer',school?'Get school invoice':'Pay retainer'],['planning','Plan your event']];
  const current=steps.findIndex(([key])=>key===stage);
  return `<ol class="booking-progress" aria-label="Booking steps">${steps.map(([key,label],index)=>
   `<li${key===stage?' aria-current="step"':''}><span aria-hidden="true">${index<current?'✓':index+1}</span><strong>${label}</strong><small>${index<current?'Complete':index===current?'Current step':'Upcoming'}</small></li>`).join('')}</ol>`;
 }

 async function bookingStep(event, signedNow) {
  const step=event.bookingStep;
  const contractOnly=event.accessMode==='contract';
  const retainer=step.stage==='retainer';
  const title=retainer?'Pay your retainer':step.signed?'Your contract is signed':'Review and sign your contract';
  app.innerHTML=`<div class="client-plan-header"><div class="client-plan-nav"><a href="#portal">← My events</a></div>
   <p>${esc(event.name)}${event.date?' · '+date(event.date):''}</p>
   <h1 tabindex="-1" data-booking-step-heading>${title}</h1></div>
   ${contractOnly?'':bookingProgress(step.stage,event.type==='School dance')}
   ${retainer?`<section class="card booking-retainer"><p>${signedNow?'Your contract is signed. ':''}Your planner opens as soon as your retainer is confirmed.</p>
    <h2>Retainer remaining <strong data-retainer-amount>${money(step.retainerRemaining)}</strong></h2>
    <div data-retainer-invoice aria-live="polite"></div>
    <details><summary>Pay by check, money order, or cash</summary><p>Contact DJ Jesse B to arrange delivery or in-person payment. Your planner opens once Jesse confirms receipt.</p></details>
    <div class="actions"><button type="button" class="secondary" data-retainer-refresh>Check payment status</button><small data-retainer-status role="status"></small></div>
   </section>`:`<p>${contractOnly?(step.signed?'You can download the signed contract below.':'The primary contact manages the retainer and planner.'):event.type==='School dance'?'Review the agreement below. After signing, you can prepare an invoice for your school business office and start planning.':'Review the agreement below. After it’s signed, you’ll continue to your next booking step.'}</p>`}
   <div data-portal-anchor hidden></div>`;
  const heading=app.querySelector('[data-booking-step-heading]');
  heading.focus();
  const panel=app.querySelector('.booking-retainer');
  if(panel){
   const button=panel.querySelector('[data-retainer-refresh]');
   const status=panel.querySelector('[data-retainer-status]');
   const invoice=panel.querySelector('[data-retainer-invoice]');
   const isCurrent=()=>panel.isConnected&&location.hash==='#portal/'+event.id;
   async function showInvoice(amount) {
    let content='<p>Your secure payment link will appear here when DJ Jesse B issues your retainer invoice.</p>';
    try {
     const {invoices}=await api('portal/events/'+event.id+'/stripe');
     const url=(invoices||[]).filter(item=>item.kind==='retainer'&&item.status==='open'&&Number(item.amount)===Math.round(amount*100))
      .map(item=>stripePaymentUrl(item.url)).find(Boolean);
     if(url)content=`<p><a class="button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Pay retainer securely (opens in a new tab) ↗</a></p>`;
    } catch {
     content='<p>The online payment link could not load. Check payment status to try again.</p>';
    }
    if(isCurrent()&&invoice.innerHTML!==content)invoice.innerHTML=content;
   }
   let checking=false;
   async function checkPayment(manual) {
    if(!isCurrent()||checking)return;
    checking=true;
    if(manual){button.disabled=true;status.textContent='Checking payment…';}
    try {
     const updated=(await api('portal/events')).find(item=>item.id===event.id);
     if(!isCurrent())return;
     if(!updated)throw Error('This booking is no longer available.');
     if(updated.bookingStep?.stage!=='retainer'){
      await plan(event.id,false,updated,false,true);
      return;
     }
     panel.querySelector('[data-retainer-amount]').textContent=money(updated.bookingStep.retainerRemaining);
     await showInvoice(updated.bookingStep.retainerRemaining);
     if(manual)status.textContent='Your retainer is still awaiting confirmation.';
    } catch {
     if(manual)status.textContent='Payment status could not load. Please try again.';
    } finally {
     checking=false;
     button.disabled=false;
    }
   }
   async function checkWhileOpen() {
    if(!isCurrent())return;
    if(!document.hidden)await checkPayment(false);
    if(isCurrent())setTimeout(checkWhileOpen,15000);
   }
   button.onclick=()=>checkPayment(true);
   setTimeout(checkWhileOpen,15000);
   void showInvoice(step.retainerRemaining);
  }
  await mountContracts({api,app,event,admin:false,esc,money,date,message,showPayments:false,openContract:!retainer,
   onSigned:async()=>{ if(heading.isConnected)await plan(event.id,false,null,true,true); }});
 }

 const shownInvoices=new Set();
 async function plan(id,admin=false,shared=null,signedNow=false,focus=false) {
  if(!admin){
   shared=shared||(await api('portal/events')).find(event=>event.id===id);
   if(!shared)throw Error('This booking is no longer available.');
   if(!shared.bookingStep)throw Error('Booking status is unavailable. Refresh to try again.');
   if(shared.bookingStep.stage!=='planning'){
    await bookingStep(shared,signedNow);
    return;
   }
   const schoolContract=shared.bookingStep.schoolInvoiceContractId;
   const key='djdesk-school-invoice:'+id+':'+schoolContract;
   let acknowledged=shownInvoices.has(key);
   try{acknowledged ||= sessionStorage.getItem(key)==='seen';}catch{}
   if(schoolContract&&!acknowledged){
    app.innerHTML=head('SCHOOL DANCE',esc(shared.name),'Your contract has been signed.');
    await showSchoolInvoice({api,event:shared,esc,money,app});
    shownInvoices.add(key);
    try{sessionStorage.setItem(key,'seen');}catch{}
    if(location.hash!=='#portal/'+id)return;
    focus=true;
   }
  }
const prefix=(admin?'admin':'portal')+'/events/'+id;const {event:e,fields,musicRequests,plan}=await api(prefix+'/plan');let p=plan;const answers=p.answers||{};
 const back = admin ? '#event/'+esc(id) : '#portal';
 app.innerHTML = `<div class="client-plan-header">
  <div class="client-plan-nav"><a href="${back}">← ${admin?'Event HQ':'My events'}</a><a href="../">Main website</a>${admin?'<button type="button" class="secondary" data-open-playbook>Print Day-of Playbook</button>':''}</div>
  <h1 tabindex="-1" data-planner-heading>${esc(e.name)}</h1>
  <p>${e.date?date(e.date):'Date to be decided'} · ${esc(e.venue||'Venue to be decided')}</p>
  <p class="client-plan-status">Booking · <strong>${esc(e.status)}</strong> <span>Contract · <strong data-contract-status>${esc(e.contractStatus)}</strong></span></p>
 </div>
 ${!admin&&shared.bookingStep.managed?bookingProgress('planning',e.type==='School dance'):''}
 ${!admin&&shared.bookingStep.schoolInvoiceContractId?'<p><button type="button" class="button secondary" data-open-school-invoice>School business office invoice</button></p>':''}
 <div class="client-plan-intro">
  <h2>${esc(e.type)} planner</h2>
  <p id="planHint">${p.submitted?'Submitted for DJ review. Saving a new draft reopens your planner.':'Save a draft anytime. Submit when your plans are ready for DJ review.'}</p>
 </div>${!admin&&e.type==='Wedding'?`<section class="card" aria-labelledby="plannerAdviceTitle">
  <span class="badge purple">A LITTLE ADVICE FROM DJ JESSE B</span>
  <h2 id="plannerAdviceTitle">How Do You Eat an Elephant?</h2>
  <p><strong>One bite at a time!</strong> Your wedding planner doesn't need to be completed in one sitting. Take your time, enjoy the process, and remember that I'm here to help you every step of the way.</p>
  <a class="button secondary" href="../faq/#how-do-you-eat-an-elephant" target="_blank" rel="noopener">Read My Planning Advice (opens in a new tab)</a>
  <p><em>— DJ Jesse B.</em></p>
 </section>`:''}<form id="clientPlan"><section class="card"><h2>Event details</h2><div class="grid">${Object.entries(fields).map(([k,label])=>area(esc(label),'answer_'+k,answers[k]||'')).join('')}</div></section><section class="card"><h2>Music preferences</h2><div class="grid">${area('Must-play songs & special requests','mustPlay',p.mustPlay)}${area('Do-not-play songs & artists','doNotPlay',p.doNotPlay)}${field('Playlist link (HTTPS)','playlist',p.playlist,'url')}</div></section><section class="card"><h2>Event timeline</h2><p>Use local event times. Add up to 50 moments; order them as you want them to appear.</p><div id="moments"></div><button class="secondary" id="addMoment" type="button">＋ Add a moment</button></section><div class="actions"><button type="submit" name="draft">Save draft</button><button class="secondary" type="submit" name="submit">Submit for DJ review</button><small id="planState">${p.version?'Saved planner'+(p.savedAt?' · Last saved '+new Date(p.savedAt).toLocaleString():''):'No draft saved yet'}</small></div></form><details class="card client-plan-tools">
  <summary>Booking tools <small>Contract, payments, services &amp; event clock${admin?' · Client access and DJ tools':''}</small></summary>
  <div class="client-plan-tool-content">
   <details class="card">
    <summary>Payment summary</summary>
    <dl class="client-plan-billing">
     <div><dt>Paid</dt><dd>${money(e.paid)}<small>Includes ${money(e.depositReceived)} of ${money(e.depositRequired ?? calculateDeposit(e.amount))} required retainer</small></dd></div>
     <div><dt>Remaining</dt><dd>${money(e.amount-e.paid)}<small>${e.balanceDue?'Due '+date(e.balanceDue):'Due date to be arranged'}</small></dd></div>
    </dl>
    <p class="deposit-policy">${esc(depositPolicy)}</p>
   </details>
   <div data-portal-anchor hidden></div>${admin?`<section class="card"><h2>Client access</h2><p>Grant access to an existing client or create a one-use invitation for a new client. Links expire after 24 hours.</p><div id="members"></div><form id="access"><label>Client email<input type="email" name="email" required></label><button type="submit">Create invitation / grant access</button></form><div id="invitation" role="status"></div></section>`:''}</div></details>`;
 const schoolInvoice=app.querySelector('[data-open-school-invoice]');
 if(schoolInvoice)schoolInvoice.onclick=()=>showSchoolInvoice({api,event:e,esc,money,app});
 if(focus)app.querySelector('[data-planner-heading]').focus();
 if(signedNow)message('Contract signed. Your planner is ready.');
 const tools=app.querySelector('.client-plan-tools');
 const anchor=tools.querySelector('[data-portal-anchor]');
 if(admin){
  mountPlannerMusic({app,event:e,requests:musicRequests,esc});
  anchor.before(app.querySelector('.planner-music-history'));
 }
 mountClock(anchor,e);
 mountPackageSummary({app:tools,event:e,plan:p,esc,money});
 await mountContracts({api,app,event:e,admin,esc,money,date,message});
 if(admin&&e.type==='School dance')await mountSchoolInvoices({api,app,event:e,esc,money,message});
 const form=app.querySelector('#clientPlan');
 const answerKeys=Object.keys(e.type==='School dance'?{...fields,...schoolFields}:fields);
 if(admin)bindPlaybookButton(app.querySelector('[data-open-playbook]'),{id,api,message});
 const changed=()=>{onDirty(true);document.querySelector('#planState').textContent='Unsaved changes';};
 if(e.type==='School dance')mountSchool({form,event:e,plan:p,esc,field,area,admin});
 const weddingController=e.type==='Wedding'?mountWedding({form,event:e,plan:p,admin,esc,field,area,changed}):null;const moments=document.querySelector('#moments');
 const readMoment = row => ({
  time: readTime(row),
  detail: row.querySelector('[name=detail]').value,
  ...(['Wedding','School dance'].includes(e.type) ? {
   music: row.querySelector('[name=extraMusic]').value,
   notes: row.querySelector('[name=extraNotes]').value
  } : {})
 });
 function moment(item={time:'',detail:''}){
  const row=document.createElement('div');
  row.className='timeline-row';
  row.innerHTML=timeField('Moment time','momentTime',item.time,true)+field('Moment / announcement','detail',momentTitle(item),'text','maxlength="5000"')+(['Wedding','School dance'].includes(e.type)?area('Music / song / artist','extraMusic',item.music)+area('DJ / MC notes','extraNotes',item.notes):'')+'<button type="button" class="secondary" aria-label="Remove timeline moment">Remove</button>';
  const title=row.querySelector('[name=detail]');
  const updateTitle=()=>{
   const {notes,music}=readMoment(row);
   const suggested=momentTitle({notes,music});
   title.required=!suggested;
   title.placeholder=suggested;
  };
  bindTimeFields(row);
  updateTitle();
  row.addEventListener('input',updateTitle);
  row.querySelector('button').onclick=()=>{row.remove();changed();};
  moments.append(row);
 }
 p.timeline.forEach(moment);document.querySelector('#addMoment').onclick=()=>{if(moments.children.length<50){moment();changed();}};form.addEventListener('input',changed);
 disclosePlannerSections(form);
 if(admin&&location.hash.endsWith('?contract')){
  const workspace=app.querySelector('#contractWorkspace');
  if(workspace){
   tools.open=true;
   workspace.open=true;
   workspace.scrollIntoView({block:'start'});
   workspace.querySelector('[name=email]')?.focus({preventScroll:true});
  }
 }
 form.onsubmit=async event=>{event.preventDefault();const f=new FormData(form),payload={version:p.version,answers:{},mustPlay:f.get('mustPlay'),doNotPlay:f.get('doNotPlay'),playlist:f.get('playlist'),submitted:event.submitter?.name==='submit',timeline:[...moments.children].map(row=>{const item=readMoment(row);return {...item,detail:momentTitle(item)};})};if(weddingController){payload.wedding=weddingController.read();payload.answers=p.answers;}else {payload.answers={...p.answers};for(const k of answerKeys){if(f.has('answer_'+k))payload.answers[k]=f.get('answer_'+k);}}const buttons=form.querySelectorAll('[type=submit]');buttons.forEach(b=>b.disabled=true);try{const data=await api(prefix+'/plan','PUT',payload);p=data.plan;const savedNotice=app.querySelector('[data-planner-save-status]');if(savedNotice)savedNotice.textContent='Planner: '+data.event.plannerStatus;onDirty(false);document.querySelector('#planHint').textContent=p.submitted?'Submitted for DJ review. Saving a new draft reopens your planner.':'Draft saved. Submit when your plans are ready for DJ review.';document.querySelector('#planState').textContent=(payload.submitted?'Submitted for DJ review':'Draft saved')+' · Last saved '+new Date(p.savedAt).toLocaleString();message(payload.submitted?'Your planner is ready for DJ review.':'Your draft has been saved.');}catch(err){message(err.message,true,err.field);}finally{buttons.forEach(b=>b.disabled=false);}};
 const savedNotice=document.createElement('p');savedNotice.className='planner-save-status';savedNotice.dataset.plannerSaveStatus='';savedNotice.textContent='Planner: '+e.plannerStatus;app.querySelector('.client-plan-intro').append(savedNotice);
 if(admin){const refresh=async()=>{const a=await api(prefix+'/access');const target=document.querySelector('#members');target.innerHTML=a.members.map(m=>`<div class="event"><span>${esc(m.email)}${m.accessMode==='contract'?' · Contract signing only':' · Planner access'}</span><button type="button" class="secondary" data-email="${esc(m.email)}">Revoke access</button></div>`).join('')||'<p>No client accounts have access yet.</p>';target.querySelectorAll('button').forEach(b=>b.onclick=async()=>{try{await api(prefix+'/access','DELETE',{email:b.dataset.email});await refresh();message('Client access revoked.');}catch(err){message(err.message,true,err.field);}});};await refresh();document.querySelector('#access').onsubmit=async event=>{event.preventDefault();try{const email=event.currentTarget.elements.email.value,workspace=app.querySelector('#contractWorkspace'),signer=workspace?.querySelector('#issueContract [name=email]'),other=workspace?.dataset.primaryEmail&&email.toLowerCase()!==workspace.dataset.primaryEmail;const r=await api(prefix+'/access','POST',{email,...(other?{scope:'contract',name:signer?.selectedOptions[0]?.textContent.split(' — ')[0]||email}:{})});const target=document.querySelector('#invitation');target.textContent=r.message;if(r.token){const input=document.createElement('input');input.readOnly=true;input.setAttribute('aria-label','Private invitation link');const appUrl=(location.origin+location.pathname).replace(/index\.(php|html)$/i,'');input.value=appUrl+'#invite/'+r.token;target.append(input);}await refresh();}catch(err){message(err.message,true,err.field);}};}
 }
 return {login,home,plan};
}
