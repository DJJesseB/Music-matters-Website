export function financeUI({app,api,head,esc,money,message,getEvents}) {
  const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const year = new Date().getFullYear();
  const valid = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const currency = v => money(Number(v) || 0);
  function occurrences(item, selectedYear) {
    const start = item.item_date;
    if (!valid(start)) return 0;
    const end = item.end_date || `${selectedYear}-12-31`;
    if (item.frequency === 'once' || item.kind !== 'expense') return start.startsWith(`${selectedYear}-`) && start <= today() ? 1 : 0;
    let n = 0;
    const yr = Number(start.slice(0,4)), mo = Number(start.slice(5,7)), day = Number(start.slice(8,10));
    const limit = [today(), end, `${selectedYear}-12-31`].sort()[0];
    for (let y = Math.max(yr, selectedYear); y <= selectedYear; y++) {
      for (let m = 1; m <= 12; m++) {
        if (item.frequency === 'yearly' && m !== mo) continue;
        const maxDay = new Date(y, m, 0).getDate();
        const date = `${y}-${String(m).padStart(2,'0')}-${String(Math.min(day,maxDay)).padStart(2,'0')}`;
        if (date >= start && date <= limit) n++;
      }
    }
    return n;
  }
  async function center() {
    const items = await api('admin/finance');
    const events = getEvents();
    const incoming = items.filter(x=>x.kind==='income' && x.item_date.startsWith(`${year}-`) && x.item_date<=today()).reduce((a,x)=>a+Number(x.amount),0);
    const spent = items.filter(x=>x.kind==='expense').reduce((a,x)=>a+Number(x.amount)*occurrences(x,year),0);
    const open = events.filter(e=>!['Canceled','Archived'].includes(e.status) && !['Inquiry','Tentative'].includes(e.status)).map(e=>({...e,owed:Math.max(0,Number(e.amount||0)-Number(e.paid||0))})).filter(e=>e.owed>0).sort((a,b)=>(a.balanceDue||'9999').localeCompare(b.balanceDue||'9999'));
    const due = open.reduce((a,e)=>a+e.owed,0);
    const wishes = items.filter(x=>x.kind==='wish' && x.status!=='Purchased');
    const rows = items.filter(x=>x.kind!=='wish');
    const form = (kind) => `<form class="finance-entry" data-kind="${kind}"><h3>${kind==='wish'?'Add gear to wish list':kind==='income'?'Record income':'Record an expense'}</h3><div class="finance-fields"><label>Description<input name="title" maxlength="255" required placeholder="${kind==='wish'?'New wireless microphone':kind==='income'?'Wedding balance received':'Website hosting'}"></label><label>${kind==='wish'?'Estimated cost':'Amount'} ($)<input name="amount" type="number" min="0" max="99999999" step="0.01" required></label><label>${kind==='wish'?'Target date':'Date'}<input name="item_date" type="date" value="${today()}" required></label><label>Category<input name="category" maxlength="100" placeholder="${kind==='wish'?'Audio':kind==='income'?'Event payment':'Insurance, travel, supplies…'}"></label>${kind==='expense'?'<label>Repeats<select name="frequency"><option value="once">One-time</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label>Stop repeating (optional)<input name="end_date" type="date"></label>':''}${kind==='wish'?'<label>Priority / status<select name="status"><option>Considering</option><option>Saving</option><option>Ready to buy</option><option>Purchased</option></select></label>':''}<label class="finance-notes">Notes<input name="notes" maxlength="2000" placeholder="Vendor, payment method, event, or details"></label></div><button class="button" type="submit">Save ${kind==='wish'?'gear':kind}</button></form>`;
    const controls = x => `<span class="finance-actions"><button type="button" class="finance-edit" data-edit="${esc(x.id)}" aria-label="Edit ${esc(x.title)}">Edit</button><button type="button" class="finance-remove" data-delete="${esc(x.id)}" aria-label="Delete ${esc(x.title)}">×</button></span>`;
    app.innerHTML = head('PRIVATE BUSINESS FINANCES','Financial Center',`Your ${year} income, spending, unpaid bookings, and equipment plans.`) +
      `<div class="finance-callout">YTD figures use dated ledger entries. Booking balances are tracked separately; a booking's “paid” total does not automatically become dated income. Enter cash/check income here, and avoid manually duplicating Stripe payments if you later import them.</div>`+
      `<div class="stats finance-stats"><div class="stat">YTD income<strong>${currency(incoming)}</strong><small>Recorded receipts</small></div><div class="stat">YTD expenses<strong>${currency(spent)}</strong><small>One-time + recurring through today</small></div><div class="stat">YTD net<strong>${currency(incoming-spent)}</strong><small>Before taxes; cash basis estimate</small></div><div class="stat">To collect<strong>${currency(due)}</strong><small>${open.length} active booked balances</small></div></div>`+
      `<div class="finance-layout"><section class="card"><div class="heading"><h2>Outstanding payments</h2><span class="badge purple">${open.length} bookings</span></div>${open.length?`<div class="finance-scroll"><table class="finance-table"><thead><tr><th>Event / client</th><th>Due</th><th>Balance</th></tr></thead><tbody>${open.map(e=>`<tr><td><a href="#event/${encodeURIComponent(e.id)}">${esc(e.name)}</a><small>${esc(e.client?.name||'')}</small></td><td>${esc(e.balanceDue||'Not set')}</td><td>${currency(e.owed)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No unpaid confirmed bookings.</p>'}<p class="finance-subtle">Inquiry and tentative quotes are excluded. Check individual bookings before collecting.</p></section><section class="card"><div class="heading"><h2>Gear wish list</h2><strong>${currency(wishes.reduce((a,x)=>a+Number(x.amount),0))}</strong></div>${wishes.length?wishes.map(x=>`<div class="finance-line"><div><strong>${esc(x.title)}</strong><small>${esc(x.category||'Gear')} · ${esc(x.status)} · Target ${esc(x.item_date)}</small></div><div class="finance-line-end"><strong>${currency(x.amount)}</strong>${controls(x)}</div></div>`).join(''):'<p>No gear on your wish list yet.</p>'}</section></div>`+
      `<section class="card"><h2>Add a financial entry</h2><div class="finance-form-grid">${form('income')}${form('expense')}${form('wish')}</div></section>`+
      `<section class="card"><div class="heading"><h2>Income & expense ledger</h2><span>${rows.length} entries</span></div>${rows.length?`<div class="finance-scroll"><table class="finance-table"><thead><tr><th>Date</th><th>Description</th><th>Category / schedule</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.item_date)}</td><td>${esc(x.title)}${x.notes?`<small>${esc(x.notes)}</small>`:''}</td><td>${esc(x.category||'Other')} · ${esc(x.frequency)}</td><td class="${x.kind==='income'?'finance-positive':''}">${x.kind==='income'?'+':'−'}${currency(x.amount)}</td><td>${controls(x)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Start by recording your first receipt or expense.</p>'}</section><dialog class="finance-dialog" aria-label="Edit financial entry"><div class="finance-dialog-content"></div></dialog>`;
    app.querySelectorAll('.finance-entry').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button[type=submit]');b.disabled=true;try{const data=Object.fromEntries(new FormData(f));data.kind=f.dataset.kind;await api('admin/finance','POST',data);message('Financial entry saved.');await center();}catch(err){message(err.message,true,err.field);b.disabled=false;}}));
    app.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
      const item=items.find(x=>x.id===b.dataset.edit);if(!item)return;
      const dialog=app.querySelector('.finance-dialog');
      const holder=dialog.querySelector('.finance-dialog-content');
      holder.innerHTML=form(item.kind).replace('Add gear to wish list','Edit gear wish').replace('Record income','Edit income').replace('Record an expense','Edit expense')+'<button type="button" class="finance-cancel">Cancel</button>';
      const f=holder.querySelector('form');
      for(const name of ['title','amount','item_date','category','frequency','end_date','status','notes']){const input=f.elements.namedItem(name);if(input)input.value=item[name]??'';}
      holder.querySelector('.finance-cancel').onclick=()=>dialog.close();
      f.addEventListener('submit',async e=>{e.preventDefault();const submit=f.querySelector('[type=submit]');submit.disabled=true;try{await api(`admin/finance/${item.id}`,'PUT',{...Object.fromEntries(new FormData(f)),kind:item.kind});dialog.close();message('Financial entry updated.');await center();}catch(err){message(err.message,true,err.field);submit.disabled=false;}});
      dialog.showModal();
    });
    app.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this financial entry? This cannot be undone.'))return;try{await api(`admin/finance/${b.dataset.delete}`,'DELETE');message('Entry deleted.');await center();}catch(err){message(err.message,true);}});
  }
  return {center};
}
