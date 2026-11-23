export function fieldSelector(path){
 if(typeof path!=='string')return null;
 if(/^answer_[a-zA-Z0-9_]+$/.test(path))return `[name="${path}"]`;
 let m=path.match(/^wedding\.values\.([a-zA-Z0-9_]+)$/);if(m)return `[name="w_${m[1]}"]`;
 m=path.match(/^answers\.([a-zA-Z0-9_]+)$/);if(m)return `[name="answer_${m[1]}"]`;
 if(path==='wedding.moments.ceremony.enabled')return '[name="ceremonyCoverage"][value="Yes"]';
 m=path.match(/^wedding\.moments\.([a-zA-Z0-9_]+)\.(time|details\.[a-zA-Z0-9_]+)$/);if(!m)return null;
 const id=m[1],key=m[2];if(key==='time')return `[data-wedding-clock="moment_${id}"] [data-time-select]`;
 const detail=key.slice(8);if(id==='dinner'&&detail==='end_time')return '[data-wedding-clock="dinner_end"] [data-time-select]';
 if(id==='cocktail'&&detail==='end_time')return '[data-wedding-clock="cocktail_end"] [data-time-select]';
 if(id==='ceremony'&&detail==='end_time')return '[data-wedding-clock="ceremony_end"] [data-time-select]';
 if(id==='ceremony'&&detail==='guest_arrival')return '[data-wedding-clock="ceremony_guests"] [data-time-select]';
 return `[name="wm_${id}_${detail}"]`;
}
let modal,lastTarget;
function clearHighlights(){document.querySelectorAll('[data-validation-highlight]').forEach(el=>{el.removeAttribute('data-validation-highlight');el.removeAttribute('aria-invalid');});}
function reveal(target){
 if(!target?.isConnected)return;
 const details=[];for(let node=target.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')details.push(node);details.reverse().forEach(node=>node.open=true);
 const section=target.closest('[data-section]');if(section?.hidden)document.querySelector(`[data-tab="${section.dataset.section}"]`)?.click();
 target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});target.focus({preventScroll:true});
}
function ensureModal(){
 if(modal)return;modal=document.createElement('dialog');modal.className='validation-dialog';modal.setAttribute('aria-labelledby','validationTitle');modal.setAttribute('aria-describedby','validationMessage');
 modal.innerHTML='<h2 id="validationTitle">Please check your form</h2><p id="validationMessage"></p><p class="validation-reassurance">Your entries are still here. Correct this issue, then try saving or sending again.</p><div class="validation-buttons"><button type="button" data-show-field>Show me where</button><button type="button" class="secondary" data-close-validation>Back to form</button></div>';
 document.body.append(modal);modal.querySelector('[data-close-validation]').onclick=()=>modal.close();modal.querySelector('[data-show-field]').onclick=()=>{const target=lastTarget;modal.close();reveal(target);};
}
export function formMessage(text,error=false,field){
 const notice=document.querySelector('#notice');notice.textContent=text;notice.className=error?'error':'';
 document.querySelectorAll('.action-error').forEach(el=>el.remove());
 if(!error){clearHighlights();if(modal?.open)modal.close();return;}
 const target=typeof field==='string'?(fieldSelector(field)?document.querySelector(fieldSelector(field)):null):field;
 clearHighlights();if(target){target.setAttribute('data-validation-highlight','');target.setAttribute('aria-invalid','true');}
 const form=target?.form||document.querySelector('#clientPlan')||document.querySelector('#booking');const actions=form?.querySelector('.actions');
 if(actions){const inline=document.createElement('p');inline.className='action-error';inline.setAttribute('role','alert');inline.textContent='Not saved/sent: '+text;actions.prepend(inline);const state=actions.querySelector('small');if(state)state.textContent='Please correct the issue and try again.';}
 ensureModal();lastTarget=target;modal.querySelector('#validationMessage').textContent=text;modal.querySelector('[data-show-field]').hidden=!target;if(!modal.open)modal.showModal();
}
let installed=false;
export function installFormValidation(){
 if(installed)return;installed=true;let pending;
 document.addEventListener('invalid',event=>{event.preventDefault();if(pending)return;pending=event.target;
 queueMicrotask(()=>{const input=pending;pending=null;const label=input.closest('label');const directText=node=>[...node?.childNodes||[]].filter(child=>child.nodeType===3).map(child=>child.textContent).join(' ').trim();const name=input.getAttribute('aria-label')||label?.querySelector(':scope > span')?.textContent||directText(label)||input.name||'This field';formMessage(`${name}: ${input.validationMessage||'Please check this value.'}`,true,input);});
 },true);
 document.addEventListener('input',event=>{if(event.target.hasAttribute?.('data-validation-highlight')){event.target.removeAttribute('data-validation-highlight');event.target.removeAttribute('aria-invalid');}});
}
