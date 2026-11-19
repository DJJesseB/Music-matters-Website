import {testimonials} from './reviews-data.85b05f6c5fc6.js';
const full=document.querySelector('.reviews-full');
function element(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function fullReview(review){const figure=element('figure',undefined,'review-card'),mark=element('span','“','review-mark');mark.setAttribute('aria-hidden','true');const quote=document.createElement('blockquote');review.quote.split(/\n\s*\n/).forEach(p=>quote.append(element('p',p)));const caption=document.createElement('figcaption');caption.append(element('strong',review.name),element('span',review.event));figure.append(mark,quote,caption);return figure;}
if(full)full.replaceChildren(...testimonials.map(fullReview));
const grid=document.querySelector('.testimonials .review-grid');
if(grid&&testimonials.length){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const root=element('div',undefined,'review-carousel');root.setAttribute('role','region');root.setAttribute('aria-roledescription','carousel');root.setAttribute('aria-label','Testimonials');
 const stage=element('div',undefined,'review-stage');
 const controls=element('div',undefined,'review-controls');
 const previous=element('button','← Previous'),pause=element('button','Pause rotation'),next=element('button','Next →'),count=element('span','');
 for(const b of [previous,pause,next]){b.type='button';b.className='outline';}
 previous.setAttribute('aria-label','Previous testimonial');next.setAttribute('aria-label','Next testimonial');count.className='review-position';
 const status=element('span','','review-sr-only');status.setAttribute('role','status');status.setAttribute('aria-live','polite');

 controls.append(previous,pause,next);root.append(stage,controls,status);grid.replaceWith(root);
 const cards=testimonials.map((r,i)=>{const b=element('button',undefined,'review-spotlight-card');b.type='button';b.dataset.reviewIndex=String(i);b.setAttribute('aria-label','Read full testimonial from '+r.name);const mark=element('span','“','review-mark');mark.setAttribute('aria-hidden','true');let excerpt=r.quote.split('\n\n')[0];if(excerpt!==r.quote)excerpt+='”';const quote=element('span',excerpt,'review-spotlight-quote'),caption=element('span',undefined,'review-spotlight-caption');caption.append(element('strong',r.name),element('span',r.event),element('span','Read full review ↗','review-expand-label'));b.append(mark,quote,caption);b.onclick=()=>expand(i);stage.append(b);return b;});
 let index=0,userPaused=reduced.matches,timer,animationTimer,visible=false,focused=false,modal,animating=false;
 function eligible(){return testimonials.length>1&&visible&&!userPaused&&!focused&&!document.hidden&&!modal&&!animating;}
 function schedule(){clearTimeout(timer);if(eligible())timer=setTimeout(()=>advance(1),6000);pause.textContent=userPaused?'Play rotation':'Pause rotation';pause.setAttribute('aria-pressed',String(userPaused));}
 function paint(){cards.forEach((b,i)=>{const slot=(i-index+cards.length)%cards.length;b.className='review-spotlight-card '+(slot===0?'is-front':slot===1?'is-next':slot===2?'is-behind':'is-hidden');b.disabled=slot!==0;b.tabIndex=slot===0?0:-1;b.setAttribute('aria-hidden',String(slot!==0));});count.textContent=`${index+1} / ${cards.length}`;schedule();}
 function advance(direction,manual=false){if(animating||cards.length<2)return;clearTimeout(timer);if(manual)status.textContent='';const old=cards[index];index=(index+direction+cards.length)%cards.length;
  if(!reduced.matches){animating=true;paint();old.classList.remove('is-front','is-next','is-behind','is-hidden');old.classList.add(direction>0?'is-leaving-right':'is-leaving-left');animationTimer=setTimeout(()=>{animating=false;paint();},480);}else paint();
  if(manual)status.textContent=`${testimonials[index].name}, review ${index+1} of ${cards.length}`;
 }
 function expand(i){clearTimeout(timer);const trigger=cards[i],r=testimonials[i];modal=document.createElement('dialog');modal.className='review-dialog';modal.setAttribute('aria-labelledby','expanded-review-title');const head=element('div',undefined,'review-dialog-head'),title=element('h2',r.name,'');title.id='expanded-review-title';const close=element('button','Close ×','outline');close.type='button';close.setAttribute('aria-label','Close full testimonial');head.append(title,close);modal.append(head,fullReview(r));document.body.append(modal);const d=modal,overflow=document.body.style.overflow;document.body.style.overflow='hidden';close.onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target!==d)return;const rect=d.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)d.close();});d.addEventListener('close',()=>{document.body.style.overflow=overflow;d.remove();modal=null;if(trigger.isConnected)trigger.focus();schedule();},{once:true});d.showModal();close.focus();}
 previous.onclick=()=>advance(-1,true);next.onclick=()=>advance(1,true);pause.onclick=()=>{userPaused=!userPaused;schedule();};
 root.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();advance(-1,true);}if(e.key==='ArrowRight'){e.preventDefault();advance(1,true);}});

 root.addEventListener('focusin',()=>{focused=true;schedule();});root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget)){focused=false;schedule();}});
 document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',e=>{if(e.matches)userPaused=true;paint();});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:0}).observe(stage);
 if(cards.length===1){previous.hidden=next.hidden=pause.hidden=true;}
 paint();
}
