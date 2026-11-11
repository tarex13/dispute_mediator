import { EVIDENCE_REQUIREMENTS } from './evidenceRequirements.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const WAITING_ON = {
  WAITING_FOR_SELLER_RESPONSE: 'seller',
  WAITING_FOR_BUYER_RESPONSE: 'buyer',
  UNDER_REVIEW: 'paypal',
  RESOLVED: 'none',
};

export function analyzeDispute(dispute, now = new Date()) {
  // 1. How much time is left?
  const due = new Date(dispute.seller_response_due_date || dispute.buyer_response_due_date);
  const waitingOn = WAITING_ON[dispute.status] ?? 'unknown';
  const dueDateString =
  waitingOn === 'seller' ? dispute.seller_response_due_date
  : waitingOn === 'buyer' ? dispute.buyer_response_due_date
  : null;
  const daysLeft = dueDateString ? Math.ceil((new Date(dueDateString) - now) / DAY_MS) : null;
  let urgency = 'normal';
  if(daysLeft == null){
    return dispute.disputed_transactions.transaction_status;
    }
  if (daysLeft <= 0) urgency = 'overdue';
  else if (daysLeft <= 3) urgency = 'critical';
  else if (daysLeft <= 7) urgency = 'high';

  // 2. What does PayPal currently allow?
  const options = dispute.allowed_response_options ?? {};
  const allowedActions = {
    acceptClaim: options.accept_claim?.accept_claim_types ?? [],
    makeOffer: options.make_offer?.offer_types ?? [],
  };

  // 3. What evidence is required, and what is still missing?
  const required = EVIDENCE_REQUIREMENTS[dispute.reason] ?? [];
  const evidences = dispute.evidences ?? [];
  const submittedTypes = evidences
    .filter((e) => e.source === 'SUBMITTED_BY_SELLER')
    .map((e) => e.evidence_type);
  const missingEvidence = required.filter(
    (r) => !r.optional && !submittedTypes.includes(r.type)
  );

  // 4. What has the buyer said?
  const buyerMessages = (dispute.messages ?? []).filter((m) => m.posted_by === 'BUYER');

  // 5. How much money is on hold?
  const onHold = (dispute.fund_movements ?? [])
    .filter((f) => f.reason === 'HOLD_PLACED')
    .reduce((sum, f) => sum + Number(f.amount.value), 0);

  const transaction = dispute.disputed_transactions?.[0] ?? {};
  
  const toNumber = (v) => (Number.isFinite(Number(v)) && v !== undefined && v !== null ? Number(v) : null);

  return {
    disputeId: dispute.dispute_id,
    reason: dispute.reason,
    supported: required.length > 0, // false = outside our scope
    stage: dispute.dispute_life_cycle_stage,
    amount: `${dispute.dispute_amount?.value} ${dispute.dispute_amount?.currency_code}`,

    // inside the returned object:
    waitingOn,
    currency: dispute.dispute_amount?.currency_code?.trim() ?? null,
    disputeAmountValue: toNumber(dispute.dispute_amount?.value),
    allowedRefundAmount: toNumber(dispute.refund_details?.allowed_refund_amount?.value),
    canProvideEvidence: (dispute.links ?? []).some((l) => l.rel === 'provide_evidence'),
    waitingOn,
    daysLeft,
    urgency,
    allowedActions,
    missingEvidence,
    buyerMessages: buyerMessages.map((m) => m.content),
    fundsOnHold: onHold,
    sellerProtectionEligible: transaction.seller_protection_eligible ?? false,
  };
}