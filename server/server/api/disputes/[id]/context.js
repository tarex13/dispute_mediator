import { prepare, getId } from '../../../lib/http.js';
import { findRecord, saveContext, getContext } from '../../../lib/disputes.js';

export default async function handler(req, res) {
  if (!prepare(req, res, 'POST')) return;
  try {
    const id = getId(req);
    const record = await findRecord(id);
    if (!record) return res.status(404).json({ error: 'Dispute not found' });
    saveContext(id, req.body ?? {});
    res.status(200).json({ ok: true, context: getContext(id, record.baseContext) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save context' });
  }
}