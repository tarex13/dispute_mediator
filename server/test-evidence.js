import { paypalFetch } from './paypal.js';

const disputeId = process.argv[2];
if (!disputeId) {
  console.log('Usage: node test-evidence.js <dispute_id>');
  process.exit(1);
}

const result = await paypalFetch(`/v1/customer/disputes/${disputeId}/provide-evidence`, {
  method: 'POST',
  body: JSON.stringify({
    evidences: [
      {
        evidence_type: 'PROOF_OF_FULFILLMENT',
        evidence_info: {
          tracking_info: [
            {
              carrier_name: 'OTHER',
              carrier_name_other: 'Test Carrier',
              tracking_number: 'TEST123456789',
            },
          ],
        },
        notes: 'Test evidence: item shipped with tracking.',
      },
    ],
  }),
});

console.log('Status:', result.status);
console.log(JSON.stringify(result.body, null, 2));