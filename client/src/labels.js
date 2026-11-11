export const ACTION_LABELS = {
  ACCEPT_CLAIM: 'Accept and refund',
  MAKE_OFFER: 'Make an offer',
  CONTEST: 'Contest with evidence',
  NEED_MORE_INFO: 'Needs more information',
};
export const ACTION_STYLES = {
  ACCEPT_CLAIM: 'bg-emerald-100 text-emerald-800',
  MAKE_OFFER: 'bg-indigo-100 text-indigo-800',
  CONTEST: 'bg-violet-100 text-violet-800',
  NEED_MORE_INFO: 'bg-amber-100 text-amber-800',
};
export const ACTION_STYLES_NO_BG = {
  ACCEPT_CLAIM: 'text-emerald-800',
  MAKE_OFFER: 'text-indigo-800',
  CONTEST: 'text-violet-800',
  NEED_MORE_INFO: ' text-amber-800',
};
export const STRENGTH_STYLES = {
  HIGH: 'bg-emerald-100 text-emerald-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-red-100 text-red-800',
};
export const REASON_LABELS = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Not as described',
};
export const WAITING_LABELS = {
  seller: 'Your move', buyer: 'Waiting on buyer', paypal: 'PayPal reviewing', none: 'Closed', unknown: 'Unknown',
};
export const WAITING_STYLES = {
  seller: 'bg-indigo-100 text-indigo-800',
  buyer: 'bg-amber-100 text-amber-800',
  paypal: 'bg-sky-100 text-sky-800',
  none: 'bg-gray-100 text-gray-600',
  unknown: 'bg-gray-100 text-gray-600',
};
export const URGENCY_STYLES = {
  overdue: 'bg-red-200 text-red-900',
  critical: 'bg-red-100 text-red-800',
  high: 'bg-amber-100 text-amber-800',
  normal: 'bg-gray-100 text-gray-700',
  none: 'bg-gray-100 text-gray-500',
};
export const SOURCE_LABELS = { BUYER: 'Buyer', SELLER: 'Seller', PAYPAL_DATA: 'PayPal' };

export function money(value, currency) {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD' }).format(value);
  } catch {
    return `${value} ${currency ?? ''}`.trim();
  }
}

// Short text for the grid's "Agent suggests" column.
export function recSummary(rec) {
  if (!rec) return null;
  const amt = rec.amount != null ? money(rec.amount, rec.currency) : null;
  if (rec.action === 'MAKE_OFFER') return `Offer ${amt}`;
  if (rec.action === 'ACCEPT_CLAIM') {
    if (rec.refundType === 'PARTIAL_REFUND') return `Partial refund ${amt}`;
    if (rec.refundType === 'REFUND_WITH_RETURN') return 'Refund with return';
    return 'Full refund';
  }
  if (rec.action === 'CONTEST') return 'Contest';
  return 'Needs info';
}