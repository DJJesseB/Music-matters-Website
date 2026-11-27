export function inquiryFields(details = {}, showDate = false, esc = value => value) {
 const fields = [
  ['venue', 'Venue name', 'text'],
  ['address', 'Venue street address, city and state', 'text'],
  ['startTime', 'Event start time', 'time'],
  ['endTime', 'Event end time', 'time']
 ];
 if (showDate) fields.unshift(['date', 'Event date', 'date']);
 return `<fieldset><legend>Venue and event hours</legend><div class="grid">${fields.map(([name,label,type]) =>
  `<div><label>${label}<input name="${name}" type="${type}" value="${esc(details[name] || '')}" maxlength="${name==='address' ? 500 : 250}"></label><label class="check-row"><input type="checkbox" data-unknown="${name}"> ${label} unknown</label></div>`
 ).join('')}</div></fieldset>`;
}

export function bindUnknowns(form) {
 for (const check of form.querySelectorAll('[data-unknown]')) {
  const field = form.elements[check.dataset.unknown];
  check.onchange = () => {
   if (check.checked) field.value = '';
   field.readOnly = check.checked;
  };
 }
}

export function travelFields(settings, esc) {
 return `<details><summary>Travel feasibility</summary><p>Enter estimated driving times from and back to ${esc(settings.homeBase)}. Review lodging when either drive exceeds ${esc(settings.lodgingMinutes)} minutes. Warnings start at ${esc(settings.dayMinutes)} total minutes or a ${esc(settings.arrivalTime)} arrival home.</p>
 <div class="grid">${[['outbound','Drive to venue'],['return','Drive home'],['setup','Setup'],['breakdown','Breakdown']].map(([name,label]) =>
  `<label>${label} (minutes)<input type="number" min="0" max="1440" step="1" name="${name}"></label>`
 ).join('')}</div>
 <label>Lodging decision<select name="lodging"><option value="">Select if lodging is needed</option>${['Customer provides','Negotiate quote','Absorb cost','Waive','Decline'].map(option=>`<option>${option}</option>`).join('')}</select></label>
 <label>Lodging notes or reason for waiving<input name="lodgingReason" maxlength="1000"></label>
 <label class="check-row"><input type="checkbox" name="scheduleChecked"> I checked weekday employment and other commitments.</label>
 <button type="button" class="secondary" data-preview-travel>Calculate travel estimate</button><p data-travel-estimate role="status"></p>
 <label class="check-row"><input type="checkbox" name="acknowledgeTravel"> I reviewed any extended-day or late-arrival warnings.</label></details>`;
}
