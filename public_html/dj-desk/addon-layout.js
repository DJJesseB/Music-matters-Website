export function arrangeAddons(form){
 const summary=form.querySelector('#requestQuote,[data-quote],[data-service-quote]');if(summary){const panel=document.createElement('section');panel.className='intake-event-summary';panel.setAttribute('aria-label','Your event summary');panel.innerHTML='<div class="intake-summary-heading"><span class="badge purple">YOUR SELECTIONS</span><h2>Your event summary</h2><p>Review your package and selected extras below.</p></div>';summary.before(panel);panel.append(summary);}

 const details=[...form.querySelectorAll('details')].find(node=>node.querySelector(':scope > summary')?.textContent.includes('add-ons'));if(!details)return;
 const grid=details.querySelector('.grid');if(!grid)return;grid.classList.add('addon-single-column');
 const ordered=[];for(const key of ['lighting','haze','bubbles','glow','foamSticks','extraHalfHours','extraTopPairs','extraSubwoofers']){const control=grid.querySelector(`[name="${key}"],[data-service="${key}"]`);const label=control?.closest('[data-foam-sticks],[data-extra-time]')||control?.closest('label');if(!label)continue;if(['haze','bubbles'].includes(key)&&!label.querySelector('small')){const hint=document.createElement('small');hint.textContent='Subject to venue approval';label.querySelector('span')?.append(hint);}ordered.push(label);}
 for(const label of ordered)label.remove();const remaining=[...grid.children].filter(node=>node.matches('label')||node.querySelector('input,select,textarea'));grid.replaceChildren(...ordered,...remaining);
}
