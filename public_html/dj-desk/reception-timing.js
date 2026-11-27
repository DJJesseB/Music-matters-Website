export const receptionOffsets={partyIntro:0,entrance:5,firstDance:10};
export function weddingGuestArrival(wedding){
 const ceremony=wedding.moments?.ceremony;
 if(ceremony?.enabled)return {time:ceremony.details?.guest_arrival||'',tbd:ceremony.details?.guest_arrival_tbd==='Yes',source:'ceremony'};
 const cocktail=wedding.moments?.cocktail;return {time:cocktail?.time||'',tbd:cocktail?.timeTbd||false,source:'cocktail'};
}
export function lastDanceTime(end){
 if(typeof end!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end))return null;
 const [h,m]=end.split(':').map(Number),total=(h*60+m-5+1440)%1440;
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
export function dinnerMidpoint(start,end){
 const valid=/^([01]\d|2[0-3]):[0-5]\d$/;
 if(!valid.test(start)||!valid.test(end)||start===end)return null;
 const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
 const initial=minutes(start),duration=(minutes(end)-initial+1440)%1440;
 const midpoint=(initial+Math.round(duration/2))%1440;
 return String(Math.floor(midpoint/60)).padStart(2,'0')+':'+String(midpoint%60).padStart(2,'0');
}
export function receptionEstimate(start,id){
 if(!Object.hasOwn(receptionOffsets,id)||typeof start!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start))return null;
 const [h,m]=start.split(':').map(Number),total=h*60+m+receptionOffsets[id];
 return {time:String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0'),dayOffset:Math.floor(total/1440)};
}
