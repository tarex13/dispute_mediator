import fs from 'node:fs';
import { analyzeDispute } from './rules/analyzeDispute.js';
import { validateRecommendation } from './rules/validateRecommendation.js';

const load = (f) => analyzeDispute(JSON.parse(fs.readFileSync(`fixtures/${f}`, 'utf8')));
const A = load('dispute-.json');  // not received, seller's turn
const B = load('dispute-3.json'); // not as described, seller's turn
const C = load('dispute-1.json'); // buyer's turn

const rec = (o) => ({
  action: 'CONTEST', refundType: null, amount: null, sellerCaseStrength: 'MEDIUM',
  reasoning: 'x', evidenceUsed: [], evidenceGaps: [], alternatives: [],
  draftNote: 'A polite note.', followUpQuestions: [], nextSteps: [], ...o,
});

const tests = [
  ['contest is valid',                     rec({}), A, true],
  ['contest when evidence not allowed',    rec({}), { ...A, canProvideEvidence: false }, false],
  ['contest with a refund type',           rec({ refundType: 'REFUND' }), A, false],
  ['full refund, no amount',               rec({ action: 'ACCEPT_CLAIM', refundType: 'REFUND' }), A, true],
  ['full refund with an amount',           rec({ action: 'ACCEPT_CLAIM', refundType: 'REFUND', amount: 5 }), A, false],
  ['partial refund 4',                     rec({ action: 'ACCEPT_CLAIM', refundType: 'PARTIAL_REFUND', amount: 4 }), A, true],
  ['partial refund 4.999 (3 decimals)',    rec({ action: 'ACCEPT_CLAIM', refundType: 'PARTIAL_REFUND', amount: 4.999 }), A, false],
  ['partial refund equal to full',         rec({ action: 'ACCEPT_CLAIM', refundType: 'PARTIAL_REFUND', amount: 10 }), A, false],
  ['offer 5 is valid',                     rec({ action: 'MAKE_OFFER', refundType: 'REFUND', amount: 5 }), A, true],
  ['offer 999',                            rec({ action: 'MAKE_OFFER', refundType: 'REFUND', amount: 999 }), A, false],
  ['offer equals full amount',             rec({ action: 'MAKE_OFFER', refundType: 'REFUND', amount: 10 }), A, false],
  ['offer 0',                              rec({ action: 'MAKE_OFFER', refundType: 'REFUND', amount: 0 }), A, false],
  ['offer -5',                             rec({ action: 'MAKE_OFFER', refundType: 'REFUND', amount: -5 }), A, false],
  ['offer with null amount',               rec({ action: 'MAKE_OFFER', refundType: 'REFUND', amount: null }), A, false],
  ['return-refund offer on not-received',  rec({ action: 'MAKE_OFFER', refundType: 'REFUND_WITH_RETURN', amount: 5 }), A, false],
  ['refund with return on not-as-described', rec({ action: 'ACCEPT_CLAIM', refundType: 'REFUND_WITH_RETURN' }), B, true],
  ['empty note on an offer',               rec({ action: 'MAKE_OFFER', refundType: 'REFUND', amount: 5, draftNote: '   ' }), A, false],
  ['need more info, no questions',         rec({ action: 'NEED_MORE_INFO' }), A, false],
  ['need more info, one question',         rec({ action: 'NEED_MORE_INFO', followUpQuestions: [{ id: 'q1', question: 'Tracking?', answerType: 'text' }] }), A, true],
  ['buyer\'s turn',                        rec({}), C, false],
  ['unsupported dispute reason',           rec({}), { ...A, supported: false }, false],
];

let failed = 0;
for (const [name, r, analysis, expectOk] of tests) {
  const result = validateRecommendation(r, analysis);
  const pass = result.ok === expectOk;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `  (got ok=${result.ok}, expected ${expectOk})`}`);
  if (!result.ok) console.log(`      problems: ${result.problems.join(' | ')}`);
}

// One more: it should report ALL problems, not just the first.
const multi = validateRecommendation(
  rec({ action: 'MAKE_OFFER', refundType: 'REFUND_WITH_RETURN', amount: 999, draftNote: '' }), A);
console.log(multi.problems.length >= 3 ? 'PASS  reports several problems' : 'FAIL  reports several problems');
console.log(failed === 0 ? '\nAll tests passed' : `\n${failed} test(s) failed`);