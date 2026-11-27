import {weddingMoments,weddingSections} from './wedding-schema.js?v=181';
import {dinnerCueEstimate,dinnerMidpoint,lastDanceTime,receptionEstimate} from './reception-timing.js?v=182';
import {formatTime} from './time-input.js?v=180';
import {schoolFields} from './school-schema.js?v=180';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const text=value=>typeof value==='string'?value.trim():typeof value==='number'?String(value):'';
const lines=value=>text(value).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const join=(...values)=>values.map(text).filter(Boolean).join(' · ');
const yes=value=>value===true||value==='Yes';
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
const date=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
 const timestamp=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(timestamp)?new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'UTC'}).format(timestamp):'';
};
const row=(label,value)=>text(value)?'<div class="row"><b>'+escape(label)+'</b><span>'+escape(text(value))+'</span></div>':'';
const rows=entries=>entries.map(([label,value])=>row(label,value)).join('');
const section=(title,body)=>body?'<section><h2>'+escape(title)+'</h2>'+body+'</section>':'';
const cue=(time,title,entries)=>'<article class="cue"><aside>'+escape(time||'TBD')+'</aside><div><h3>'+escape(title)+'</h3>'+rows(entries)+'</div></article>';
const slot=(start,end)=>[formatTime(start),formatTime(end)].filter(Boolean).join(' – ');
const writingLines='<div class="writing-lines" aria-hidden="true"><div></div><div></div><div></div><div></div></div>';

function collection(event){
 const total=Number(event.amount)||0, paid=Number(event.paid)||0;
 const balance=Math.max(0,Math.round((total-paid)*100)/100);
 const due=date(event.balanceDue);
 const action=balance===0?'No balance to collect.':event.balanceDue&&event.balanceDue===event.date
  ?'The balance is due on the event date. Confirm whether to collect it in person and who will pay.'
  :due?'The recorded due date differs from the event date. Verify any on-site collection arrangement.'
  :'No due date or on-site collection instruction is recorded. Confirm before collecting.';
 return section('Day-of collection · DJ only',rows([
  ['Booking total',money(total)],['Paid',money(paid)],['Open balance',money(balance)],
  ['Balance due',due||'Date not recorded'],['Collection',action]
 ])+(balance>0?'<p class="write-in">Confirmed amount __________________ &nbsp; Payer __________________ &nbsp; Method / time __________________</p>':''));
}

function equipment(event){
 const quote=event.weddingPackage||event.schoolPackage||event.privatePackage;
 const booked=(Array.isArray(quote?.items)?quote.items:[]).filter(item=>item?.name&&Number(item.quantity)>0&&!item.pending&&item.name!==quote.package?.name);
 return section('Package and gear',rows([
  ['Package',quote?.package?.name||event.package||'Package not recorded'],
  ['Included',Array.isArray(quote?.package?.features)?quote.package.features.filter(Boolean).join('\n'):''],
  ['Booth',quote?.selection?.booth],['Equipment notes',event.equipment],['Booking notes',event.notes]
 ])+(booked.length?'<h3>Selected add-ons and service lines</h3>'+booked.map(item=>row(item.name,join(item.quantity>1?'Quantity '+item.quantity:'',item.description,item.venueApproval?'Venue approval: '+item.venueApproval:'')||'Selected')).join(''):''));
}

function weddingSetups(event,wedding){
 const values=wedding.values||{},moments=wedding.moments||{};
 const coverage=event.weddingPackage;
 const common=[['Outdoor DJ equipment',values.outdoor_setting],['Tent / overhead cover',values.outdoor_cover||(coverage?.selection?.adminCoverage?.tent?'Tent listed in booked coverage; confirm setup location.':'Provider and cover not recorded.')],['Weather backup',values.outdoor_backup||values.rain||'Confirm indoor backup.']];
 let content='';
 for(const [id,title,gear] of [
  ['ceremony','Ceremony setup','Dedicated ceremony sound and wireless microphones'],
  ['cocktail','Cocktail-hour setup','Separate cocktail-hour sound system and music feed']
 ]){
  const moment=moments[id]||{},d=moment.details||{};
  const included=id==='ceremony'?coverage?.package?.ceremony||coverage?.selection?.adminCoverage?.ceremony:coverage?.cocktailIncluded||coverage?.package?.cocktail||coverage?.selection?.adminCoverage?.cocktail;
  if(!moment.enabled&&!included)continue;
  content+=section(title,rows([
   ['Time',slot(moment.timeTbd?'':moment.time,yes(d.end_tbd)?'':d.end_time)||'TBD'],
   ['Guest arrival',!yes(d.guest_arrival_tbd)&&formatTime(d.guest_arrival)],
   ['Location',join(d.location,id==='ceremony'?(yes(d.same_address)?event.address:d.address):'')||'Confirm exact placement.'],
   ['Indoor / outdoor',values.outdoor_setting==='Yes'?'Outdoor equipment is planned. Confirm the setting for this setup.':'Setting for this setup not recorded.'],
   ['Gear',join(included?gear:'',d.microphone_style,d.microphones)||'Confirm gear requirements.'],
   ['Music',join(d.style,d.style_notes,moment.music)],['Setup notes',moment.notes],
   ['Go cue',d.cue_contact],...common
  ]));
 }
 return content;
}

