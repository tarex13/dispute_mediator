import { z } from 'zod';

const ACTIONS = ['ACCEPT_CLAIM', 'MAKE_OFFER', 'CONTEST'];

export const recommendationSchema = z.object({
  // The decision. NEED_MORE_INFO is the "I won't guess" option.
  action: z
    .enum([...ACTIONS, 'NEED_MORE_INFO'])
    .describe('The single best next step for the seller.'),

  // Only filled for ACCEPT_CLAIM or MAKE_OFFER, otherwise null.
  refundType: z
    .enum(['REFUND', 'PARTIAL_REFUND', 'REFUND_WITH_RETURN'])
    .nullable()
    .describe('Kind of refund. Null if the action is CONTEST or NEED_MORE_INFO.'),

  amount: z
    .number()
    .nullable()
    .describe('Refund amount in the dispute currency. Only for partial refunds and offers; null otherwise.'),

  sellerCaseStrength: z
    .enum(['LOW', 'MEDIUM', 'HIGH'])
    .describe('How strong the seller position would be if contested, given the evidence available.'),

  reasoning: z
    .string()
    .max(600)
    .describe('Plain-English explanation for a seller with no dispute experience. 2 to 4 sentences.'),

  evidenceUsed: z
    .array(z.object({
      source: z.enum(['BUYER', 'SELLER', 'PAYPAL_DATA']),
      point: z.string().max(200),
    }))
    .max(6)
    .describe('Facts from the provided data that drove the decision. Never invent facts.'),

  evidenceGaps: z
    .array(z.string().max(200))
    .max(5)
    .describe('Evidence that is missing and would strengthen or change the decision.'),

  alternatives: z
    .array(z.object({
      action: z.enum(ACTIONS),
      whyNot: z.string().max(250),
    }))
    .max(2)
    .describe('The other options considered, each with a one-line reason it ranked lower.'),

  draftNote: z
    .string()
    .max(500)
    .describe('The note to send to PayPal with the chosen action, written in a polite, factual tone.'),

  followUpQuestions: z
    .array(z.object({
      id: z.string(),
      question: z.string().max(200),
      answerType: z.enum(['text', 'number', 'yes_no']),
    }))
    .max(4)
    .describe('Questions for the seller. Empty unless more information is needed.'),

  nextSteps: z.array(z.string().max(200)).max(4),
});