import { prepare, getId } from '../../../lib/http.js';
import { findRecord, nowFor, saveContext, getContext } from '../../../lib/disputes.js';
import { analyzeDispute } from '../../../../rules/analyzeDispute.js';
import { getRecommendation } from '../../../../agent/recommend.js';
import 'dotenv/config';

export default async function handler(req, res) {
  if (!prepare(req, res, 'POST')) return;
  try {
    const id = getId(req);
    const record = await findRecord(id);
    if (!record) return res.status(404).json({ error: 'Dispute not found' });

    if (req.body?.followUpAnswers) saveContext(id, { followUpAnswers: req.body.followUpAnswers });

    const analysis = analyzeDispute(record.dispute, nowFor(record));

    // Credit saver: don't pay for an AI call when there is nothing to decide.
    if (analysis.waitingOn !== 'seller' || !analysis.supported) {
      return res.status(409).json({ error: 'Nothing to recommend', waitingOn: analysis.waitingOn, supported: analysis.supported });
    }

    const result = await getRecommendation(analysis, getContext(id, record.baseContext));
    if (!result.validation.ok) {
      return res.status(422).json({ ok: false, error: 'No valid recommendation', problems: result.validation.problems });
    }
    res.status(200).json({ ok: true, id, recommendation: result.recommendation, fromCache: result.fromCache, attempts: result.attempts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Recommendation failed' });
  }
}