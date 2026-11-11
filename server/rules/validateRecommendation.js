// server/rules/validateRecommendation.js
// Pure function: no network, no files, no AI.

const isBlank = (s) => typeof s !== 'string' || s.trim() === '';
const hasMoreThan2Decimals = (n) => Math.round(n * 100) / 100 !== n;

export function validateRecommendation(rec, analysis) {
  const { action, refundType, amount, draftNote, followUpQuestions } = rec;
  const problems = [];

  // RULE 1: must be the seller's turn on a supported dispute. Stop early if not.
  if (analysis.waitingOn !== 'seller' || !analysis.supported) {
    return {
      ok: false,
      problems: [`Nothing can be done now (waiting on: ${analysis.waitingOn}, supported: ${analysis.supported}).`],
    };
  }

  const isAccept = action === 'ACCEPT_CLAIM';
  const isOffer = action === 'MAKE_OFFER';
  const isContest = action === 'CONTEST';
  const needsInfo = action === 'NEED_MORE_INFO';

  // RULE 2: action-specific checks
  if (isAccept || isOffer) {
    const allowed = isAccept ? analysis.allowedActions.acceptClaim : analysis.allowedActions.makeOffer;
    if (!allowed.includes(refundType)) {
      problems.push(`Refund type ${refundType} is not allowed for ${action} here (allowed: ${allowed.join(', ') || 'none'}).`);
    }
  }
  if (isContest && !analysis.canProvideEvidence) {
    problems.push('PayPal is not accepting evidence on this dispute right now.');
  }
  if ((isContest || needsInfo) && refundType != null) {
    problems.push(`${action} must not include a refund type (got ${refundType}).`);
  }
  if ((isContest || needsInfo) && amount != null) {
    problems.push(`${action} must not include an amount (got ${amount}).`);
  }
  if (needsInfo && (!Array.isArray(followUpQuestions) || followUpQuestions.length === 0)) {
    problems.push('NEED_MORE_INFO requires at least one follow-up question.');
  }

  // RULE 3: amounts
  if (isAccept && refundType !== 'PARTIAL_REFUND' && amount != null) {
    problems.push(`A full refund must not carry an amount (got ${amount}).`);
  }
  const needsAmount = isOffer || (isAccept && refundType === 'PARTIAL_REFUND');
  if (needsAmount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      problems.push('A partial refund or offer needs a numeric amount.');
    } else {
      if (amount <= 0) problems.push(`Amount ${amount} must be above zero.`);
      if (hasMoreThan2Decimals(amount)) problems.push(`Amount ${amount} has more than 2 decimal places.`);
      const ceiling = isOffer ? analysis.disputeAmountValue : analysis.allowedRefundAmount;
      if (ceiling != null && amount >= ceiling) {
        problems.push(`Amount ${amount} must be below ${ceiling}; use a full refund instead.`);
      }
    }
  }

  // RULE 4: PayPal rejects these actions without a note
  if ((isAccept || isOffer || isContest) && isBlank(draftNote)) {
    problems.push('A note is required for this action.');
  }

  return { ok: problems.length === 0, problems };
}