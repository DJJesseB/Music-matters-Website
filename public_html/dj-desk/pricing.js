export function calculateDeposit(subtotal = 0) {
 const config = window.djDeskConfig || {};
 const mode = config.depositMode || 'higher';
 const flat = config.standardDeposit != null ? Number(config.standardDeposit) : 250;
 const pct = config.depositPercent != null ? Number(config.depositPercent) : 20;
 const amount = Number(subtotal) || 0;
 if (mode === 'percent') {
  return Math.round(amount * (pct / 100) * 100) / 100;
 }
 if (mode === 'higher') {
  const pctAmount = Math.round(amount * (pct / 100) * 100) / 100;
  return Math.max(flat, pctAmount);
 }
 return flat;
}
export const standardDeposit = window.djDeskConfig?.standardDeposit != null ? Number(window.djDeskConfig.standardDeposit) : 250;
export const depositPolicy = window.djDeskConfig?.depositPolicy || 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is used for date reservation and administrative purposes, and credited toward your event total.';
export function discountedTotal(subtotal, discount = 0) {
 for (const [key, value] of [['Subtotal', subtotal], ['Discount', discount]]) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw Error(`${key} must be a valid non-negative dollar amount`);
 if (discount > subtotal) throw Error('Discount cannot exceed the package/services subtotal');
 return (Math.round(subtotal * 100) - Math.round(discount * 100)) / 100;
}
