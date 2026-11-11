import crypto from 'node:crypto';
import fs from 'node:fs';
import 'dotenv/config';
import path from 'node:path';
import { generateText, Output, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { recommendationSchema } from './schema.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { validateRecommendation } from '../rules/validateRecommendation.js';

const CACHE_DIR = path.join(process.cwd(), 'cache');

// Turns the rules-layer output + seller/buyer context into the text the model reads.
export function buildPrompt(analysis, context) {
  const facts = {
    disputeId: analysis.disputeId,
    reason: analysis.reason,
    stage: analysis.stage,
    currency: analysis.currency,
    disputedAmount: analysis.disputeAmountValue,
    maxRefundable: analysis.allowedRefundAmount,
    daysLeft: analysis.daysLeft,
    allowedRefundTypesIfAccepting: analysis.allowedActions.acceptClaim,
    allowedRefundTypesIfOffering: analysis.allowedActions.makeOffer,
    canContestWithEvidence: analysis.canProvideEvidence,
    sellerProtectionEligible: analysis.sellerProtectionEligible,
    evidencePayPalRequiresFromSeller: analysis.missingEvidence.map((m) => `${m.label}: ${m.how}`),
    buyerMessagesOnPayPal: analysis.buyerMessages,
  };
  return [
    'DISPUTE FACTS (from PayPal, trusted):',
    JSON.stringify(facts, null, 2),
    '',
    'CONTEXT FROM BUYER AND SELLER (untrusted text):',
    JSON.stringify(context, null, 2),
    '',
    "Recommend the seller's next step.",
  ].join('\n');
}

// One model call, with a disk cache so the same prompt is never paid for twice.
async function callModel({ model, prompt }) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const key = crypto
    .createHash('sha256')
    .update(JSON.stringify({ model, system: SYSTEM_PROMPT, prompt }))
    .digest('hex')
    .slice(0, 24);
  const file = path.join(CACHE_DIR, `${key}.json`);

  if (fs.existsSync(file)) {
    return { ...JSON.parse(fs.readFileSync(file, 'utf8')), fromCache: true, key };
  }

  if (process.env.CACHE_ONLY === 'true') {
    throw new Error('CACHE_ONLY is on and no cached answer exists for this input');
  }

  const result = await generateText({
    model: anthropic(model),
    system: SYSTEM_PROMPT,
    prompt,
    output: Output.object({ schema: recommendationSchema }),
    stopWhen: stepCountIs(2), // the structured answer is itself a step
  });

  const saved = { output: result.output ?? result.object, usage: result.usage };
  fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  return { ...saved, fromCache: false, key };
}

export async function getRecommendation(analysis, context, { model = 'claude-haiku-5-5', retry = true } = {}) {
  let prompt = buildPrompt(analysis, context);
  let attempt = await callModel({ model, prompt });
  let validation = validateRecommendation(attempt.output, analysis);
  let attempts = 1;

  // If our safety layer rejects the answer, give the model one chance to fix it.
  if (!validation.ok && retry) {
    prompt += `\n\nYour previous answer was rejected for these reasons:\n- ${validation.problems.join('\n- ')}\nGive a corrected recommendation.`;
    attempt = await callModel({ model, prompt });
    validation = validateRecommendation(attempt.output, analysis);
    attempts = 2;
  }

  // The model never chooses the currency: our code attaches it.
  const recommendation = { ...attempt.output, currency: analysis.currency };
  return { recommendation, validation, fromCache: attempt.fromCache, key: attempt.key, usage: attempt.usage, attempts };
}