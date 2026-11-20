const previewSelector='img[data-addon-photo]';
let active=null;
function closePreview(){active?.close();}
function openPreview(source){
 closePreview();
 const dialog=document.createElement('dialog');
 dialog.className='addon-photo-dialog';
 dialog.setAttribute('aria-label','Add-on photo preview');
 const close=document.createElement('button');close.type='button';close.className='addon-photo-close';close.textContent='Close ×';
 const photo=document.createElement('img');photo.src=source.currentSrc||source.src;photo.alt=source.alt;
 dialog.append(close,photo);document.body.append(dialog);active=dialog;
 const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 close.onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;if(active===dialog)active=null;dialog.remove();if(source.isConnected)source.focus();},{once:true});
 dialog.showModal();
}
// Capture clicks inside checkbox labels so viewing a photo never selects an add-on.
document.addEventListener('click',event=>{const photo=event.target.closest(previewSelector);if(!photo)return;event.preventDefault();event.stopPropagation();openPreview(photo);},true);
document.addEventListener('keydown',event=>{if(!event.target.matches(previewSelector)||!['Enter',' '].includes(event.key))return;event.preventDefault();openPreview(event.target);});
window.addEventListener('hashchange',closePreview);
