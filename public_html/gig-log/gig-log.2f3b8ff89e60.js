const tiles=[...document.querySelectorAll('[data-photo]')],viewer=document.querySelector('.gig-viewer'),image=viewer.querySelector('img'),status=viewer.querySelector('[role=status]');
let index=0,trigger,previousOverflow;
function show(i){index=(i+tiles.length)%tiles.length;const source=tiles[index].querySelector('img');image.src=source.src;image.alt=source.alt;status.textContent=`Photo ${index+1} of ${tiles.length}`;}
tiles.forEach((tile,i)=>tile.addEventListener('click',()=>{trigger=tile;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';show(i);viewer.showModal();viewer.querySelector('[data-close]').focus();}));
viewer.querySelector('[data-close]').onclick=()=>viewer.close();
viewer.querySelector('[data-previous]').onclick=()=>show(index-1);
viewer.querySelector('[data-next]').onclick=()=>show(index+1);
viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close();});
viewer.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();show(index-1);}if(e.key==='ArrowRight'){e.preventDefault();show(index+1);}});
let touchStartX=0;
viewer.addEventListener('touchstart',e=>{touchStartX=e.changedTouches[0].screenX;},{passive:true});
viewer.addEventListener('touchend',e=>{const diff=touchStartX-e.changedTouches[0].screenX;if(Math.abs(diff)>40){if(diff>0)show(index+1);else show(index-1);}},{passive:true});
viewer.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;trigger?.focus();});
