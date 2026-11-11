import 'dotenv/config';
import { generateText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';

const paypalToolkit = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET,
  configuration: {
    actions: {
      disputes: { list: true, get: true }, // read-only on purpose
    },
    context: { sandbox: true }, // never remove this during development
  },
});

const result = await generateText({
  model: anthropic('claude-sonnet-5-5'),
  tools: paypalToolkit.getTools(),
  stopWhen: stepCountIs(5), // max 5 loops
  prompt: 'List my PayPal disputes and summarize each one in plain English.',
});

console.log(result.text);
console.log('Tool calls made:', result.steps.flatMap(s => s.toolCalls.map(t => t.toolName)));