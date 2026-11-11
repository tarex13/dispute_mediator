const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const REASONS = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Item not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Not as described',
};

export function newDispute({ disputeId, createdAt, reason, amount, analysis, link }) {
  const reasonText = REASONS[reason] ?? String(reason ?? 'Unknown reason').replace(/[\r\n]+/g, ' ');
  const amountText = amount?.value ? `${amount.value} ${String(amount.currency_code ?? '').trim()}`.trim() : 'Unknown amount';

  let when = '';
  try {
    when = new Date(createdAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' });
  } catch {  }

  const facts = [];
  if (analysis?.daysLeft !== null && analysis?.daysLeft !== undefined) {
    facts.push(`You have ${analysis.daysLeft} day${analysis.daysLeft === 1 ? '' : 's'} to respond.`);
  }
  if (analysis?.missingEvidence?.length) {
    facts.push(`PayPal expects: ${analysis.missingEvidence.map((m) => m.label).join(', ')}.`);
  }

  const subject = `New dispute: ${reasonText}, ${amountText}`;

  const text = [
    `A buyer opened a dispute (${disputeId}).`,
    `Reason: ${reasonText}`,
    `Amount: ${amountText}`,
    when && `Opened: ${when}`,
    ...facts,
    '',
    `Get a recommendation: ${link}`,
    'Nothing is sent to PayPal until you approve it.',
  ].filter(Boolean).join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
  <h2 style="color:#009CDE;margin-bottom:4px">New dispute</h2>
  <p style="margin-top:0;color:#6b7280">${esc(disputeId)}</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 0;color:#6b7280">Reason</td><td style="padding:6px 0"><b>${esc(reasonText)}</b></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Amount</td><td style="padding:6px 0"><b>${esc(amountText)}</b></td></tr>
    ${when ? `<tr><td style="padding:6px 0;color:#6b7280">Opened</td><td style="padding:6px 0">${esc(when)}</td></tr>` : ''}
  </table>
  ${facts.length ? `<ul style="padding-left:18px">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
  <p style="margin:24px 0">
    <a href="${esc(link)}" style="background:#009CDE;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Generate recommendation</a>
  </p>
  <p style="font-size:12px;color:#9ca3af">The agent only recommends. Nothing is sent to PayPal until you review and approve it.</p>
</div>`;

  return { subject, text, html };
}