// Please note that the mail functionality doesn't work on render (the production environment), but does locally

import nodemailer from 'nodemailer';
import { prepare } from '../../../lib/http.js';
import { findRecord, nowFor } from '../../../lib/disputes.js';
import { analyzeDispute } from '../../../../rules/analyzeDispute.js';
import { newDispute } from '../../../../email/newDispute.js';

const APP_URL = (process.env.APP_URL ?? 'https://dispute-mediator.onrender.com').replace(/\/$/, '');
const DEMO = process.env.DEMO_MODE === 'true';
const DEMO_TARGET = process.env.DEMO_WEBHOOK_TARGET ?? 'DEMO-delivered-with-proof';
const seenEvents = new Set();

function getTransporter() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export default async function handler(req, res) {
  if (!prepare(req, res, 'POST')) return;

  const token = req.query?.token ?? req.params?.secret ?? req.headers['x-webhook-token'];
  if (!process.env.WEBHOOK_SECRET || token !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const body = req.body ?? {};
  if (body.event_type && body.event_type !== 'CUSTOMER.DISPUTE.CREATED') {
    return res.status(200).json({ ok: true, ignored: body.event_type });
  }

  const resource = body.resource ?? {};
  let disputeId = resource.dispute_id; // not body.id, which is the event's own ID
  if (!disputeId || typeof disputeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'resource.dispute_id is required' });
  }

  
  if (body.id && !DEMO) {
    if (seenEvents.has(body.id)) return res.status(200).json({ ok: true, duplicate: true });
    seenEvents.add(body.id);
    if (seenEvents.size > 200) seenEvents.delete(seenEvents.values().next().value);
  }
  console.log("Webhook Triggered");
  let reason = resource.reason;
  let amount = resource.dispute_amount;
  let createdAt = body.create_time;
  let record = null;
  try { record = await findRecord(disputeId); } catch (err) { console.error('Lookup failed:', err.message); }

  // Demo mode: the simulator's mock dispute doesn't exist here, so point at a sample scenario.
  if (!record && DEMO) {
    try { record = await findRecord(DEMO_TARGET); } catch {}
    if (record) {
      disputeId = record.id;
      reason = record.dispute.reason;
      amount = record.dispute.dispute_amount;
      createdAt = new Date().toISOString();
    }
  }

  const analysis = record ? analyzeDispute(record.dispute, nowFor(record)) : null;
  const link = `${APP_URL}/?dispute=${encodeURIComponent(disputeId)}&generate=1`;
  const { subject, text, html } = newDispute({ disputeId, createdAt, reason, amount, analysis, link });

  const transporter = getTransporter();
  if (!transporter) {
    console.log('WEBHOOK received, SMTP not configured. Link would be:', link);
    return res.status(200).json({ ok: true, emailed: false, link });
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: process.env.SELLER_EMAIL ?? process.env.SMTP_USER, // never taken from the request
      subject, text, html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    console.log('WEBHOOK email sent:', info.messageId, previewUrl ?? '');
    return res.status(200).json({ ok: true, emailed: true, previewUrl });
  } catch (err) {
    console.error('Email failed:', err.message);
    return res.status(200).json({ ok: true, emailed: false });
  }
}