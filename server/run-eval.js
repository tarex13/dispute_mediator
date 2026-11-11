import fs from 'node:fs';
import { analyzeDispute } from './rules/analyzeDispute.js';
import { getRecommendation } from './agent/recommend.js';
import 'dotenv/config';

const DEMO_NOW = new Date('2026-11-01T12:00:00Z');
const filter = process.argv[2]; // optional: only run scenarios whose id contains this text

const files = fs.readdirSync('demo-scenarios').filter((f) => f.endsWith('.json') && (!filter || f.includes(filter)));
const rows = [];
let correct = 0;

for (const f of files) {
  const s = JSON.parse(fs.readFileSync(`demo-scenarios/${f}`, 'utf8'));
  const analysis = analyzeDispute(s.dispute, DEMO_NOW);
  const r = await getRecommendation(analysis, s.context);
  const got = r.recommendation.action;
  const matches = s.acceptable.includes(got);
  if (matches) correct++;
  rows.push({
    scenario: s.id,
    expected: s.acceptable.join('/'),
    got,
    refund: r.recommendation.refundType ?? '',
    amount: r.recommendation.amount ?? '',
    strength: r.recommendation.sellerCaseStrength,
    agrees: matches ? 'yes' : 'NO',
    valid: r.validation.ok ? 'yes' : 'NO',
    attempts: r.attempts,
    key: r.key,
    cached: r.fromCache ? 'yes' : 'no',
  });
  if (!r.validation.ok) console.log(`  [${s.id}] validator problems:`, r.validation.problems);
}

console.table(rows);
console.log(`Agreement with expected answers: ${correct}/${files.length}`);