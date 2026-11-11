import { paypalFetch } from "./paypal.js";
import 'dotenv/config';

const disputeId = process.argv[2];
const claimAMT = process.argv[3];

if (!disputeId) {
  console.log('Usage: node test-accept.js <dispute_id>');
  process.exit(1);
}


const result = await paypalFetch(`/v1/customer/disputes/${disputeId}/accept-claim`, {
    method: 'POST',
    body:  JSON.stringify(
        {
            note: 'Test offer: we can refund half of the amount to resolve this quickly.',
            accept_claim_reason: 'DID_NOT_SHIP_ITEM',
            accept_claim_type: 'REFUND',
    }
)});

console.log('Status:', result.status);
console.log(JSON.stringify(result.body, null, 2));