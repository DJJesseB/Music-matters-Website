import {addFoamSticks} from './foam-sticks.js';
export const catalogVersion='2026-11-11';
const common=['Wedding Planning App','Your choice of white or black DJ booth'];
export const weddingPackages=[
 {id:'full',name:'The Full Wedding Experience',price:2500,hours:5.5,ceremony:true,cocktail:true,features:['DJ Jesse B. as your reception DJ and MC','A dedicated assistant',...common,'Ceremony sound with wireless microphones — a portable, battery-operated, fully equipped sound system designed to go anywhere.','Cocktail-hour sound with custom mix — a separate, additional, fully equipped sound system for your cocktail-hour space.','Premium reception sound system with wireless microphones','Advanced Lighting Package ($500 value — included)','Up to 5.5 hours total wedding coverage']},
 {id:'gold',name:'The Gold Standard Package',price:1500,hours:5,ceremony:false,cocktail:true,features:['DJ Jesse B. as your reception DJ and MC','A dedicated assistant',...common,'Cocktail-hour sound with custom mix — a separate, additional, fully equipped sound system for your cocktail-hour space.','Premium reception sound system with wireless microphones','Advanced Lighting Package ($500 value — included)','Up to 5 hours total wedding coverage']},
 {id:'basic',name:'Just The Basic’s Package',price:1200,hours:4,ceremony:false,cocktail:false,features:['DJ Jesse B. as your reception DJ and MC','A dedicated assistant',...common,'Premium reception sound system with wireless microphones','Advanced Lighting Package ($500 value — included)','Up to 4 hours total wedding coverage']},
 {id:'essentials',name:'Essential’s Package',price:800,hours:4,ceremony:false,cocktail:false,features:['DJ Jesse B. or equivalent as your reception DJ and MC','Wedding Planning App','Your choice of white or black DJ booth','Professional reception sound system with wireless microphones','Basic Lighting Package ($300 value — included)','Up to 4 hours total wedding coverage']}
];
export const weddingAddons={
 leafSpinner:{name:'Moving-head lighting upgrade',price:500,description:'Two forward-facing moving-head lights on black flat-base poles, plus four light tubes'},
 tops:{name:'Additional 15-inch PA speaker pair (tops)',price:500,description:'Two 15-inch PA speakers per pair; subwoofers are separate'},
 additionalSound:{name:'Additional sound system package',price:1000,description:'2 × 15-inch PA speakers and 1 × 18-inch subwoofer'},
 subwoofer:{name:'Additional 18-inch subwoofer',price:250,description:'Per extra subwoofer, beyond any subwoofer included with the additional sound system'},
 additionalDancing:{name:'Additional dancing',price:200,description:'Per half-hour'},
 advancedUplighting:{name:'Advanced lighting + wireless uplighting',price:750,description:'Advanced wedding lighting (four light tubes and two RockOn-7 moving heads) plus 8 wireless uplights'},
 advanced:{name:'Advanced Lighting Package',price:500,description:'Four light tubes plus two RockOn-7 moving-head lights on a T-bar stand; replaces included Basic lighting when purchased separately'},
 uplighting:{name:'Wireless uplighting',price:250,description:'8 wireless uplights'},
 premium:{name:'Premium Lighting Package',price:750,description:'4 tube lights, 2 moving heads, 4 color wash lights, custom lighting design, and custom light-show programming'},
 bubbles:{name:'Smoke-filled bubble machine',price:250,description:'Subject to venue approval'},
 haze:{name:'Haze atmospheric effect',price:100,description:'Subject to venue approval'}
};
export const ceremonyCondition='Included ceremony coverage requires the ceremony to be at the same location as the reception. If ceremony and reception addresses differ, additional charges may be added.';
export const soundCapacityNotice='';
export function quoteWeddingPackage(input,{admin=false}={}){
 const fail=message=>{throw Error(message);};
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid wedding package selection');
 const selection=input.selection||input;
 const base=selection.id==='custom'&&selection.adminCoverage?{id:'custom',name:selection.customBaseName||'Custom wedding services',price:selection.customBasePrice??0,hours:0,ceremony:false,cocktail:false,features:[]}:weddingPackages.find(p=>p.id===selection.id);if(!base)fail('Choose an available wedding package');
 const guestCount=selection.guestCount??0;if(!Number.isInteger(guestCount)||guestCount<0||guestCount>100000)fail('Guest count must be a whole number');
 const additionalSound=selection.additionalSound??false,extraSubwoofers=selection.extraSubwoofers??0;if(typeof additionalSound!=='boolean')fail('Invalid additional sound system selection');if(!Number.isInteger(extraSubwoofers)||extraSubwoofers<0||extraSubwoofers>20)fail('Choose 0–20 additional subwoofers');
 if(!['TBD','White','Black'].includes(selection.booth))fail('Choose White, Black, or TBD for the DJ booth');
 if(!Number.isInteger(selection.extraHalfHours)||selection.extraHalfHours<0||selection.extraHalfHours>4)fail('Additional dancing is limited to 2 extra hours (4 half-hour blocks)');
 const lighting=selection.lighting==='none'?[]:selection.lighting==='advancedUplighting'?['advanced','uplighting']:typeof selection.lighting==='string'?selection.lighting.split('+'):['invalid'];
 if(new Set(lighting).size!==lighting.length||lighting.some(k=>!['uplighting','advanced','leafSpinner','premium'].includes(k)))fail('Choose valid lighting upgrades');
 const includedAdvanced=['full','gold','basic'].includes(base.id);
 const chargedLighting=lighting.filter(key=>!(key==='advanced'&&includedAdvanced));
 if(!admin&&lighting.includes('advanced'))fail('Advanced lighting is already included in the applicable wedding packages.');
 if(!admin&&base.id==='essentials'&&lighting.length)fail('Essential’s Package includes Basic Lighting and has no optional lighting upgrades.');
 for(const key of ['bubbles','haze'])if(typeof selection[key]!=='boolean')fail('Invalid effect selection');
 for(const key of ['bubblesApproval','hazeApproval'])if(!['Pending','Approved','Declined'].includes(selection[key]))fail('Choose a venue approval status');
 for(const key of ['bubbles','haze'])if(selection[key]&&selection[key+'Approval']==='Declined')fail('Remove the '+weddingAddons[key].name+' because venue approval was declined');
 const charge=selection.additionalCharge??0;if(typeof charge!=='number'||!Number.isFinite(charge)||charge<0||charge>100000||Math.abs(charge*100-Math.round(charge*100))>0.00001)fail('Additional quoted charges must be a valid positive dollar amount or zero');
 const chargeNote=typeof selection.chargeNote==='string'?selection.chargeNote.trim():'';if(chargeNote.length>1000||charge>0&&!chargeNote)fail('Describe the additional quoted charge');
 const extraTopPairs=selection.extraTopPairs??0;if(!Number.isInteger(extraTopPairs)||extraTopPairs<0||extraTopPairs>20)fail('Choose 0–20 additional speaker pairs');
 if(!admin&&base.id==='essentials'&&(selection.foamSticks||selection.bubbles||selection.haze||additionalSound||extraSubwoofers))fail('Essential’s Package offers extra time as its only add-on.');
 if(selection.glow&&!admin)fail('This upgrade is arranged by DJ Jesse B.');
 const foamSticks=selection.foamSticks??0;
 const clean={...(selection.glow?{glow:true}:{}),...(foamSticks?{foamSticks}:{}),id:base.id,guestCount,additionalSound,extraSubwoofers,booth:selection.booth,extraHalfHours:selection.extraHalfHours,lighting:selection.lighting,bubbles:selection.bubbles,haze:selection.haze,bubblesApproval:selection.bubblesApproval,hazeApproval:selection.hazeApproval,additionalCharge:charge,chargeNote,extraTopPairs};
 const adminCoverage=selection.adminCoverage;
 if(!Number.isFinite(base.price)||base.price<0||base.price>100000)fail('Enter a valid custom base price');
 if(adminCoverage){for(const k of ['ceremony','cocktail','outdoor','tent'])if(typeof adminCoverage[k]!=='boolean')fail('Invalid coverage option');for(const k of ['ceremonyPrice','cocktailPrice','tentPrice']){const v=adminCoverage[k];if(!Number.isFinite(v)||v<0||v>100000||Math.abs(v*100-Math.round(v*100))>0.00001)fail('Coverage prices must be valid dollar amounts');}if(!['same','different'].includes(adminCoverage.space))fail('Choose the cocktail-hour space');if(adminCoverage.tent&&(!adminCoverage.cocktail||!adminCoverage.outdoor))fail('A pop-up tent requires outdoor cocktail coverage');clean.adminCoverage={...adminCoverage};if(base.id==='custom'){clean.customBasePrice=base.price;clean.customBaseName=base.name;}}
 const items=[{name:base.name,quantity:1,unitPrice:base.price,total:base.price}];
 if(adminCoverage?.ceremony)items.push({name:'Ceremony coverage',quantity:1,unitPrice:adminCoverage.ceremonyPrice,total:adminCoverage.ceremonyPrice});
 if(adminCoverage?.cocktail)items.push({name:'Cocktail-hour coverage',description:adminCoverage.space==='same'?'Same room':'Different space',quantity:1,unitPrice:adminCoverage.cocktailPrice,total:adminCoverage.cocktailPrice});
 if(adminCoverage?.tent)items.push({name:'Pop-up tent — outdoor cocktail hour',quantity:1,unitPrice:adminCoverage.tentPrice,total:adminCoverage.tentPrice});
 if(additionalSound)items.push({...weddingAddons.additionalSound,quantity:1,unitPrice:1000,total:1000,automatic:false});
 if(extraTopPairs)items.push({name:'Additional 15-inch PA speaker pair (tops)',quantity:extraTopPairs,unitPrice:500,total:extraTopPairs*500,description:'Two 15-inch PA speakers per pair; subwoofers are separate'});
 if(extraSubwoofers)items.push({...weddingAddons.subwoofer,quantity:extraSubwoofers,unitPrice:250,total:extraSubwoofers*250});
 if(clean.extraHalfHours)items.push({...weddingAddons.additionalDancing,quantity:clean.extraHalfHours,unitPrice:200,total:clean.extraHalfHours*200});
 for(const key of chargedLighting){const a=weddingAddons[key];items.push({...a,quantity:1,unitPrice:a.price,total:a.price});}
 for(const key of ['bubbles','haze'])if(clean[key]){const a=weddingAddons[key];items.push({...a,quantity:1,unitPrice:a.price,total:a.price,venueApproval:clean[key+'Approval']});}
 if(charge)items.push({name:chargeNote,quantity:1,unitPrice:charge,total:charge});
 if(selection.glow)items.push({name:'Ultra-Violet Glow Party',description:'8 ultraviolet lights',quantity:1,unitPrice:250,total:250});
 addFoamSticks(items,foamSticks);
 return {catalogVersion,selection:clean,package:{...base,features:[...base.features]},items,total:items.reduce((sum,item)=>sum+Math.round(item.total*100),0)/100,coverageHours:base.hours+clean.extraHalfHours/2,ceremonyCondition:base.ceremony?ceremonyCondition:adminCoverage?.ceremony?'Ceremony coverage added by DJ Jesse B.':'Ceremony coverage is not included in this package.',cocktailIncluded:base.cocktail||!!adminCoverage?.cocktail,soundCapacityNotice,soundReviewRequired:guestCount>200};
}

export function includedWeddingCoverage(quote){const id=quote?.selection?.id,manual=quote?.selection?.adminCoverage;return {ceremony:id==='full'||manual?.ceremony===true,cocktail:['full','gold'].includes(id)||manual?.cocktail===true};}
