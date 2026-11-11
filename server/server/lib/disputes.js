import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeDispute } from '../../rules/analyzeDispute.js';
import { paypalFetch } from '../../paypal.js';

export const DEMO_NOW = new Date('2026-11-01T12:00:00Z');
export const isDemoMode = () => process.env.DEMO_MODE === 'true'; // env values are strings

const SCENARIO_DIR = path.join(process.cwd(), 'demo-scenarios');
const CONTEXT_DIR = path.join(process.cwd(), 'data', 'context');

const REASON_LABELS = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Item not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Not as described',
};

// PayPal disputes have no title, so we build one.
function titleFor(dispute) {
  const item = dispute.disputed_transactions?.[0]?.items?.[0]?.item_name ?? 'Order';
  return `${item} - ${REASON_LABELS[dispute.reason] ?? dispute.reason}`;
}

// Demo disputes are judged "as of" a fixed date so deadlines never expire.
export const nowFor = (record) => (record.source === 'demo' ? DEMO_NOW : new Date());

// A "record" is our internal wrapper around one dispute, demo or live.
export async function listRecords() {
  if (isDemoMode()) {
    return fs.readdirSync(SCENARIO_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => {
        const s = JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, f), 'utf8'));
        return { id: s.dispute.dispute_id, title: s.title, source: 'demo', dispute: s.dispute, baseContext: s.context };
      });
  }
  const list = await paypalFetch('/v1/customer/disputes');
  if (!list.ok) throw new Error(`PayPal list failed with status ${list.status}`);
  const details = await Promise.all(
    (list.body?.items ?? []).map((i) => paypalFetch(`/v1/customer/disputes/${encodeURIComponent(i.dispute_id)}`))
  );
  return details.filter((d) => d.ok).map((d) => ({
    id: d.body.dispute_id, title: titleFor(d.body), source: 'live', dispute: d.body, baseContext: null,
  }));
}

export async function findRecord(id) {
  if (!id) return null;
  if (isDemoMode()) return (await listRecords()).find((r) => r.id === id) ?? null;
  const d = await paypalFetch(`/v1/customer/disputes/${encodeURIComponent(id)}`);
  if (!d.ok) return null;
  return { id: d.body.dispute_id, title: titleFor(d.body), source: 'live', dispute: d.body, baseContext: null };
}

export function toCard(record) {
  return {
    id: record.id,
    title: record.title,
    source: record.source,
    analysis: analyzeDispute(record.dispute, nowFor(record)),
    context: getContext(record.id, record.baseContext),
  };
}

// ---------- context storage (demo-grade: memory + a file when the disk allows) ----------
const EMPTY_CONTEXT = { buyerStatement: null, sellerStatement: null, order: null, listing: null };
const memory = new Map();
const fileFor = (id) => path.join(CONTEXT_DIR, `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null);
const ORDER_TEXT_KEYS = ['itemName', 'orderedDate', 'shippedDate', 'carrier', 'trackingNumber', 'trackingStatus', 'deliveredDate'];

// Never store anything we didn't expect: keep known keys only, cap lengths.
export function cleanContext(input = {}) {
  const out = {};
  if ('buyerStatement' in input) out.buyerStatement = text(input.buyerStatement);
  if ('sellerStatement' in input) out.sellerStatement = text(input.sellerStatement);
  if (input.order && typeof input.order === 'object') {
    out.order = {};
    for (const k of ORDER_TEXT_KEYS) if (k in input.order) out.order[k] = text(input.order[k]);
    if ('price' in input.order) out.order.price = Number.isFinite(Number(input.order.price)) ? Number(input.order.price) : null;
    if ('signatureOnDelivery' in input.order) {
      out.order.signatureOnDelivery = typeof input.order.signatureOnDelivery === 'boolean' ? input.order.signatureOnDelivery : null;
    }
  }
  if (input.listing && typeof input.listing === 'object') {
    out.listing = { description: text(input.listing.description), returnPolicy: text(input.listing.returnPolicy) };
  }
  if (Array.isArray(input.followUpAnswers)) {
    out.followUpAnswers = input.followUpAnswers.slice(0, 5)
      .map((a) => ({ question: text(a?.question), answer: text(a?.answer) }))
      .filter((a) => a.answer);
  }
  return out;
}

function merge(base = {}, extra = {}) {
  return {
    ...base, ...extra,
    ...(base.order || extra.order ? { order: { ...base.order, ...extra.order } } : {}),
    ...(base.listing || extra.listing ? { listing: { ...base.listing, ...extra.listing } } : {}),
  };
}

function readStored(id) {
  if (memory.has(id)) return memory.get(id);
  try { return JSON.parse(fs.readFileSync(fileFor(id), 'utf8')); } catch { return null; }
}

export function saveContext(id, input) {
  const stored = merge(readStored(id) ?? {}, cleanContext(input));
  memory.set(id, stored);
  try { fs.mkdirSync(CONTEXT_DIR, { recursive: true }); fs.writeFileSync(fileFor(id), JSON.stringify(stored, null, 2)); } catch { /* read-only disk: memory still works */ }
  return stored;
}

// IMPORTANT: when nothing was saved, return the scenario's own context untouched,
// so the prompt matches what run-eval used and the AI cache is hit (free).
export function getContext(id, base) {
  const stored = readStored(id);
  if (stored) return merge(base ?? EMPTY_CONTEXT, stored);
  return base ?? EMPTY_CONTEXT;
}