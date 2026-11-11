import 'dotenv/config';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const { text } = await generateText({
  model: anthropic('claude-haiku-4-5'),
  prompt: 'In one sentence, what is a payment dispute?',
});
console.log(text);