function formatSpeakers(source){
 let speakers;
 try{speakers=JSON.parse(source||'[]');}catch{return text(source);}
 return Array.isArray(speakers)?speakers.filter(s=>s?.name).map((s,i)=>(i+1)+'. '+join(s.name,s.title,s.relationship)).join('\n'):'';
}

const setupKeys=new Set(['end_time','end_tbd','guest_arrival','guest_arrival_tbd','same_address','speaker_rows','blessing_enabled','blessing_who','blessing_when','toast_enabled','toast_who','toast_when','father_enabled','mother_enabled','other_enabled','time_source']);
const fieldLabels={
 processional:'PLAY · Processional',recessional:'PLAY · Recessional',cue_contact:'WAIT FOR · Go cue',
 introduction:'SAY · Exact introduction',style:'Style',party_order:'STANDBY · Lineup',
 join_in:'Invite guests to join?',join_group:'INVITE',timing:'Timing',speakers:'Speaker order / pronunciations',
 sendoff:'Closing preference',announce:'Announce?',photos:'Invite guests for photos?'
};

function weddingCues(event,wedding){
 const values=wedding.values||{},moments=wedding.moments||{};
 const dinner=moments.dinner||{},d=dinner.details||{};
 const dinnerStart=dinner.enabled&&!dinner.timeTbd?dinner.time:'';
 const dinnerEnd=dinner.enabled&&!yes(d.end_tbd)?d.end_time:'';
 const start=values.reception_start||event.startTime;
 const close=values.reception_end||event.endTime;
 const out=[];
 const add=(time,title,entries)=>out.push(cue(time,title,entries));
 const timing=(id,m)=>{
  if(m.timeTbd)return 'TBD';
  const saved=m.time;
  const auto=m.details?.time_source==='auto';
  const suggested=id==='toasts'&&m.details?.timing==='During dinner'?dinnerMidpoint(dinnerStart,dinnerEnd):
   id==='lastDance'?lastDanceTime(close):dinnerCueEstimate(dinnerEnd,id)||receptionEstimate(start,id)?.time;
  const value=auto?suggested:saved||suggested;
  if(id==='partyIntro'&&saved&&start&&saved<start&&start>='12:00'&&saved<'12:00')return 'CHECK '+formatTime(saved);
  const end=(id==='openDancing'&&moments.cake?.enabled&&!moments.cake.timeTbd)
   ?(moments.cake.details?.time_source==='auto'?dinnerCueEstimate(dinnerEnd,'cake'):moments.cake.time||dinnerCueEstimate(dinnerEnd,'cake'))
   :yes(m.details?.end_tbd)?'':m.details?.end_time;
  const label=slot(value,end);
  return label?(auto||!saved?'Est. ':'')+label:'TBD';
 };
 const parent=()=>{
  const m=moments.specialDances;
  if(!m?.enabled)return;
  const d=m.details||{},before=d.placement==='before';
  for(const [part,id,title] of [['father','fatherDance','Father / daughter dance'],['mother','motherDance','Mother / son dance']]){
   if(!yes(d[part+'_enabled']))continue;
   const saved=d[part+'_time'],auto=d[part+'_time_source']==='auto';
   const estimate=dinnerCueEstimate(before?dinnerStart:dinnerEnd,id,before);
   const time=yes(d[part+'_time_tbd'])?'':formatTime(auto?estimate:saved||estimate);
   add(time?(auto||!saved?'Est. ':'')+time:'TBD',title,[
    ['SAY · Preferred introduction',d[part+'_introduction']],
    ['STANDBY · Parent',join(d[part+'_first'],d[part+'_last'])],
    ['PLAY',join(d[part+'_song_title'],d[part+'_song_artist'])]
   ]);
  }
  if(yes(d.other_enabled))add('TBD','Other specialty dance',[['Cue notes',d.other_details]]);
  if(!(yes(d.father_enabled)||yes(d.mother_enabled)||yes(d.other_enabled))||d.participants||d.selections||d.dance_cue||m.notes||m.music){
   add('TBD','Parent / specialty dance notes',[['Participants',d.participants],['PLAY',join(d.selections,m.music)],['DJ / MC notes',join(d.dance_cue,m.notes)]]);
  }
 };
 const dinnerMic=(kind,when)=>{
  if(yes(d[kind+'_enabled'])&&d[kind+'_when']===when)add(when,kind==='blessing'?'Dinner blessing':'Dinner toast',[
   ['STANDBY · Speaker',d[kind+'_who']||'Confirm speaker.'],['WAIT FOR','Coordinator or catering cue.'],['Dinner notes',dinner.notes]
  ]);
 };
 const momentCue=spec=>{
  const m=moments[spec.id],d=m.details||{};
  const detailRows=Object.entries(spec.fields).filter(([key])=>!setupKeys.has(key)&&!(spec.id==='openDancing'&&['favorites','playlist','styles','dance_music'].includes(key))).map(([key,label])=>[fieldLabels[key]||label,d[key]]);
  const noteKey=spec.id==='secondDance'||spec.id==='partyIntro'?'SAY / CUE':'DJ / MC notes';
  const entries=[['PLAY',m.music],[noteKey,m.notes],...detailRows];
  if(spec.id==='partyIntro'&&timing(spec.id,m).startsWith('CHECK'))entries.unshift(['VERIFY','Saved AM cue is earlier than the evening reception. Confirm the intended time.']);
  if(spec.id==='toasts')entries.push(['SAY / PASS MIC',formatSpeakers(d.speaker_rows)]);
  if(spec.id==='firstDance'&&yes(d.join_in))entries.push(['INVITE · Default cue','After the first verse and chorus, unless noted otherwise.']);
  if(spec.id==='openDancing'||spec.id==='openDancing2')entries.push(['PLAY','See the Dancing Song Requests page.']);
  add(timing(spec.id,m),spec.name,entries);
 };
 if(event.setupTime)add(formatTime(event.setupTime),'Load-in and sound check',[['DO','Set up, test microphones and confirm the cue handoffs.'],['Access',values.setup]]);
 if(moments.ceremony?.enabled&&!yes(moments.ceremony.details?.guest_arrival_tbd)&&moments.ceremony.details?.guest_arrival){
  add(formatTime(moments.ceremony.details.guest_arrival),'Guest arrival and prelude',[['PLAY',moments.ceremony.music]]);
 }
 for(const spec of weddingMoments){
  const m=moments[spec.id];
  if(spec.id==='specialDances'){
   if(m?.details?.placement!=='before'||!dinner.enabled)parent();
   continue;
  }
  if(!m?.enabled)continue;
  if(spec.id==='toasts'&&dinner.enabled&&m.details?.timing==='Before dinner')continue;
  if(spec.id==='dinner'){
   if(moments.specialDances?.details?.placement==='before')parent();
   dinnerMic('blessing','Before dinner');
   dinnerMic('toast','Before dinner');
   const earlyToasts=weddingMoments.find(s=>s.id==='toasts');
   if(moments.toasts?.enabled&&moments.toasts.details?.timing==='Before dinner')momentCue(earlyToasts);
  }
  momentCue(spec);
  if(spec.id==='dinner'){
   dinnerMic('blessing','During dinner');
   dinnerMic('toast','During dinner');
   dinnerMic('blessing','After dinner');
   dinnerMic('toast','After dinner');
   for(const kind of ['blessing','toast'])if(yes(d[kind+'_enabled'])&&!['Before dinner','During dinner','After dinner'].includes(d[kind+'_when'])){
    add('TBD',kind==='blessing'?'Dinner blessing':'Dinner toast',[['Speaker',d[kind+'_who']],['Cue','Confirm timing.']]);
   }
  }
 }
 if(close||event.loadOutTime)add(formatTime(close),'Close and load-out',[['Load-out',formatTime(event.loadOutTime)]]);
 return out.join('');
}

