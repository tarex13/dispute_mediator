// Shared by every handler: CORS, method check, and reading the :id.
export function prepare(req, res, allowedMethod) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', `${allowedMethod},OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return false; }
  if (req.method !== allowedMethod) { res.status(405).json({ error: 'Method not allowed' }); return false; }
  return true; // keep going
}

// Vercel puts [id] in req.query; Express puts :id in req.params.
export const getId = (req) => req.query?.id ?? req.params?.id;