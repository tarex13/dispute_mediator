import 'dotenv/config';

const BASE = 'https://api-m.sandbox.paypal.com';
let cached = null; // remembers the token until it expires

export async function getToken() {
  if (cached && cached.expires > Date.now()) return cached.token;

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  cached = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

// Calls PayPal and returns { ok, status, body } so we can see errors clearly
export async function paypalFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}