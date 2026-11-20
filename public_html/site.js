const chooser=document.querySelector('dialog[aria-labelledby="choose-title"]'),login=document.querySelector('#client-access');
document.querySelectorAll('[data-request]').forEach(button=>button.onclick=()=>chooser.showModal());chooser.querySelector('.close').onclick=()=>chooser.close();
document.querySelectorAll('[data-event]').forEach(link=>link.onclick=()=>{document.querySelector('[name=eventType]').value=link.dataset.event;if(chooser.open)chooser.close();});
if(login){login.querySelector('[data-close-login]')?.addEventListener('click',()=>login.close());login.querySelector('[data-contact-login]')?.addEventListener('click',()=>login.close());}
for(const dialog of [chooser,login])dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
