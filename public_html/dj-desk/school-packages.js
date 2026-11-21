import {addFoamSticks} from './foam-sticks.js';
export const catalogVersion='2026-11-21-school-lighting-500';
export const outdoorCoverageNotice='Outdoor mocktail-hour sound setups require a pop-up tent for overhead equipment protection.';
export const schoolPackages=[{"id": "prom", "name": "The Total Prom Experience", "price": 1500, "hours": 4, "features": ["DJ Jesse B. as your prom DJ and MC", "A dedicated assistant", "Custom Song Request / Planning App", "Premium DJ booth", "Mocktail-hour sound with custom mix — a separate sound system for events in multiple rooms.", "Premium event sound system with subwoofer(s)", "Advanced dance-floor lighting", "Up to 4 hours total coverage: 1 hour mocktail / 3 hours prom"], "description": "A complete prom-night experience—from mocktail arrivals to the final dance—with a separate welcome-area sound system, fuller dance-floor sound, and advanced lighting."}, {"id": "standard2", "name": "The Standard School Dance Experience — 2 hours", "price": 400, "hours": 2, "features": ["DJ Jesse B. or equivalent as your event DJ and MC", "Custom Song Request / Planning App", "Premium DJ booth", "Premium event sound system", "Up to 2 hours total event coverage", "Basic dance-floor lighting"], "description": "Great music and lighting for homecoming, seasonal dances, and school celebrations."}, {"id": "standard3", "name": "The Standard School Dance Experience — 3 hours", "price": 600, "hours": 3, "features": ["DJ Jesse B. or equivalent as your event DJ and MC", "Custom Song Request / Planning App", "Premium DJ booth", "Premium event sound system", "Up to 3 hours total event coverage", "Basic dance-floor lighting"], "description": "Great music and lighting for homecoming, seasonal dances, and school celebrations."}, {"id": "standard4", "name": "The Standard School Dance Experience — 4 hours", "price": 800, "hours": 4, "features": ["DJ Jesse B. or equivalent as your event DJ and MC", "Custom Song Request / Planning App", "Premium DJ booth", "Premium event sound system", "Up to 4 hours total event coverage", "Basic dance-floor lighting"], "description": "Great music and lighting for homecoming, seasonal dances, and school celebrations."}];
export const schoolAddons={
 tops:{name:'Additional 15-inch PA speaker pair (tops)',price:500,description:'Two 15-inch PA speakers per pair; subwoofers are separate'},
 additionalSound:{name:'Additional sound system package',price:1000,description:'2 × 15-inch PA speakers and 1 × 18-inch subwoofer'},
 subwoofer:{name:'Additional 18-inch subwoofer',price:250,description:'Per extra subwoofer, beyond any subwoofer included with the additional sound system'},
 additionalDancing:{name:'Additional dancing',price:100,description:'Per half-hour'},
 advancedUplighting:{name:'Advanced lighting + wireless uplighting',price:750,description:'Advanced dance-floor lighting plus 8 wireless uplights'},
 advanced:{name:'Advanced dance-floor lighting',price:500,description:'Four light tubes plus two Derby effect lights on a single T-bar stand; replaces included Basic lighting'},
 uplighting:{name:'Wireless uplighting',price:250,description:'8 wireless uplights'},
 premium:{name:'Premium Lighting Package',price:750,description:'4 tube lights, 2 moving heads, 4 color wash lights, custom lighting design, and custom light-show programming'},
 bubbles:{name:'Smoke-filled bubble machine',price:250,description:'Subject to venue approval'},
 glow:{name:'Ultra-Violet Glow Party',price:250,description:'8 ultraviolet lights'},
 haze:{name:'Haze atmospheric effect',price:100,description:'Subject to venue approval'}
};

