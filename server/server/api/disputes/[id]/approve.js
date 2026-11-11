// server/server/api/disputes/[id]/approve.js
import fs from 'node:fs';
import path from 'node:path';
import { prepare, getId } from  '../../../lib/http.js';
import { findRecord, nowFor, getContext } from '../../../lib/disputes.js';
import { analyzeDispute } from '../../../../rules/analyzeDispute.js';
import { validateRecommendation } from '../../../../rules/validateRecommendation.js';
import { paypalFetch } from '../../../../paypal.js';
import 'dotenv/config';


const ACCEPT_REASONS = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: null,
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: null,
};

const hasValue = (v) => v !== undefined && v !== null && v !== '';

// Pure function: decides WHICH PayPal call to make and what to send. It sends nothing.
// Returns { path, body } or { error } when something PayPal needs is missing.
function buildPaypalCall(final, record, analysis, context) {
  const base = `/v1/customer/disputes/${encodeURIComponent(record.id)}`;
  const currency = analysis.currency;

  if (final.action === 'MAKE_OFFER') {
    return {
      path: `${base}/make-offer`,
      body: {
        note: final.draftNote,
        offer_amount: { currency_code: currency, value: final.amount.toFixed(2) },
        offer_type: final.refundType,
      },
    };
  }

  if (final.action === 'ACCEPT_CLAIM') {
    const body = {
      note: final.draftNote,
      accept_claim_type: final.refundType,
    };
    const reason = ACCEPT_REASONS[analysis.reason];
    if (reason) body.accept_claim_reason = reason;
    if (final.refundType === 'PARTIAL_REFUND') {
      // UNVERIFIED: PayPal's reference describes a refund amount for partial refunds,
      // but I have not confirmed the exact field shape. Test on a fresh dispute.
      body.refund_amount = { currency_code: currency, value: final.amount.toFixed(2) };
    }
    return { path: `${base}/accept-claim`, body };
  }

  if (final.action === 'CONTEST') {
    if (analysis.reason === 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED') {
      const order = context?.order;
      if (!order?.trackingNumber) {
        return { error: 'Tracking number is required to contest a not-received dispute.' };
      }
      return {
        path: `${base}/provide-evidence`,
        body: {
          evidences: [{
            evidence_type: 'PROOF_OF_FULFILLMENT',
            evidence_info: {
              tracking_info: [{
                carrier_name: 'OTHER',
                carrier_name_other: order.carrier ?? 'Other',
                tracking_number: order.trackingNumber,
              }],
            },
            notes: final.draftNote,
          }],
        },
      };
    }
    return {
      path: `${base}/provide-evidence`,
      body: { evidences: [{ evidence_type: 'OTHER', notes: final.draftNote }] },
    };
  }

  return { error: `Unsupported action: ${final.action}` };
}

// One line per approval. Wrapped so a read-only disk can never break an approval.
function writeAuditLog(entry) {
  try {
    const dir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'audit.log'), JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

export default async function handler(req, res) {
  if (!prepare(req, res, 'POST')) return;
  try {
    const id = getId(req);
    const { recommendation, edits = {} } = req.body ?? {};

    // 1. Reject early.
    if (!recommendation || typeof recommendation !== 'object') {
      return res.status(400).json({ ok: false, problems: ['Request body must include a recommendation.'] });
    }
    if (recommendation.action === 'NEED_MORE_INFO') {
      return res.status(409).json({ ok: false, problems: ['Nothing to send: the agent needs more information first.'] });
    }

    // 2-3. Fresh facts from PayPal (or the demo file), never the browser's copy.
    const record = await findRecord(id);
    if (!record) return res.status(404).json({ ok: false, problems: ['Dispute not found.'] });
    const analysis = analyzeDispute(record.dispute, nowFor(record));

    // 4. Final recommendation = AI's answer + the seller's edits.
    const final = {
      action: recommendation.action,
      refundType: recommendation.refundType ?? null,
      amount: hasValue(edits.amount) ? Number(edits.amount) : (recommendation.amount ?? null),
      draftNote: hasValue(edits.note) ? String(edits.note) : (recommendation.draftNote ?? ''),
      followUpQuestions: recommendation.followUpQuestions ?? [],
    };

    // 5. The safety layer decides, not the AI and not the browser.
    const validation = validateRecommendation(final, analysis);
    if (!validation.ok) return res.status(409).json({ ok: false, problems: validation.problems });

    // 6-7. Demo disputes never touch PayPal. Live ones do.
    let paypalStatus = 'SIMULATED';
    if (record.source !== 'demo') {
      const context = getContext(id, record.baseContext);
      const call = buildPaypalCall(final, record, analysis, context);
      if (call.error) return res.status(409).json({ ok: false, problems: [call.error] });
      console.log(call);
      const r = await paypalFetch(call.path, { method: 'POST', body: JSON.stringify(call.body) });
      if (!r.ok) return res.status(502).json({ ok: false, paypalStatus: r.status, paypalError: r.body });
      paypalStatus = r.status;
    }

    // 8. Audit trail.
    writeAuditLog({
      time: new Date().toISOString(), id, mode: record.source, action: final.action,
      refundType: final.refundType, amount: final.amount, note: final.draftNote, paypalStatus,
    });

    // 9. Done.
    return res.status(200).json({ ok: true, mode: record.source, action: final.action, paypalStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, problems: ['Approval failed unexpectedly.'] });
  }
}