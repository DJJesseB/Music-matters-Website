export function installQuestionForm(library){
 const close=library.querySelector('.faq-close'),actions=document.createElement('div');actions.className='faq-top-actions';
 const ask=document.createElement('button');ask.type='button';ask.className='primary faq-ask';ask.textContent='Ask a question';
 close.replaceWith(actions);actions.append(ask,close);
 const modal=document.createElement('dialog');modal.className='faq-question';modal.setAttribute('aria-labelledby','faq-question-title');
 modal.innerHTML=`<div class="faq-question-heading"><div><p class="eyebrow">LET’S TALK.</p><h2 id="faq-question-title">What’s on your mind?</h2></div><button class="outline" type="button" data-question-close aria-label="Close question form">Close ×</button></div><p>Send your question to DJ Jesse B. We’ll get back to you by email, and your question may inspire a future FAQ.</p><form><label>Your question<textarea name="question" rows="5" maxlength="5000" required placeholder="What would you like to know?"></textarea></label><div class="faq-question-fields"><label>Your name<input name="name" autocomplete="name" maxlength="120" required></label><label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label></div><div class="faq-question-trap" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div><p class="faq-question-privacy">Your contact details stay private. If we feature your question in the FAQs, we’ll leave out your name, email, and personal details.</p><button class="primary" type="submit">Send question</button><p class="faq-question-status" role="status" aria-live="polite"></p></form>`;
 document.body.append(modal);const form=modal.querySelector('form'),status=modal.querySelector('[role=status]'),send=form.querySelector('[type=submit]');
 ask.onclick=()=>{modal.showModal();modal.querySelector('textarea').focus();};
 modal.querySelector('[data-question-close]').onclick=()=>modal.close();
 modal.addEventListener('close',()=>ask.focus());
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  status.textContent='';
  if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){status.textContent='This is a preview, so your question has not been sent. Email delivery will be connected on the new host.';return;}
  send.disabled=true;send.textContent='Sending…';
  try{
   const values=Object.fromEntries(new FormData(form));
   const netlify=document.querySelector('meta[name="faq-delivery"]')?.content==='netlify';
   let response,result;
   if(netlify){
    response=await fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({'form-name':'event-inquiry',name:values.name,email:values.email,eventType:'FAQ question',message:values.question,'bot-field':values.website})});
   }else{
    response=await fetch(new URL('./faq-question.php',import.meta.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
    result=await response.json().catch(()=>null);
   }
   if(!response.ok||(!netlify&&result?.ok!==true))throw Error(result?.error||'Your question could not be sent. Please email djgourmet@me.com or try again later.');
   form.reset();status.textContent='Thank you! Your question has been sent to DJ Jesse B. We’ll reply by email, and may add an anonymous version of your question to the FAQs.';
  }catch(error){status.textContent=error.message||'Your question could not be sent. Please try again.';}
  finally{send.disabled=false;send.textContent='Send question';}
 });
}
