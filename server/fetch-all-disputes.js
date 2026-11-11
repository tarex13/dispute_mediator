import 'dotenv/config';
import fs from 'node:fs';

const BASE = 'https://api-m.sandbox.paypal.com';

const auth = Buffer.from(
  `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
).toString('base64');

const tokenRes = await fetch(`${BASE}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
});
const { access_token } = await tokenRes.json();
const headers = { Authorization: `Bearer ${access_token}` };

const list = await (await fetch(`${BASE}/v1/customer/disputes`, { headers })).json();
console.log(`Found ${list.items?.length ?? 0} disputes\n`);

fs.mkdirSync('fixtures', { recursive: true });
const summary = [];

for (const [i, item] of (list.items ?? []).entries()) {
  const d = await (await fetch(`${BASE}/v1/customer/disputes/${item.dispute_id}`, { headers })).json();
  fs.writeFileSync(`fixtures/dispute-${i + 1}.json`, JSON.stringify(d, null, 2));
  summary.push({
    file: `dispute-${i + 1}.json`,
    reason: d.reason,
    stage: d.dispute_life_cycle_stage,
    status: d.status,
    amount: `${d.dispute_amount?.value} ${d.dispute_amount?.currency_code}`,
    allowed: Object.keys(d.allowed_response_options ?? {}).join(', '),
  });
}

console.table(summary);