export const soundCapacityNotice='';
export function quoteSchoolPackage(input){
 const fail=message=>{throw Error(message);};
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid school dance package selection');
 const raw=input.selection||input;
 const selection={...raw,extraHalfHours:raw.extraHalfHours??(raw.extraHours??0)*2};
 const base=schoolPackages.find(p=>p.id===selection.id);if(!base)fail('Choose an available school dance package');
 const guestCount=selection.guestCount??0;if(!Number.isInteger(guestCount)||guestCount<0||guestCount>100000)fail('Guest count must be a whole number');
 const additionalSound=selection.additionalSound??false,extraSubwoofers=selection.extraSubwoofers??0;if(typeof additionalSound!=='boolean')fail('Invalid additional sound system selection');if(!Number.isInteger(extraSubwoofers)||extraSubwoofers<0||extraSubwoofers>20)fail('Choose 0–20 additional subwoofers');
 if(!['Premium'].includes(selection.booth))fail('The school package includes a premium DJ booth');
 if(!Number.isInteger(selection.extraHalfHours)||selection.extraHalfHours<0||selection.extraHalfHours>4)fail('Additional dancing is limited to 2 extra hours (4 half-hour blocks)');
 if(base.id==='standard2'&&selection.extraHalfHours>0)fail('For more than two hours, choose The Standard School Dance Experience — 3 hours or 4 hours. Additional dancing is available after the three-hour package at $100 per half-hour.');
 const lighting=selection.lighting==='none'?[]:selection.lighting==='advancedUplighting'?['advanced','uplighting']:typeof selection.lighting==='string'?selection.lighting.split('+'):['invalid'];
 if(new Set(lighting).size!==lighting.length||lighting.some(k=>!['uplighting','advanced','premium'].includes(k)))fail('Choose valid lighting upgrades');
 const chargedLighting=lighting;
 if(base.id==='prom'&&lighting.includes('advanced'))fail('Advanced lighting is already included in The Total Prom Experience.');
 if(lighting.includes('advanced')&&lighting.includes('premium'))fail('Premium already includes upgraded dance-floor lighting.');
 for(const key of ['bubbles','haze'])if(typeof selection[key]!=='boolean')fail('Invalid effect selection');
 for(const key of ['bubblesApproval','hazeApproval'])if(!['Pending','Approved','Declined'].includes(selection[key]))fail('Choose a venue approval status');
 for(const key of ['bubbles','haze'])if(selection[key]&&selection[key+'Approval']==='Declined')fail('Remove the '+schoolAddons[key].name+' because venue approval was declined');
 const charge=selection.additionalCharge??0;if(typeof charge!=='number'||!Number.isFinite(charge)||charge<0||charge>100000||Math.abs(charge*100-Math.round(charge*100))>0.00001)fail('Additional quoted charges must be a valid positive dollar amount or zero');
 const chargeNote=typeof selection.chargeNote==='string'?selection.chargeNote.trim():'';if(chargeNote.length>1000||charge>0&&!chargeNote)fail('Describe the additional quoted charge');
 if(typeof selection.glow!=='boolean')fail('Choose whether to add the UV glow party');
 const extraTopPairs=selection.extraTopPairs??0;if(!Number.isInteger(extraTopPairs)||extraTopPairs<0||extraTopPairs>20)fail('Choose 0–20 additional speaker pairs');
 const foamSticks=selection.foamSticks??0;
 const clean={...(foamSticks?{foamSticks}:{}),glow:selection.glow,id:base.id,guestCount,additionalSound,extraSubwoofers,booth:selection.booth,extraHalfHours:selection.extraHalfHours,lighting:selection.lighting,bubbles:selection.bubbles,haze:selection.haze,bubblesApproval:selection.bubblesApproval,hazeApproval:selection.hazeApproval,additionalCharge:charge,chargeNote,extraTopPairs};
 const items=[{name:base.name,quantity:1,unitPrice:base.price,total:base.price}];
 if(additionalSound)items.push({...schoolAddons.additionalSound,quantity:1,unitPrice:1000,total:1000,automatic:false});
 if(extraTopPairs)items.push({name:'Additional 15-inch PA speaker pair (tops)',quantity:extraTopPairs,unitPrice:500,total:extraTopPairs*500,description:'Two 15-inch PA speakers per pair; subwoofers are separate'});
 if(extraSubwoofers)items.push({...schoolAddons.subwoofer,quantity:extraSubwoofers,unitPrice:250,total:extraSubwoofers*250});
 if(clean.extraHalfHours)items.push({...schoolAddons.additionalDancing,quantity:clean.extraHalfHours,unitPrice:100,total:clean.extraHalfHours*100});
 for(const key of chargedLighting){const a=schoolAddons[key];items.push({...a,quantity:1,unitPrice:a.price,total:a.price});}
 for(const key of ['bubbles','haze'])if(clean[key]){const a=schoolAddons[key];items.push({...a,quantity:1,unitPrice:a.price,total:a.price,venueApproval:clean[key+'Approval']});}
 if(clean.glow)items.push({...schoolAddons.glow,quantity:1,unitPrice:250,total:250});
 if(charge)items.push({name:chargeNote,quantity:1,unitPrice:charge,total:charge});
 addFoamSticks(items,foamSticks);
 const features=base.features.filter(feature=>base.id==='prom'||feature!=='A dedicated assistant');
 if(base.id!=='prom'&&lighting.includes('premium'))features.splice(1,0,'A dedicated assistant — included with the Premium Lighting Package');
 return {outdoorCoverageNotice:base.id==='prom'?outdoorCoverageNotice:'',catalogVersion,selection:clean,package:{...base,features},items,total:items.reduce((sum,item)=>sum+Math.round(item.total*100),0)/100,coverageHours:base.hours+clean.extraHalfHours/2,soundCapacityNotice,soundReviewRequired:guestCount>200};
}
