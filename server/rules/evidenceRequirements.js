// Source: PayPal Customer Disputes API, evidence requirements by reason.
export const EVIDENCE_REQUIREMENTS = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: [
    {
      type: 'PROOF_OF_FULFILLMENT',
      label: 'Proof of shipment or delivery',
      how: 'Carrier name + tracking number, or notes/documents such as a signed delivery receipt',
      optional: false,
    },
    {
      type: 'PROOF_OF_REFUND',
      label: 'Proof of refund',
      how: 'Refund ID (only if you already refunded)',
      optional: true,
    },
  ],
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: [
    {
      type: 'OTHER',
      label: 'Supporting documents',
      how: 'Notes or documents: product description, item URL, return policy, or contract',
      optional: false,
    },
    {
      type: 'PROOF_OF_REFUND',
      label: 'Proof of refund',
      how: 'Refund ID (only if you already refunded)',
      optional: true,
    },
  ],
};