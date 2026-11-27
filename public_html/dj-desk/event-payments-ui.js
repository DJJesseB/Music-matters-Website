export function mountEventPayments({root,event,api,esc,money,message,onUpdated}) {
  const endpoint='admin/events/'+encodeURIComponent(event.id)+'/payments';
  const dateValue=()=>new Date().toISOString().slice(0,10);
  const safe=esc;
  root.insertAdjacentHTML('beforeend',
    '<section class="card event-manual-payments" data-event-payments>'+
      '<h3>Manual payment records</h3>'+
      '<p>Record a check when it arrives. A check changes the event balance only after you mark it cleared. Cash and money orders count immediately when received.</p>'+
      (event.type==='School dance'?'<p>Use the school invoice page for school checks.</p>':'')+
      '<form class="grid" data-payment-form>'+
        '<label>Payment method<select name="method"><option>Check</option><option>Cash</option><option>Money order</option></select></label>'+
        '<label>Amount ($)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required></label>'+
        '<label>Date received<input name="receivedOn" type="date" value="'+dateValue()+'" required></label>'+
        '<label>Apply payment to<select name="appliesTo"><option value="balance">Event balance</option><option value="retainer">Unpaid retainer</option></select></label>'+
        '<label data-reference-label>Check number<input name="reference" maxlength="100" required></label>'+
        '<button class="button secondary" type="submit">Record payment</button>'+
        '<small data-payment-error role="status"></small>'+
      '</form><div data-payment-list>Loading payment records…</div>'+
    '</section>');
  const box=root.querySelector('[data-event-payments]');
  const form=box.querySelector('[data-payment-form]');
  const method=form.elements.method;
  const reference=form.elements.reference;
  const referenceLabel=form.querySelector('[data-reference-label]');
  const statusText=status=>status==='Received'?'Check received · awaiting clearance':status==='Cleared'?'Cleared':'Returned';
  method.onchange=()=>{
    const isCheck=method.value==='Check';
    reference.required=isCheck;
    referenceLabel.innerHTML=(isCheck?'Check number':'Reference / note')+'<input name="reference" maxlength="100" '+(isCheck?'required':'')+'>';
  };
  async function load(){
    const rows=await api(endpoint);
    box.querySelector('[data-payment-list]').innerHTML=rows.length?
      '<h4>Payment history</h4>'+rows.map(row=>
        '<div class="event manual-payment-row"><div><strong>'+safe(row.method)+' · '+safe(money(Number(row.amount)))+'</strong>'+
        '<small>'+safe(row.received_on)+(row.reference?' · #'+safe(row.reference):'')+' · Applied to '+safe(row.applies_to==='retainer'?'retainer':'event balance')+'</small></div>'+
        '<div><strong>'+safe(statusText(row.status))+'</strong>'+
        (row.status==='Received'?'<button type="button" class="button secondary" data-payment-status="Cleared" data-id="'+safe(row.id)+'">Mark cleared</button> <button type="button" class="button secondary" data-payment-status="Returned" data-id="'+safe(row.id)+'">Mark returned</button>':'')+
        '</div></div>'
      ).join(''):'<p>No manual payments recorded for this event yet.</p>';
    box.querySelectorAll('[data-payment-status]').forEach(button=>button.onclick=async()=>{
      const action=button.dataset.paymentStatus;
      if(!confirm('Confirm this check is '+action.toLowerCase()+'?'))return;
      button.disabled=true;
      try{
        await api(endpoint+'/'+encodeURIComponent(button.dataset.id),'PUT',{status:action});
        message('Check marked '+action.toLowerCase()+'.');
        await load();
        await onUpdated?.();
      }catch(error){message(error.message,true);button.disabled=false;}
    });
  }
  method.dispatchEvent(new Event('change'));
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const submit=form.querySelector('[type=submit]'),error=box.querySelector('[data-payment-error]');
    submit.disabled=true;error.textContent='';
    try{
      const data=Object.fromEntries(new FormData(form));
      data.amount=Number(data.amount);
      const result=await api(endpoint,'POST',data);
      message(result.status==='Received'?'Check recorded. It will count toward the balance after it clears.':'Payment recorded and applied to the event balance.');
      form.reset();form.elements.receivedOn.value=dateValue();method.dispatchEvent(new Event('change'));
      await load();
      await onUpdated?.();
    }catch(err){error.textContent=err.message;message(err.message,true);submit.disabled=false;}
  });
  load().catch(error=>{box.querySelector('[data-payment-list]').textContent='Payment history could not be loaded: '+error.message;});
}
