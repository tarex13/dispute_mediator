import 'dotenv/config';
import fs from 'node:fs';

const BASE = 'https://api-m.sandbox.paypal.com';

// 1. Trade your client ID + secret for a temporary access token
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

// 2. Get the list, then the full details of the first dispute
const headers = { Authorization: `Bearer ${access_token}` };
const list = await (await fetch(`${BASE}/v1/customer/disputes`, { headers })).json();
for(let i = 0; i < list.items.length; i++){
  
  let id = list.items[i].dispute_id;
  let detail = await (await fetch(`${BASE}/v1/customer/disputes/${id}`, { headers })).json();
  fs.writeFileSync(`data/dispute-raw-${id}.json`, JSON.stringify(detail, null, 2));
}

//fs.mkdirSync('data', { recursive: true });
//fs.writeFileSync('data/dispute-raw.json', JSON.stringify(detail, null, 2));
