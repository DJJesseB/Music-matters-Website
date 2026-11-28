export function schoolInvoiceDocument(invoice,esc,money){
  const s=invoice.snapshot||{},rows=s.lineItems||[];
  const cell=value=>esc(value??'');
  const tds=rows.map(item=>'<tr><td>'+cell(item.name)+(item.description?'<small> · '+cell(item.description)+'</small>':'')+'</td><td class="right">'+cell(item.quantity||1)+'</td><td class="right">'+cell(money(Number(item.total||0)))+'</td></tr>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+cell(invoice.number)+'</title><style>@page{size:letter;margin:.7in}body{font:11pt/1.48 Arial,sans-serif;max-width:850px;margin:0 auto;color:#161616}h1{font-size:24pt;margin:0}h2{font-size:12pt;margin:18px 0 6px}p{margin:5px 0}header{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #222;padding-bottom:15px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.right{text-align:right}th{background:#eee}.total{font-size:16pt;font-weight:bold;text-align:right}.instructions{white-space:pre-wrap}.small{font-size:9pt;color:#444}.actions{padding:12px;background:#eee;margin-bottom:15px}button{padding:10px 14px}@media print{.actions{display:none}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button> <button onclick="window.close()">Close</button></div><header><div><h1>DJ JESSE B</h1><p>Professional DJ & MC Services</p><p>music-matters.me</p></div><div style="text-align:right"><h1>INVOICE</h1><strong>'+cell(invoice.number)+'</strong><p>Issued: '+cell(s.issuedOn)+'</p><p>Due: '+cell(s.dueDate)+'</p></div></header><h2>Bill To</h2><p><strong>'+cell(s.school)+'</strong><br>'+cell(s.billTo)+'<br><span class="instructions">'+cell(s.billingAddress)+'</span></p><p>PO Number: '+cell(s.poNumber||'Not provided')+'</p><h2>Event</h2><p>'+cell(s.eventName)+' · '+cell(s.eventDate)+' · '+cell(s.eventVenue||'Venue to be confirmed')+'</p><table><thead><tr><th>Service or equipment</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead><tbody>'+tds+'</tbody></table><p style="text-align:right">Subtotal: '+cell(money(Number(s.subtotal||0)))+'<br>Discount: −'+cell(money(Number(s.discount||0)))+'<br>Contract total: '+cell(money(Number(s.contractTotal||0)))+'<br>Previously paid: −'+cell(money(Number(s.alreadyPaid||0)))+'</p><p class="total">AMOUNT INVOICED: '+cell(money(Number(s.amountDue||0)))+'</p><h2>Payment terms</h2><p>'+cell(({due:'Due on receipt',net15:'Net 15',net30:'Net 30',event:'ON OR BEFORE THE DATE OF THE EVENT',custom:'Custom due date'})[s.terms]||s.terms)+' · Due '+cell(s.dueDate)+'</p><h2>Pay by check</h2><p>Make check payable to: <strong>'+cell(s.payee)+'</strong></p><p class="instructions">'+cell(s.mailingAddress)+'</p><p>Reference invoice '+cell(invoice.number)+' and event date '+cell(s.eventDate)+' with payment.</p>'+(s.notes?'<h2>Notes</h2><p class="instructions">'+cell(s.notes)+'</p>':'')+'<p class="small">Please contact DJ Jesse B with questions regarding this invoice. Receipt of a check does not confirm cleared payment.</p></body></html>';
}

function printSchoolInvoice(body){
 const popup=window.open('','_blank');
 if(!popup)throw Error('Allow pop-ups to print this invoice, or download it instead.');
 popup.document.open();
 popup.document.write(body);
 popup.document.close();
 popup.focus();
}

/**
 * School invoice & check management for DJ Desk admin. Printed invoices are
 * generated from immutable server-issued snapshots (never the live editable form).
 */
export async function mountSchoolInvoices({api,app,event,esc,money,message}){
 if(event.type!=='School dance')return;
 const root=document.createElement('section');root.className='card';root.id='schoolInvoices';
 root.innerHTML='<h2>School invoices & check payments</h2><p>Issue a printable invoice for the school business office. An invoice may be issued before the contract is signed. Checks do not count as paid until cleared.</p><div data-school-invoices>Loading invoices…</div>';
 const anchor=app.querySelector('#contractWorkspace')||app.querySelector('[data-portal-anchor],#clientPlan');
 if(anchor)anchor.before(root);else app.append(root);
 const endpoint='admin/events/'+event.id+'/invoices';
 const info=root.querySelector('[data-school-invoices]');
 const validDate=value=>/^(19|20)\d{2}-\d{2}-\d{2}$/.test(value);
 const safe=value=>esc(value??'');
 const field=(label,name,value='',type='text',extra='')=>'<label>'+safe(label)+'<input name="'+name+'" type="'+type+'" value="'+safe(value)+'" '+extra+'></label>';
 const note=(label,name,value='')=>'<label>'+safe(label)+'<textarea name="'+name+'">'+safe(value)+'</textarea></label>';

 function print(invoice){printSchoolInvoice(schoolInvoiceDocument(invoice,esc,money));}

 async function load(){
  const invoices=await api(endpoint);if(!info.isConnected)return;
  const currentInvoice=invoices.find(invoice=>invoice.status==='Issued');
  const olderInvoices=invoices.filter(invoice=>invoice!==currentInvoice);
  info.innerHTML='<details open><summary>Create invoice for school business office</summary><form data-invoice-create><div class="grid">'+
   field('School / district name *','school',event.client?.organization||'', 'text','required maxlength="255"')+
   field('Bill to / Accounts Payable','billTo','Accounts Payable','text','maxlength="255"')+
   note('School billing address','billingAddress',event.address||'')+
   field('Purchase order number (optional)','poNumber','', 'text','maxlength="100"')+
   '<label>Payment terms<select name="terms"><option value="due">Due on receipt</option><option value="net15">Net 15</option><option value="net30">Net 30</option><option value="event">On or before the date of the event</option><option value="custom">Custom due date</option></select></label>'+
   field('Custom due date','dueDate','', 'date')+
   field('Make check payable to *','payee','JESSE BARTO', 'text','required maxlength="255"')+
   note('Check mailing / delivery instructions *','mailingAddress','P.O. Box 386\nMillbrook, NY 12545')+
   note('Additional invoice notes','notes','')+
   '</div>'+(invoices.some(i=>i.status==='Issued')?'<label class="check-row"><input name="replacePrior" type="checkbox" value="1" required><span>Replace the existing issued invoice with a new revision (all received checks must be resolved)</span></label>':'')+'<button type="submit" class="button">Issue school invoice</button><p class="hint">The invoice freezes the current event pricing. Later booking changes require a new invoice version. Check payee and mailing instructions are required.</p><small data-invoice-error role="status"></small></form></details>'+
   (currentInvoice?'<h3>Current invoice</h3><div data-current-invoice></div>':
    '<p>'+(invoices.length?'No current invoice.':'No invoices have been issued for this event yet.')+'</p>')+
   (olderInvoices.length?'<details class="card"><summary>Invoice history</summary><div data-invoice-history></div></details>':'');
  const current=info.querySelector('[data-current-invoice]');
  const history=info.querySelector('[data-invoice-history]');
  for(const invoice of invoices){
   const shell=document.createElement('details');
   shell.className='card';shell.style.margin='12px 0';
   shell.innerHTML='<summary><strong>'+safe(invoice.number)+'</strong> · '+safe(invoice.snapshot.issuedOn)+' · '+safe(money(Number(invoice.snapshot.amountDue||0)))+' invoiced · '+safe(money(invoice.balance))+' remaining · '+safe(invoice.status)+' · '+safe(invoice.paymentStatus)+'</summary>'+
    '<div><p>Payment terms: '+safe(invoice.snapshot.terms==='event'?'ON OR BEFORE THE DATE OF THE EVENT':'Due per invoice')+' · Due date: '+safe(invoice.snapshot.dueDate)+' · PO '+safe(invoice.snapshot.poNumber||'—')+'</p>'+
    '<button type="button" class="button secondary" data-print>Print / Save PDF</button>'+
    (invoice.snapshot.billLater>0?'<p>Balance to invoice separately: <strong>'+safe(money(Number(invoice.snapshot.billLater)))+'</strong>.</p>':'')+
    '<p><strong>Check tracking</strong> — Received checks are not counted as cleared payments.</p>'+
    '<form data-check-create class="grid" '+(invoice.status!=='Issued'?'hidden':'')+'>'+field('Check number','checkNumber','','text','required maxlength="100"')+
    field('Check amount','amount','','number','required min="0.01" step="0.01"')+
    field('Date received','receivedOn',new Date().toISOString().slice(0,10),'date','required')+
    '<button type="submit" class="button secondary">Record check received</button><small data-check-error role="status"></small></form>'+
    '<div data-check-list></div><details><summary>Invoice audit history</summary><ul>'+invoice.history.map(h=>'<li>'+safe(h.created_at)+' · '+safe(h.action)+' · '+safe(h.details)+'</li>').join('')+'</ul></details></div>';
   shell.querySelector('[data-print]').onclick=()=>{try{print(invoice);}catch(error){message(error.message,true);}};
   shell.querySelector('[data-check-create]').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{await api(endpoint+'/'+invoice.id+'/checks','POST',{checkNumber:f.elements.checkNumber.value,amount:Number(f.elements.amount.value),receivedOn:f.elements.receivedOn.value});message('Check received and recorded. It will not count as paid until cleared.');await load();}catch(error){f.querySelector('[data-check-error]').textContent=error.message;message(error.message,true);b.disabled=false;}};
   const checkList=shell.querySelector('[data-check-list]');
   for(const check of invoice.checks){
    const row=document.createElement('div');row.className='event';
    row.innerHTML='<span>Check #'+safe(check.check_number)+' · '+safe(money(Number(check.amount)))+' · '+safe(check.received_on)+' · <strong>'+safe(check.status)+'</strong></span>';
    if(check.status==='Received'){
     for(const [status,label] of [['Cleared','Mark cleared'],['Returned','Mark returned']]){
      const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=label;
      button.onclick=async()=>{if(!confirm('Confirm check #'+check.check_number+' is '+status.toLowerCase()+'?'))return;button.disabled=true;try{await api(endpoint+'/'+invoice.id+'/checks/'+check.id,'PUT',{status});message('Check marked '+status.toLowerCase()+'.');await load();}catch(error){message(error.message,true);button.disabled=false;}};
      row.append(button);
     }
    }
    checkList.append(row);
   }
   if(invoice===currentInvoice)current.append(shell);
   else history.append(shell);
  }
  const f=info.querySelector('[data-invoice-create]');
  f.onsubmit=async e=>{e.preventDefault();const button=f.querySelector('button[type=submit]');button.disabled=true;const data=Object.fromEntries(new FormData(f));try{if(!data.school.trim()||!data.payee.trim()||!data.mailingAddress.trim())throw Error('School, check payee, and delivery instructions are required.');const result=await api(endpoint,'POST',data);message('School invoice '+result.number+' issued. Print or save it from the current invoice.');await load();}catch(error){f.querySelector('[data-invoice-error]').textContent=error.message;message(error.message,true);button.disabled=false;}};
 }
 try{await load();}catch(error){info.textContent='Unable to open school invoices: '+error.message;message(error.message,true);}
}

export async function showSchoolInvoice({api,event,esc,money,app}){
 const endpoint='portal/events/'+event.id+'/school-invoice';
 const dialog=document.createElement('dialog');
 dialog.className='card school-invoice-dialog';
 dialog.setAttribute('aria-labelledby','schoolInvoiceHeading');
 dialog.innerHTML='<h2 id="schoolInvoiceHeading">Invoice for your school business office</h2><p>Print or download the invoice and send it to the person who handles school payments. You can start planning right away.</p><div data-invoice-content></div><p data-invoice-status role="status"></p><form method="dialog"><button type="submit" class="button secondary">Continue to planner →</button></form>';
 app.append(dialog);
 const body=dialog.querySelector('[data-invoice-content]');
 const status=dialog.querySelector('[data-invoice-status]');
 const closed=new Promise(resolve=>dialog.addEventListener('close',()=>{dialog.remove();resolve();},{once:true}));
 function renderInvoice(invoice){
  const amount=money(Number(invoice.snapshot.amountDue||0));
  body.innerHTML=`<section class="school-invoice-ready"><h3>Invoice ${esc(invoice.number)}</h3><p><strong>${esc(amount)}</strong> invoiced${invoice.snapshot.billLater>0?' · '+esc(money(Number(invoice.snapshot.billLater)))+' will be billed separately':''}</p>
   <button type="button" data-print-invoice>Print / Save PDF</button> <a class="button secondary" data-download-invoice>Download invoice</a></section>`;
  const html=schoolInvoiceDocument(invoice,esc,money);
  body.querySelector('[data-print-invoice]').onclick=()=>{
   try{printSchoolInvoice(html);}catch(error){status.textContent=error.message;}
  };
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const download=body.querySelector('[data-download-invoice]');
  download.href=url;
  download.download=invoice.number+'.html';
  dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
 }
 async function load(){
  body.textContent='Loading invoice options…';
  status.textContent='';
  try{
   const data=await api(endpoint);
   if(!dialog.open)return;
   if(data.invoice){renderInvoice(data.invoice);return;}
   if(!data.full){body.textContent='Your school booking has no remaining payment due.';return;}
   body.innerHTML=`<div class="school-invoice-options">
    ${data.retainer>0&&data.retainer<data.full?`<button type="button" class="secondary" data-billing-choice="retainer">Invoice retainer only · ${esc(money(Number(data.retainer)))}<small>${esc(money(Number(data.full-data.retainer)))} will be billed separately.</small></button>`:''}
    <button type="button" data-billing-choice="full">Pay in full · ${esc(money(Number(data.full)))}<small>Submit one invoice for the full amount due.</small></button>
   </div>`;
   const options=[...body.querySelectorAll('[data-billing-choice]')];
   for(const button of options)button.onclick=async()=>{
    options.forEach(item=>item.disabled=true);
    status.textContent='Preparing your invoice…';
    try{
     const result=await api(endpoint,'POST',{choice:button.dataset.billingChoice});
     if(!dialog.open)return;
     status.textContent='Invoice ready.';
     renderInvoice(result.invoice);
     body.querySelector('[data-print-invoice]').focus();
    }catch(error){
     if(!dialog.open)return;
     status.textContent=error.message;
     options.forEach(item=>item.disabled=false);
    }
   };
  }catch(error){
   if(!dialog.open)return;
   body.textContent='';
   status.textContent=error.message;
   const retry=document.createElement('button');
   retry.type='button';
   retry.textContent='Try again';
   retry.onclick=load;
   body.append(retry);
  }
 }
 dialog.showModal();
 void load();
 return closed;
}
