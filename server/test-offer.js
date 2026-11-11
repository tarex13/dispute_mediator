import { paypalFetch } from './paypal.js';

const disputeId = process.argv[2];
if (!disputeId) {
  console.log('Usage: node test-offer.js <dispute_id>');
  process.exit(1);
}

const result = await paypalFetch(`/v1/customer/disputes/${disputeId}/make-offer`, {
  method: 'POST',
  body: JSON.stringify({
    note: 'Test offer: we can refund half of the amount to resolve this quickly.',
    offer_amount: { currency_code: 'CAD', value: '5.00' },
    offer_type: 'REFUND',
  }),
});

console.log('Status:', result.status);
console.log(JSON.stringify(result.body, null, 2));