/**
 * Admin-only paper signature evidence. All writes use the authenticated API,
 * which independently checks admin permissions and CSRF.
 */
export async function mountPaperContract({api,contract,prefix,container,message,esc,refresh}){
 const endpoint=prefix+'/'+contract.id+'/paper';
 const root=document.createElement('section');
 root.className='paper-contract-workflow';
 root.style.cssText='margin:20px 0;padding:16px;border:1px solid #53634a;border-radius:12px';
 container.append(root);
 const id='paper-'+contract.id;
 async function draw(){
  const data=await api(endpoint);
  if(!root.isConnected)return;
  const docs=data.documents||[],verified=docs.find(d=>d.verified_at),pending=docs.filter(d=>!d.verified_at);
  const status=contract.status==='Signed'?(contract.signature?.method==='paper'?'Signed — Paper':'Signed — Electronic'):contract.status==='Issued'?'Awaiting signature':contract.status;
  root.innerHTML='<h4 style="margin-top:0">Paper contract workflow</h4><p><strong>'+esc(status)+'</strong> · Contract version '+esc(contract.revision)+'</p>'+
   '<p class="hint">Print the issued agreement, collect a handwritten signature, then upload the signed copy. Only verified signed copies change the contract status. Retainer and payment records are separate.</p>'+
   '<div data-paper-documents></div>'+
   (contract.status==='Issued'?'<form data-paper-upload><label>Upload signed PDF, JPG or PNG (maximum 2 MB)<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required></label><button type="submit" class="button secondary">Upload signed document</button><small data-upload-message role="status"></small></form>':'')+
   (contract.status==='Issued'&&pending.length?'<form data-paper-verify><h4>Verify signed paper contract</h4><label>Signed copy<select name="evidenceId" required>'+pending.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.file_name)+' ('+esc(d.uploaded_at)+')</option>').join('')+'</select></label><label>Signed by<input name="signerName" required maxlength="255" value="'+esc(contract.snapshot?.signerName||'')+'"></label><label>Signature date<input type="date" name="signedOn" required max="'+new Date().toISOString().slice(0,10)+'"></label><label class="check-row"><input type="checkbox" name="confirmed" required><span>I have reviewed the uploaded signed copy and confirmed it is the correct version of this agreement.</span></label><button type="submit" class="button">Verify & mark signed</button><small role="status" data-verify-message></small></form>':'')+
   (data.history?.length?'<details><summary>Paper contract audit history</summary><ul>'+data.history.map(h=>'<li>'+esc(h.created_at)+' · '+esc(h.action)+' · '+esc(h.details)+' · Admin '+esc(h.actor_id)+'</li>').join('')+'</ul></details>':'');
  const list=root.querySelector('[data-paper-documents]');
  if(!docs.length)list.textContent='No paper signature documents uploaded.';
  for(const d of docs){
   const item=document.createElement('p');
   const link=document.createElement('a');
   link.className='button secondary';
   link.href=(window.djDeskConfig?.apiBase||'./api/')+endpoint+'/'+d.id+'/download';
   link.textContent='Download '+d.file_name;
   link.setAttribute('download',d.file_name);
   item.append(link,document.createTextNode(' · '+(d.verified_at?'Verified '+d.verified_at+' by '+(d.signer_name||'the signer'):'Uploaded; awaiting verification')));
   list.append(item);
  }
  const upload=root.querySelector('[data-paper-upload]');
  if(upload)upload.onsubmit=async ev=>{
   ev.preventDefault();
   const btn=upload.querySelector('button'),status=upload.querySelector('[data-upload-message]');
   const file=upload.querySelector('input[type=file]').files?.[0];
   if(!file||file.size===0||file.size>2*1024*1024){status.textContent='Choose a PDF, JPG or PNG smaller than 2 MB.';return;}
   if(!['application/pdf','image/jpeg','image/png'].includes(file.type)){status.textContent='Only PDF, JPG and PNG documents are supported.';return;}
   btn.disabled=true;
   try{
    const base64=await new Promise((resolve,reject)=>{
     const reader=new FileReader();reader.onerror=()=>reject(Error('Unable to read selected file'));reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(file);
    });
    await api(endpoint,'POST',{fileName:file.name,fileData:base64});
    message('Signed document uploaded. Review it and verify the signature to mark the contract signed.');
    await draw();
   }catch(error){status.textContent=error.message;message(error.message,true);}
   finally{btn.disabled=false;}
  };
  const verify=root.querySelector('[data-paper-verify]');
  if(verify)verify.onsubmit=async ev=>{
   ev.preventDefault();
   const btn=verify.querySelector('button'),status=verify.querySelector('[data-verify-message]');
   if(!verify.elements.confirmed.checked)return;
   btn.disabled=true;
   try{
    await api(endpoint+'/verify','POST',{evidenceId:verify.elements.evidenceId.value,signerName:verify.elements.signerName.value.trim(),signedOn:verify.elements.signedOn.value});
    message('Paper contract verified and marked signed. Payment status has not been changed.');
    await refresh();
   }catch(error){status.textContent=error.message;message(error.message,true);btn.disabled=false;}
  };
 }
 try{await draw();}catch(error){root.textContent='Paper contract records could not be loaded: '+error.message;message(error.message,true);}
}
