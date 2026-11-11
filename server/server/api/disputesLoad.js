import { prepare } from '../lib/http.js';
import { listRecords, toCard, isDemoMode } from '../lib/disputes.js';

export default async function handler(req, res) {
  if (!prepare(req, res, 'GET')) return;
  try {
    const records = await listRecords();
    res.status(200).json({ mode: isDemoMode() ? 'demo' : 'live', disputes: records.map(toCard) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load disputes' });
  }
}