function timelineEntries(plan){
 const timeline=Array.isArray(plan.timeline)?plan.timeline:[];
 return timeline.filter(item=>item&&join(item.detail,item.activity,item.music,item.notes)).map(item=>cue(formatTime(item.time),item.detail||item.activity||lines(item.notes)[0]||'Additional cue',[
  ['PLAY',item.music],['DJ / MC notes',item.notes]
 ])).join('');
}

function requestSheet(eventLabel,plan,musicRequests){
 const dancing=plan.wedding?.moments?.openDancing?.details||{};
 const checklist=(title,items)=>items.length?'<h3>'+escape(title)+'</h3><ul class="checklist">'+items.map(item=>'<li>'+escape(item)+'</li>').join('')+'</ul>':'';
 const approved=musicRequests.filter(request=>request?.status==='Approved'&&!request.requesterBlocked).map(request=>join(request.title,request.artist));
 const excluded=musicRequests.filter(request=>request?.status==='Denied'||request?.requesterBlocked).map(request=>join(request.title,request.artist));
 const played=musicRequests.filter(request=>request?.status==='Played'&&!request.requesterBlocked).map(request=>join(request.title,request.artist));
 const noPlay=[...new Set([...lines(plan.doNotPlay),...excluded])];
 return '<section class="song-page"><h2>Dancing Song Requests</h2><p class="subtitle">'+escape(eventLabel)+'</p>'+
  checklist('Client must-plays',[...new Set(lines(plan.mustPlay))])+checklist('Dance-floor favorites',lines(dancing.favorites))+
  checklist('Approved guest requests',approved)+
  rows([
   ['Already marked played',played.join('\n')],['Do not play',noPlay.join('\n')],
   ['Dance styles',lines(dancing.styles).join(', ')],['Playlist',dancing.playlist||plan.playlist],
   ['Dance-floor notes',join(plan.wedding?.moments?.openDancing?.notes,dancing.dance_music)]
  ])+(!approved.length?' <p>No approved guest requests recorded.</p>':'')+
  '<h3>Requests added on the day</h3>'+writingLines+'</section>';
}

