import { useEffect, useState } from 'react';
import { approve, saveContext } from './api';
import {
    ACTION_LABELS, ACTION_STYLES, STRENGTH_STYLES, REASON_LABELS, WAITING_LABELS,
    WAITING_STYLES, URGENCY_STYLES, SOURCE_LABELS, money,
} from './labels';

const NOT_RECEIVED = 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED';

const SOURCE_STYLES = {
    BUYER: 'bg-amber-400/20 text-amber-300',
    SELLER: 'bg-indigo-400/20 text-indigo-300',
    PAYPAL_DATA: 'bg-sky-400/20 text-sky-300',
};

const inputCls =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 ' +
    'placeholder:text-slate-500 focus:border-[#009CDE] focus:outline-none disabled:opacity-60';

const Pill = ({ className = '', children }) => (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
        {children}
    </span>
);

const Section = ({ title, right, children }) => (
    <section className="border-b border-[#009CDE]/30 p-4 last:border-b-0">
        <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
            {right}
        </div>
        {children}
    </section>
);

const Stat = ({ label, children }) => (
    <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 text-slate-100">{children}</div>
    </div>
);

const Field = ({ label, children }) => (
    <label className="block text-sm">
        <span className="mb-1 block text-slate-400">{label}</span>
        {children}
    </label>
);

const List = ({ items, empty }) =>
    items?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            {items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
    ) : (
        <p className="text-sm text-slate-500">{empty}</p>
    );

function initialCtx(card) {
    const c = card?.context ?? {};
    const sig = c.order?.signatureOnDelivery;
    return {
        sellerStatement: c.sellerStatement ?? '',
        itemName: c.order?.itemName ?? '',
        shippedDate: c.order?.shippedDate ?? '',
        carrier: c.order?.carrier ?? '',
        trackingNumber: c.order?.trackingNumber ?? '',
        trackingStatus: c.order?.trackingStatus ?? '',
        deliveredDate: c.order?.deliveredDate ?? '',
        signature: sig === true ? 'yes' : sig === false ? 'no' : '',
        description: c.listing?.description ?? '',
        returnPolicy: c.listing?.returnPolicy ?? '',
    };
}

function consequenceText(action) {
    if (action === 'CONTEST') return 'Submitting evidence passes this dispute to the buyer. You will no longer be able to make an offer.';
    if (action === 'MAKE_OFFER') return 'Your offer goes to the buyer, who can accept or decline it inside PayPal. Contesting is no longer available afterward.';
    if (action === 'ACCEPT_CLAIM') return 'Accepting refunds the buyer. PayPal may still review the dispute afterward.';
    return '';
}

// Turns a failed API response into short lines a seller can read.
function explainFailure(res) {
    if (res.status === 409) return res.data?.problems ?? ['This approval was rejected.'];
    if (res.status === 502) {
        const d = res.data?.paypalError;
        return ['PayPal rejected this request.', d?.details?.[0]?.issue ?? d?.message].filter(Boolean);
    }
    return [res.data?.error ?? res.data?.problems?.[0] ?? 'Something went wrong. Please try again.'];
}

