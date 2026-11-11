import fs from 'node:fs';
import { analyzeDispute } from './rules/analyzeDispute.js';

const rows = fs
  .readdirSync('fixtures')
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const dispute = JSON.parse(fs.readFileSync(`fixtures/${f}`, 'utf8'));
    const a = analyzeDispute(dispute);
    return {
      file: f,
      reason: a.reason,
      supported: a.supported,
      waitingOn: a.waitingOn,
      daysLeft: a.daysLeft,
      urgency: a.urgency,
      missing: a.missingEvidence.map((m) => m.type).join(', '),
      refund: a.allowedActions.acceptClaim.join('/'),
      offer: a.allowedActions.makeOffer.join('/'),
    };
  });

console.table(rows);