function eventContacts(event,wedding){
 const v=wedding?.values||{};
 const roles=weddingSections[1].fields;
 return section('Day-of contacts',rows([
  ['Primary contact',join(v.primary||event.client?.name,v.phone||event.client?.phone,v.email||event.client?.email)],
  ...Object.entries(roles).map(([key,label])=>[label,join(v[key],v[key+'_phone'],v[key+'_email'])])
 ]));
}

const printStyles=`
 :root{color:#23212a;background:#f2f0f4;font:15px/1.42 system-ui,sans-serif}
 body{max-width:850px;margin:26px auto;padding:0 22px 30px}
 main{background:white;padding:34px 38px}
 .toolbar{display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap}
 button{font:inherit;font-weight:700;padding:9px 15px;border:1px solid #483469;background:#483469;color:white;border-radius:6px;cursor:pointer}
 header{border-top:4px solid #483469;padding:14px 0 9px}
 .eyebrow,.subtitle,aside{color:#483469;font-weight:700}
 .eyebrow{font-size:.8rem;letter-spacing:.05em;margin:0}
 h1{font-size:2.25rem;margin:.12em 0}h2{font-size:1.25rem;margin:1.35em 0 .25em;color:#483469}
 h3{font-size:1rem;margin:0 0 5px}p{margin:.35em 0 .6em}
 section>h3,.song-page>h3{margin-top:12px}
 .row{display:grid;grid-template-columns:minmax(9.1em,25%) minmax(0,1fr);gap:10px;padding:4px 0;break-inside:avoid}
 .row span{white-space:pre-wrap;overflow-wrap:anywhere}.row b{line-height:1.3}
 .cue{display:grid;grid-template-columns:8em minmax(0,1fr);gap:12px;border-top:1px solid #dbd6e2;padding:10px 0;break-inside:avoid}
 aside{font-size:.88em}.cue .row{grid-template-columns:minmax(7em,25%) minmax(0,1fr)}
 .write-in{color:#484450;margin-top:12px;overflow-wrap:anywhere}
 .checklist{list-style:none;padding-left:0;margin:.4em 0 .75em;columns:2;column-gap:24px}
 .checklist li{break-inside:avoid;margin:0 0 5px}
 .checklist li:before{content:'';display:inline-block;width:.72em;height:.72em;border:1px solid #483469;margin-right:8px}
 .writing-lines{break-inside:avoid}.writing-lines div{height:26px;border-bottom:1px solid #bbb}
 h2,h3{break-after:avoid}
 @page{size:letter;margin:.55in}
 @media print{
  :root{background:white;font-size:11pt}body,main{padding:0;margin:0;max-width:none}
  .toolbar{display:none}.song-page{break-before:page}
  body.songs-only main>:not(.song-page){display:none}body.songs-only .song-page{break-before:auto}
 }
 @media screen and (max-width:600px){main{padding:20px}.cue{grid-template-columns:1fr;gap:3px}.row,.cue .row{grid-template-columns:1fr;gap:1px}.checklist{columns:1}}
`;

