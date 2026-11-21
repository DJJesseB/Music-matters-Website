export const clientDjHours=[2,3,4,4.5,5,5.5,6];
import {quoteSchoolPackage,schoolAddons} from './school-packages.js?v=211';
export const privateAddons=schoolAddons;
export const corporateServices={technician:{name:'Dedicated A/V technician',price:300,description:'Per hour'},microphones:{name:'Wireless desktop conference microphone system',price:2000,description:'8 push-to-talk microphones on stands, upgraded wireless antenna distribution, digital mixer with anti-feedback technology, and rolling all-in-one cart; per day'},pa:{name:'Professional PA sound reinforcement',price:1000,description:'Per day'},projector:{name:'Projector and presentation screen',price:2000,description:'Per day'}};
export function quotePrivatePackage(input,{allowPendingTechnician=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid event service selection');
 const s=input.selection||input;
 if(!['private','corporate'].includes(s.id))throw Error('Choose private or corporate event services');
 const djHours=s.djHours??0;if(!Number.isFinite(djHours)||djHours<0||djHours>24||!Number.isInteger(djHours*2))throw Error('Choose DJ coverage in half-hour increments, up to 24 hours');
 const guestCount=s.guestCount??0;if(!Number.isInteger(guestCount)||guestCount<0||guestCount>100000)throw Error('Guest count must be a whole number');
 const extra=quoteSchoolPackage({...s,id:'standard2',guestCount:0,booth:'Premium',extraHalfHours:0});
 const quantities={};for(const k of Object.keys(corporateServices)){const v=s[k]??0;if(!Number.isInteger(v)||v<0||v>100)throw Error('Choose a whole number from 0 to 100 for '+corporateServices[k].name);if(s.id!=='corporate'&&v)throw Error('A/V services are available for corporate events');quantities[k]=v;}
 const technicianPending=s.id==='corporate'&&['microphones','pa','projector'].some(k=>quantities[k]>0)&&quantities.technician===0;
 if(technicianPending&&!allowPendingTechnician)throw Error('Corporate A/V equipment requires the dedicated A/V technician. Enter at least one technician hour at $300 per hour.');
 if(!djHours&&!Object.values(quantities).some(Boolean))throw Error('Choose DJ coverage or a corporate A/V service');
 const basicLighting=true; // The standard basic lighting package is mandatory and included for private DJ events.
 const hourlyRate=s.id==='corporate'?300:200;
 const overtimeHalfHourRate=s.id==='corporate'?175:150;
 const items=[];if(djHours){const hours=Math.min(4,djHours);items.push({name:'DJ Jesse B. DJ and MC service',quantity:hours,unitPrice:hourlyRate,total:hours*hourlyRate,description:`First four hours: ${hourlyRate} per hour. Includes ${s.id==='corporate'?'dedicated assistant, ':''}premium sound system and custom DJ booth${basicLighting?', plus basic lighting':''}.`});if(djHours>4)items.push({name:'DJ coverage beyond four hours',quantity:(djHours-4)*2,unitPrice:overtimeHalfHourRate,total:(djHours-4)*2*overtimeHalfHourRate,description:`${overtimeHalfHourRate} per additional half-hour`});}
 
 items.push(...extra.items.slice(1));for(const [k,v] of Object.entries(quantities))if(v){const a=corporateServices[k];items.push({name:a.name,quantity:v,unitPrice:a.price,total:v*a.price,description:a.description});}
 if(technicianPending)items.push({name:'Dedicated A/V technician',quantity:0,unitPrice:300,total:0,pending:true,description:'Added with selected A/V services. $300 per hour; final pricing TBD based on hours needed. DJ Jesse B will confirm the hours during consultation.'});
 const price=items.reduce((n,i)=>n+i.total,0);
 return {pricingIncludes:s.id==='corporate'?'All pricing includes delivery, setup, breakdown, and return to the warehouse.':'',technicianPending,catalogVersion:'2026-11-private-v9',selection:{...extra.selection,id:s.id,guestCount,djHours,basicLighting,...quantities},package:{id:s.id,name:s.id==='corporate'?'Corporate event à la carte services':'Private event à la carte services',price,hours:djHours,features:djHours?['DJ Jesse B. as your DJ and MC',...(s.id==='corporate'||s.lighting?.split('+').includes('premium')?['Dedicated assistant — included']:[]),'Premium sound system',...(basicLighting?['Basic Lighting Package ($300 value — included)']:[]),'Custom DJ booth']:['Corporate A/V services selected below']},items,total:items.reduce((n,i)=>n+Math.round(i.total*100),0)/100,coverageHours:djHours,soundCapacityNotice:'Sound-system additions are optional here. DJ Jesse B will review guest count, room layout and coverage needs before approving the quote.'};
}
