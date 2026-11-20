const valid=time=>typeof time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function formatTime(time){if(!valid(time))return '';const [hour,minute]=time.split(':');return `${Number(hour)%12||12}:${minute} ${Number(hour)<12?'AM':'PM'}`;}
export function parseTime(raw){
 if(typeof raw!=='string')return null;
 const match=raw.trim().toLowerCase().replace(/\s/g,'').match(/^(\d{1,2})(?::?(\d{2}))?(am?|pm?)?$/);if(!match)return null;
 let hour=Number(match[1]);const minute=Number(match[2]||0),period=match[3];if(minute>59)return null;
 if(period){if(hour<1||hour>12)return null;hour=hour%12+(period[0]==='p'?12:0);}else if(hour>23)return null;
 return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}
export function timeOptions(saved=''){
 const values=Array.from({length:96},(_,i)=>`${String(Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`);if(valid(saved)&&!values.includes(saved))values.push(saved);const order=time=>{const [h,m]=time.split(':').map(Number);return (h*60+m+720)%1440;};return values.sort((a,b)=>order(a)-order(b));
}
export function timeField(label,name,value='',required=false,{allowTbd=false}={}){
 const selected=valid(value)?value:allowTbd&&value==='TBD'?'TBD':'';
 return `<div class="single-time" data-time-control><label><span>${escape(label)}</span><select data-time-select ${name?`name="${escape(name)}"`:''} ${required?'required':''}><option value="">Choose a time…</option>${allowTbd?`<option value="TBD" ${selected==='TBD'?'selected':''}>TBD — to be determined</option>`:''}${timeOptions(selected).map(time=>`<option value="${time}" ${time===selected?'selected':''}>${formatTime(time)}</option>`).join('')}<option value="exact">Enter an exact time…</option></select></label><div class="exact-time-editor" hidden><label>Exact time<input data-time-exact type="text" placeholder="For example, 6:42 PM or 18:42" autocomplete="off" disabled></label><small>Press Enter or tap outside to use this time.</small></div></div>`;
}
export function readTime(container){const value=container.querySelector('[data-time-select]').value;return valid(value)?value:'';}
export function writeTime(container,value){
 const select=container.querySelector('[data-time-select]'),input=container.querySelector('[data-time-exact]'),editor=container.querySelector('.exact-time-editor');if(editor)editor.hidden=true;if(input){input.disabled=true;input.required=false;input.setCustomValidity('');}if(!valid(value)){select.value='';return;}
 if(![...select.options].some(option=>option.value===value)){const option=select.ownerDocument.createElement('option');option.value=value;option.textContent=formatTime(value);select.insertBefore(option,select.querySelector('[value=exact]'));}
 select.value=value;
}
export function setTimeDisabled(container,disabled){const select=container.querySelector('[data-time-select]'),input=container.querySelector('[data-time-exact]'),editor=container.querySelector('.exact-time-editor');select.disabled=disabled;input.disabled=disabled||editor.hidden;}
const bound=new WeakSet();
export function bindTimeFields(root){
 const fields=[...(root.matches?.('[data-time-control]')?[root]:[]),...root.querySelectorAll('[data-time-control]')];
 for(const field of fields){if(bound.has(field))continue;bound.add(field);const select=field.querySelector('[data-time-select]'),input=field.querySelector('[data-time-exact]'),editor=field.querySelector('.exact-time-editor');
 select.addEventListener('change',()=>{const exact=select.value==='exact';editor.hidden=!exact;input.disabled=!exact||select.disabled;input.required=exact;input.setCustomValidity('');if(exact){input.value='';input.focus();}});
 const validate=()=>{const parsed=parseTime(input.value);input.setCustomValidity(parsed?'':'Enter a time like 6:42 PM or 18:42.');return parsed;};
 input.addEventListener('input',validate);
 function commit(){if(input.disabled||editor.hidden)return;const parsed=validate();if(!parsed)return;writeTime(field,parsed);input.value=formatTime(parsed);input.required=false;editor.hidden=true;input.disabled=true;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
 input.addEventListener('blur',commit);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();if(!input.disabled)input.reportValidity();}});
 }
}