export function playbookDocument({event={},plan={},musicRequests=[]}={}){
 const wedding=event.type==='Wedding'?plan.wedding:null;
 const w=wedding||{};
 const v=w.values||{};
 const eventLabel=join(event.name,date(event.date),event.venue);
 const saved=plan.version?'Saved planner v'+plan.version:'No planner draft saved';
 const schedule=join(
  formatTime(event.setupTime)&&'Setup '+formatTime(event.setupTime),
  slot(v.reception_start||event.startTime,v.reception_end||event.endTime),
  formatTime(event.loadOutTime)&&'Load-out '+formatTime(event.loadOutTime)
 );
 const earlierLabels={contacts:'Earlier contact notes',announcements:'Earlier announcement notes',logistics:'Earlier logistics notes'};
 const answers=Object.entries(plan.answers||{}).map(([key,value])=>[(event.type==='School dance'?schoolFields[key]:earlierLabels[key])||key,value]);
 const weddingNotes=weddingSections.slice(2).flatMap(s=>Object.entries(s.fields)).filter(([key])=>key!=='intro_exact').map(([key,label])=>[label,v[key]]);
 const extra=timelineEntries(plan);
 const cues=wedding?weddingCues(event,w):[
  event.setupTime?cue(formatTime(event.setupTime),'Load-in and sound check',[['Equipment notes',event.equipment]]):'',
  event.startTime?cue(formatTime(event.startTime),'Event starts',[]):'',
  extra,
  event.endTime||event.loadOutTime?cue(formatTime(event.endTime),'Close and load-out',[['Load-out',formatTime(event.loadOutTime)]]):''
 ].join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(event.name||'Event')+' · DJ Day-of Playbook</title><style>'+printStyles+'</style></head><body>'+
  '<div class="toolbar"><button type="button" data-print-playbook>Print playbook</button><button type="button" data-print-songs>Print song requests only</button><span>Browser print options include Save as PDF.</span></div><main>'+
  '<header><p class="eyebrow">DJ DAY-OF PLAYBOOK</p><h1>'+escape(event.name||'Event')+'</h1><p class="subtitle">'+escape(join(date(event.date),event.venue,event.guests?event.guests+' guests':''))+'</p><p>'+escape(join(saved,'DJ working copy'))+'</p></header>'+
  section('Event essentials',rows([
   ['Booking',join(event.type,event.status)],['Address',event.address||v.address],['Schedule',schedule],
   ['Couple',join(join(v.bride_first,v.bride_maiden).replace(' · ',' '),join(v.groom_first,v.groom_last).replace(' · ',' '))],['Introduction style',v.intro_style?.replaceAll('_',' ')],
   ['Exact introduction',w.moments?.entrance?.details?.introduction||v.intro_exact]
  ]))+
  eventContacts(event,wedding)+
  equipment(event)+collection(event)+(wedding?weddingSetups(event,w):'')+
  section('Run of show',cues||'<p>No timed moments saved yet.</p>')+
  (wedding&&extra?section('Additional moments and earlier cues','<p>Check these against the wedding cues before calling a repeated or conflicting moment.</p>'+extra):'')+
  section('Coordination and notes',rows([...weddingNotes,...answers]))+
  section('Day-of changes',writingLines)+
  requestSheet(eventLabel,plan,Array.isArray(musicRequests)?musicRequests:[])+'</main></body></html>';
}

export function bindPlaybookButton(button,{id,api,message}){
 if(!button)return;
 button.onclick=async()=>{
  const preview=window.open('','_blank');
  if(!preview){message('Allow pop-ups for DJ Desk, then try Print Day-of Playbook again.',true);return;}
  preview.opener=null;
  preview.document.title='Loading DJ Day-of Playbook';
  preview.document.body.textContent='Loading the saved booking and planner…';
  button.disabled=true;
  try{
   const data=await api('admin/events/'+encodeURIComponent(id)+'/plan');
   if(preview.closed)return;
   preview.document.open();
   preview.document.write(playbookDocument(data));
   preview.document.close();
   function print(songsOnly){
    preview.document.body.classList.toggle('songs-only',songsOnly);
    preview.print();
   }
   preview.document.querySelector('[data-print-playbook]').onclick=()=>print(false);
   preview.document.querySelector('[data-print-songs]').onclick=()=>print(true);
   preview.addEventListener('afterprint',()=>preview.document.body.classList.remove('songs-only'));
  }catch(error){
   if(!preview.closed)preview.close();
   message(error.message||'Could not load the saved playbook.',true);
  }finally{
   button.disabled=false;
  }
 };
}