export default function RecommendationPanel({
    card, rec, busy, error, approved, onGenerate, onApproved, onContextSaved,
}) {
    const [ctx, setCtx] = useState(() => initialCtx(card));
    const [saveState, setSaveState] = useState(null); // null | 'saving' | 'saved' | 'error'
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [outcome, setOutcome] = useState(null); // null | { ok:false, lines:[] }
    const [answers, setAnswers] = useState({});

    // Whenever a new recommendation arrives, reset the editable fields to the agent's values.
    useEffect(() => {
        setAmount(rec?.amount != null ? String(rec.amount) : '');
        setNote(rec?.draftNote ?? '');
        setConfirming(false);
        setOutcome(null);
    }, [rec]);

    if (!card) return null;

    const a = card.analysis;
    const cur = a.currency;
    const isDemo = card.source === 'demo';
    const actionable = a.waitingOn === 'seller' && a.supported;

    // ----- approve-button logic (client-side checks are for UX; the server re-validates everything) -----
    const needsAmount = !!rec && (rec.action === 'MAKE_OFFER' || (rec.action === 'ACCEPT_CLAIM' && rec.refundType === 'PARTIAL_REFUND'));
    const ceiling = rec?.action === 'MAKE_OFFER' ? a.disputeAmountValue : a.allowedRefundAmount;
    const parsed = amount.trim() === '' ? NaN : Number(amount);

    let amountError = null;
    if (needsAmount) {
        if (!Number.isFinite(parsed)) amountError = 'Enter an amount.';
        else if (parsed <= 0) amountError = 'Amount must be above zero.';
        else if (Math.round(parsed * 100) / 100 !== parsed) amountError = 'Use at most 2 decimal places.';
        else if (ceiling != null && parsed >= ceiling) amountError = `Must be below ${money(ceiling, cur)}. Use a full refund instead.`;
    }
    const noteError = note.trim() === '' ? 'A note is required.' : null;
    const missingTracking =
        rec?.action === 'CONTEST' && a.reason === NOT_RECEIVED && !card.context?.order?.trackingNumber;
    const canApprove = !amountError && !noteError && !missingTracking && !submitting;

    function summary() {
        let s = '';
        if (rec.action === 'MAKE_OFFER') s = `Send an offer of ${money(parsed, cur)} to the buyer`;
        else if (rec.action === 'CONTEST') s = 'Submit your evidence to PayPal';
        else if (rec.refundType === 'PARTIAL_REFUND') s = `Refund ${money(parsed, cur)} (partial)`;
        else if (rec.refundType === 'REFUND_WITH_RETURN') s = 'Refund the buyer once the item is returned';
        else s = `Refund the buyer ${money(a.disputeAmountValue, cur)} in full`;
        return isDemo ? `${s} (demo: nothing is sent)` : s;
    }

    async function handleApprove() {
        if (submitting || !canApprove) return;
        setSubmitting(true);
        setOutcome(null);
        const res = await approve(card.id, rec, { note, ...(needsAmount ? { amount: parsed } : {}) });
        setSubmitting(false);
        setConfirming(false);
        if (res.ok) onApproved(card.id, res.data);
        else setOutcome({ ok: false, lines: explainFailure(res) });
    }

    async function handleSaveDetails() {
        setSaveState('saving');
        const res = await saveContext(card.id, {
            sellerStatement: ctx.sellerStatement,
            order: {
                itemName: ctx.itemName, shippedDate: ctx.shippedDate, carrier: ctx.carrier,
                trackingNumber: ctx.trackingNumber, trackingStatus: ctx.trackingStatus,
                deliveredDate: ctx.deliveredDate,
                signatureOnDelivery: ctx.signature === '' ? null : ctx.signature === 'yes',
            },
            listing: { description: ctx.description, returnPolicy: ctx.returnPolicy },
        });
        if (res.ok) {
            setSaveState('saved');
            onContextSaved(card.id, res.data.context);
        } else {
            setSaveState('error');
        }
    }

    const set = (key) => (e) => { setCtx((p) => ({ ...p, [key]: e.target.value })); setSaveState(null); };
    const daysText = a.daysLeft === null || a.daysLeft === undefined ? '—' : a.daysLeft <= 0 ? 'Overdue' : `${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'}`;

    const answeredList = (rec?.followUpQuestions ?? [])
        .map((q, i) => ({ question: q.question, answer: (answers[i] ?? '').trim() }))
        .filter((x) => x.answer);

    return (
        <div className="overflow-hidden rounded-lg border-2 border-[#009CDE]/60 bg-white/[0.03] shadow-2xl">
            {/* Header */}
            <div className="grid grid-cols-2 gap-4 border-b-2 border-[#009CDE] bg-white/5 p-4 md:grid-cols-4">
                <Stat label="Dispute">{card.title}</Stat>
                <Stat label="Amount">{money(a.disputeAmountValue, cur)}</Stat>
                <Stat label="Time left">
                    <Pill className={URGENCY_STYLES[a.urgency] ?? URGENCY_STYLES.none}>{daysText}</Pill>
                </Stat>
                <Stat label="Status">
                    <Pill className={WAITING_STYLES[a.waitingOn] ?? WAITING_STYLES.unknown}>
                        {WAITING_LABELS[a.waitingOn] ?? a.waitingOn}
                    </Pill>
                </Stat>
            </div>

            {/* Approved banner (stays visible even after the dispute leaves "your move") */}
            {approved && (
                <div role="status" className="border-b border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                    {approved.mode === 'demo'
                        ? 'Approved in demo mode. Nothing was sent to PayPal, and the approval was recorded in the audit log.'
                        : 'Sent to PayPal. The dashboard has refreshed with the dispute’s new status.'}
                </div>
            )}

            {/* Not actionable */}
            {!actionable && !approved && (
                <div className="p-4 text-sm text-slate-300">
                    {!a.supported
                        ? 'This dispute type is not supported yet. The mediator handles “item not received” and “not as described”.'
                        : a.waitingOn === 'buyer'
                            ? 'Waiting on the buyer. Nothing to do until they respond.'
                            : a.waitingOn === 'paypal'
                                ? 'PayPal is reviewing this dispute. Nothing to do.'
                                : a.waitingOn === 'none'
                                    ? 'This dispute is closed.'
                                    : 'The status of this dispute is not recognised, so no action is offered.'}
                </div>
            )}

            {actionable && (
                <>
                    {/* Facts */}
                    <Section title="Facts">
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                            <Stat label="Reason">{REASON_LABELS[a.reason] ?? a.reason}</Stat>
                            <Stat label="Funds on hold">{money(a.fundsOnHold, cur)}</Stat>
                            <Stat label="Seller protection">{a.sellerProtectionEligible ? 'Eligible' : 'Not eligible'}</Stat>
                            <Stat label="Stage">{a.stage}</Stat>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                                <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">What the buyer told PayPal</div>
                                {a.buyerMessages?.length
                                    ? a.buyerMessages.map((m, i) => (
                                        <p key={i} className="rounded-md bg-white/5 p-3 text-sm italic text-slate-200">“{m}”</p>
                                    ))
                                    : <p className="text-sm text-slate-500">No message.</p>}
                            </div>
                            <div>
                                <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Evidence PayPal expects from you</div>
                                {a.missingEvidence?.length ? (
                                    <ul className="space-y-2">
                                        {a.missingEvidence.map((m) => (
                                            <li key={m.type} className="rounded-md bg-white/5 p-3 text-sm">
                                                <div className="font-medium text-slate-100">{m.label}</div>
                                                <div className="text-slate-400">{m.how}</div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-sm text-emerald-300">Nothing outstanding.</p>}
                            </div>
                        </div>
                    </Section>

                    {/* Seller details */}
                    <Section
                        title="Your order details"
                        right={isDemo
                            ? <Pill className="bg-amber-400/20 text-amber-300">Sample data, read-only</Pill>
                            : <span className="text-xs text-slate-400">The agent only knows what you enter here</span>}
                    >
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="md:col-span-3">
                                <Field label="Your side of the story">
                                    <textarea rows={2} className={inputCls} disabled={isDemo} value={ctx.sellerStatement}
                                        onChange={set('sellerStatement')} placeholder="What happened, from your records." />
                                </Field>
                            </div>
                            <Field label="Item"><input className={inputCls} disabled={isDemo} value={ctx.itemName} onChange={set('itemName')} /></Field>
                            <Field label="Shipped on"><input type="date" className={inputCls} disabled={isDemo} value={ctx.shippedDate} onChange={set('shippedDate')} /></Field>
                            <Field label="Carrier"><input className={inputCls} disabled={isDemo} value={ctx.carrier} onChange={set('carrier')} /></Field>
                            <Field label="Tracking number"><input className={inputCls} disabled={isDemo} value={ctx.trackingNumber} onChange={set('trackingNumber')} /></Field>
                            <Field label="Tracking status"><input className={inputCls} disabled={isDemo} value={ctx.trackingStatus} onChange={set('trackingStatus')} /></Field>
                            <Field label="Delivered on"><input type="date" className={inputCls} disabled={isDemo} value={ctx.deliveredDate} onChange={set('deliveredDate')} /></Field>
                            <Field label="Signature on delivery">
                                <select className={inputCls + " selectClass"} disabled={isDemo} value={ctx.signature} onChange={set('signature')}>
                                    <option className='"bg-gray-300"' value="">Unknown</option>
                                    <option value="yes">Yes</option>
                                    <option value="no">No</option>
                                </select>
                            </Field>
                            <div className="md:col-span-2">
                                <Field label="Listing description">
                                    <textarea rows={2} className={inputCls} disabled={isDemo} value={ctx.description} onChange={set('description')} />
                                </Field>
                            </div>
                            <Field label="Return policy">
                                <textarea rows={2} className={inputCls} disabled={isDemo} value={ctx.returnPolicy} onChange={set('returnPolicy')} />
                            </Field>
                        </div>
                        {!isDemo && (
                            <div className="mt-3 flex items-center gap-3">
                                <button type="button" onClick={handleSaveDetails} disabled={saveState === 'saving'}
                                    className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50">
                                    {saveState === 'saving' ? 'Saving…' : 'Save details'}
                                </button>
                                {saveState === 'saved' && <span className="text-sm text-emerald-300">Saved. Ask the agent again to use them.</span>}
                                {saveState === 'error' && <span role="alert" className="text-sm text-red-300">Could not save. Try again.</span>}
                            </div>
                        )}
                    </Section>

                    {/* Agent */}
                    <div className="border-b border-[#009CDE]/30 p-4 last:border-b-0">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            {rec && <div className='flex flex-col gap-3 flex-wrap items-center'>
                                <div className='flex gap-3'>
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Agent Recommendation</h3>
                                    {rec && <Pill className={`${ACTION_STYLES[rec.action]} !text-sm !px-3 !py-1`}>{ACTION_LABELS[rec.action]}</Pill>}
                                </div>
                                {rec?.action !== 'NEED_MORE_INFO' && (
                                    <div className="text-sm text-slate-300 flex w-full gap-4">
                                        <div className='w-[50%] text-left'>
                                            <span className='font-semibold '>Your case if contested: </span>
                                        </div>
                                        <div className='w-[50%] flex'>
                                            {rec && <Pill className={STRENGTH_STYLES[rec.sellerCaseStrength]}>{rec.sellerCaseStrength}</Pill>}
                                        </div>
                                    </div>
                                )}
                            </div>}
                            <button type="button" onClick={() => onGenerate()} disabled={busy || isDemo && !!rec}
                                className="rounded-md bg-[#009CDE] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008bc6] disabled:opacity-50">
                                {busy ? 'Thinking…' : rec ? 'Ask again' : 'Get recommendation'}
                            </button>
                        </div>
                        {busy && <p className="text-sm text-slate-400">Asking the agent…</p>}
                        {error && !busy && <p role="alert" className="rounded-md bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                        {!rec && !busy && !error && (
                            <p className="text-sm text-slate-400">
                                {isDemo ? 'Loading a saved suggestion…' : 'Runs the AI agent on this dispute using the details above.'}
                            </p>
                        )}

                        {rec && (
                            <>
                                <div className="space-y-5">


                                    <p className="text-slate-200">{rec.reasoning}</p>

                                    <div className='w-full p-0 h-0.25 bg-[#009CDE]/30 mt-5 mb-5'></div>
                                    {rec.evidenceUsed?.length > 0 && (
                                        <div>
                                            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">What this is based on</div>
                                            <ul className="flex flex-wrap justify-between">
                                                {rec.evidenceUsed.map((e, i) => (
                                                    <li key={i} className={`border-l-1 flex items-start gap-3 text-sm text-slate-300 items-center p-2 m-1 ${SOURCE_STYLES[e.source]}`}>
                                                        <span className={`pl-2 pr-2 shrink-0 ${SOURCE_STYLES[e.source] ?? ''}`}>{SOURCE_LABELS[e.source] ?? e.source}</span>
                                                        <span>{e.point}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    <div className='w-full h-0.25 bg-[#009CDE]/30 mt-5 mb-5'></div>
                                    <div className="grid gap-5 md:grid-cols-3 text-left">
                                        <div>
                                            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Missing evidence</div>
                                            <List items={rec.evidenceGaps} empty="Nothing missing." />
                                        </div>
                                        <div>
                                            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Other options</div>
                                            <List items={rec.alternatives?.map((x) => `${ACTION_LABELS[x.action]}: ${x.whyNot}`)} empty="None considered." />
                                        </div>
                                        <div>
                                            <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Next steps</div>
                                            <List items={rec.nextSteps} empty="None." />
                                        </div>
                                    </div>

                                    {/* Follow-up questions */}
                                    {rec.action === 'NEED_MORE_INFO' && (
                                        <div className="space-y-3 rounded-md border border-amber-400/30 bg-amber-400/5 p-4">
                                            <div className="text-sm font-medium text-amber-200">The agent needs a few answers before it can decide:</div>
                                            {rec.followUpQuestions.map((q, i) => (
                                                <Field key={q.id ?? i} label={q.question}>
                                                    {q.answerType === 'yes_no' ? (
                                                        <select className={inputCls} disabled={isDemo} value={answers[i] ?? ''}
                                                            onChange={(e) => setAnswers((p) => ({ ...p, [i]: e.target.value }))}>
                                                            <option value="">Select…</option>
                                                            <option value="Yes">Yes</option>
                                                            <option value="No">No</option>
                                                        </select>
                                                    ) : (
                                                        <input type={q.answerType === 'number' ? 'number' : 'text'} className={inputCls}
                                                            disabled={isDemo} value={answers[i] ?? ''}
                                                            onChange={(e) => setAnswers((p) => ({ ...p, [i]: e.target.value }))} />
                                                    )}
                                                </Field>
                                            ))}
                                            <button type="button" onClick={() => onGenerate(answeredList)}
                                                disabled={isDemo || busy || answeredList.length === 0}
                                                className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
                                                Submit answers
                                            </button>
                                            {isDemo && (
                                                <p className="text-xs text-slate-400">
                                                    In live mode the agent re-runs with your answers. Disabled in the demo to protect AI credits.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Approval */}
                                    {rec.action !== 'NEED_MORE_INFO' && !approved && (
                                        <div className="space-y-4 rounded-md border border-[#009CDE]/40 bg-white/5 p-4">
                                            <div className="text-sm font-semibold text-slate-100">Review and approve</div>

                                            {needsAmount && (
                                                <Field label={rec.action === 'MAKE_OFFER' ? 'Offer amount' : 'Refund amount'}>
                                                    <div className="flex items-center gap-3">
                                                        <input type="number" step="0.01" min="0" className={`${inputCls} max-w-[10rem]`}
                                                            value={amount} onChange={(e) => { setAmount(e.target.value); setConfirming(false); }} />
                                                        <span className="text-xs text-slate-400">
                                                            Suggested by the agent; you decide. Must be below {money(ceiling, cur)}.
                                                        </span>
                                                    </div>
                                                    {amountError && <p role="alert" className="mt-1 text-xs text-red-300">{amountError}</p>}
                                                </Field>
                                            )}

                                            <Field label="Note to send with this action">
                                                <textarea rows={4} className={inputCls} value={note}
                                                    onChange={(e) => { setNote(e.target.value); setConfirming(false); }} />
                                                {noteError && <p role="alert" className="mt-1 text-xs text-red-300">{noteError}</p>}
                                            </Field>

                                            {missingTracking && (
                                                <p role="alert" className="rounded-md bg-amber-400/10 p-3 text-sm text-amber-200">
                                                    Contesting a not-received dispute needs a tracking number. Add it under “Your order details” and save.
                                                </p>
                                            )}

                                            <p className="rounded-md bg-white/5 p-3 text-sm text-slate-300">{consequenceText(rec.action)}</p>

                                            {outcome && !outcome.ok && (
                                                <div role="alert" className="rounded-md bg-red-500/10 p-3 text-sm text-red-300">
                                                    <div className="font-medium">This was not sent.</div>
                                                    <ul className="mt-1 list-disc pl-5">
                                                        {outcome.lines.map((l, i) => <li key={i}>{l}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            <div className='pt-5'>
                                                {!confirming ? (
                                                    <button type="button" disabled={!canApprove} onClick={() => setConfirming(true)}
                                                        className="rounded-md cursor-pointer bg-emerald-600 px-5 py-2 mt-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
                                                        Approve…
                                                    </button>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-3 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3">
                                                        <span className="text-sm text-emerald-100">{summary()}?</span>
                                                        <button type="button" onClick={handleApprove} disabled={!canApprove}
                                                            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                                                            {submitting ? 'Sending…' : 'Confirm and send'}
                                                        </button>
                                                        <button type="button" onClick={() => setConfirming(false)} disabled={submitting}
                                                            className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}