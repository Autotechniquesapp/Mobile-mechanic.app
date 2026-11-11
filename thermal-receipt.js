(() => {
'use strict';
// Export images through Phomemo; the TP31 Bluetooth protocol is not assumed.
const WIDTH=576, PAD=20, PAGE_HEIGHT=1600;
function rowsFor(data,measure){
 const {invoice,shop,job,customer,paid,balance,warranty,signed,signatureChanged,syncNote}=data;
 const meta=invoice.processor_metadata||{},v=job.vehicle||{},rows=[];
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:invoice.currency||'USD'}).format(Number(n||0));
 function add(text,size=23,bold=false){
  for(const paragraph of String(text??'').split('\n')){
   let line='';
   for(const char of paragraph){
    if(line&&measure(line+char,size,bold)>WIDTH-PAD*2){rows.push({text:line,size,bold});line='';}
    line+=char;
   }
   rows.push({text:line,size,bold});
  }
 }
 function amount(label,value){add(`${label}: ${money(value)}`,25,true);}
 add(shop.name||'Repair Shop',30,true);
 add([shop.phone,shop.email].filter(Boolean).join(' | '),20);
 if(shop.address)add(shop.address,20);
 add(`Invoice ${meta.square_invoice_number||String(invoice.id).slice(0,8)}`,25,true);
 add(`Date: ${new Date(invoice.created_at).toLocaleDateString('en-US',{timeZone:'America/Phoenix'})}`,20);
 add(`Status: ${invoice.status==='paid'?'Paid':invoice.processor_status||invoice.status||'Draft'}`,20);
 add('');add(job.customerName||customer?.name||'Customer',25,true);
 add([job.phone,job.email].filter(Boolean).join(' | '),20);
 if(customer?.address||job.location)add(customer?.address||job.location,20);
 add([v.year,v.make,v.model,v.trim].filter(Boolean).join(' '));
 if(v.vin)add(`VIN: ${v.vin}`,20);
 if(v.mileage!=null)add(`Mileage: ${v.mileage}`,20);
 add('');
 const items=invoice.line_items||[];
 for(const x of items){add(`${x.description||x.name||'Repair services'} (qty ${x.quantity||1})`);add(money(x.amount??Number(x.unit_price||0)*Number(x.quantity||1)),25,true);}
 if(!items.length)amount('Repair services',invoice.subtotal??invoice.total);
 add('');amount('Subtotal',invoice.subtotal??invoice.total);amount('Tax',invoice.tax);
 amount('Total',invoice.total);amount('Paid',paid);amount('Remaining balance',balance);
 const labels={cash:'Cash',zelle:'Zelle',cash_app:'Cash App',square_pos:'Square Tap',other:'Other'};
 for(const p of meta.received_payments||[]){add(`${labels[p.method]||p.method}: ${money(p.amount)}`,20);if(Number(p.refunded_amount)>0)add(`Refunded: ${money(p.refunded_amount)}`,20);}
 if(syncNote){add('');add(syncNote,20,true);}
 if(warranty){add('');add('Warranty',25,true);add(warranty,20);}
 if(signed){add('');add(signatureChanged?'Historical signature (invoice changed)':'Customer electronic signature',23,true);add(signed.signature_name,20);add(`Signed: ${new Date(signed.signed_at).toLocaleString('en-US',{timeZone:'America/Phoenix'})}`,20);amount('Accepted total',signed.snapshot?.invoice?.total);}
 return rows;
}
function paginate(rows){
 const pages=[[]];let y=PAD;
 for(const row of rows){const height=Math.ceil(row.size*1.4);if(y+height>PAGE_HEIGHT-PAD-30){pages.push([]);y=PAD;}pages.at(-1).push(row);y+=height;}
 return pages;
}
async function open(data){
 document.querySelector('[data-thermal-receipt]')?.remove();
 const probe=document.createElement('canvas').getContext('2d');
 if(!probe)throw new Error('Receipt image export is unavailable on this device.');
 const font=(size,bold)=>`${bold?'bold ':''}${size}px Arial`;
 const pages=paginate(rowsFor(data,(text,size,bold)=>{probe.font=font(size,bold);return probe.measureText(text).width;}));
 const files=[],urls=[],box=document.createElement('div');box.className='modal-backdrop';box.dataset.thermalReceipt='1';
 const panel=document.createElement('section');panel.className='modal';panel.style.cssText='max-height:90vh;overflow:auto';
 panel.innerHTML='<div class="modal-head"><h2>TP31 Receipt</h2><button type="button" class="close-btn" aria-label="Close receipt">×</button></div><p>Save the receipt image, then open Phomemo → Print Images, choose the image and print on your compatible 80 mm thermal paper. For multiple images, print them in order.</p><p>This exports a receipt for Phomemo. It does not pair with or send directly to the printer.</p>';
 const close=()=>{urls.forEach(url=>URL.revokeObjectURL(url));box.remove();};
 panel.querySelector('button').onclick=close;
 box.appendChild(panel);
 try{
  for(let i=0;i<pages.length;i++){
   const rows=pages[i],canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=PAD*2+rows.reduce((sum,r)=>sum+Math.ceil(r.size*1.4),0)+30;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';ctx.textBaseline='top';let y=PAD;
   for(const row of rows){ctx.font=font(row.size,row.bold);ctx.fillText(row.text,PAD,y);y+=Math.ceil(row.size*1.4);}
   ctx.font=font(18,false);ctx.fillText(`Receipt ${i+1} of ${pages.length}`,PAD,y+8);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create receipt image.');
   const name=`receipt-${String(data.invoice.id).replace(/[^a-zA-Z0-9-]/g,'').slice(0,36)}-${i+1}.png`,url=URL.createObjectURL(blob);urls.push(url);
   if(typeof File==='function')files.push(new File([blob],name,{type:'image/png'}));
   const image=document.createElement('img');image.src=url;image.alt=`Receipt image ${i+1}`;image.style.cssText='display:block;width:100%;max-width:340px;margin:12px auto';panel.appendChild(image);
   const download=document.createElement('a');download.className='btn btn-primary btn-wide';download.textContent=`Save receipt image ${i+1}`;download.href=url;download.download=name;panel.appendChild(download);
  }
  if(files.length&&navigator.canShare?.({files})){
   const share=document.createElement('button');share.type='button';share.className='btn btn-soft btn-wide';share.textContent='Share receipt images';
   share.onclick=async()=>{try{await navigator.share({files});}catch(e){if(e.name!=='AbortError')status.textContent='Sharing failed. Use Save receipt image instead.';}};panel.appendChild(share);
  }
  const status=document.createElement('p');status.setAttribute('aria-live','polite');panel.appendChild(status);
  document.querySelector('[data-invoice-print-picker]')?.remove();document.body.appendChild(box);
 }catch(e){close();throw e;}
}
window.MobileMechanicThermalReceipt={open,rowsFor,paginate};
})();
