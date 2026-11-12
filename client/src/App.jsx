import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRecommendation, loadDisputes } from './api';
import DisputeGrid from './DisputeGrid';
import { ACTION_LABELS, money, recSummary } from './labels';
import RecommendationPanel from './RecommendationPanel';

import { useRef } from 'react';

const BLUE = '#009CDE';

function StatTile({ label, value, accent }) {
  return (
    <div
      className="rounded-lg bg-white/5 p-4 shadow-lg"
      style={{ borderBottom: `3px solid ${accent}` }}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState(null);         // 'demo' | 'live'
  const [cards, setCards] = useState([]);         // DisputeCard[]
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [recs, setRecs] = useState({});           // dispute id -> recommendation object
  const [recErrors, setRecErrors] = useState({}); // dispute id -> message
  const [busyIds, setBusyIds] = useState({});     // dispute id -> true while the AI call runs
  const [approved, setApproved] = useState({});   // dispute id -> { mode, action, paypalStatus }


  const deepLinkHandled = useRef(false);
  const panelRef = useRef(null);
  const [notice, setNotice] = useState(null);
  // Load disputes once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await loadDisputes();
      if (cancelled) return;
      if (res.ok) {
        setCards(res.data.disputes.filter((item) => { return typeof item.analysis === 'object' && !Array.isArray(item.analysis) && item.analysis !== null && !item.title.startsWith("Something") }));
        setMode(res.data.mode);
      } else {
        setError(res.data?.error ?? 'Could not load disputes.');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);


  const refresh = useCallback(async () => {
    const res = await loadDisputes();
    if (res.ok) { setCards(res.data.disputes.filter((item) => { return typeof item.analysis === 'object' && !Array.isArray(item.analysis) && item.analysis !== null && !item.title.startsWith("Something") })); setMode(res.data.mode); }
    else setError(res.data?.error ?? 'Could not load disputes.');
    setLoading(false);
  }, []);

  // One place that asks the agent for a recommendation. The panel's button will call this too.
  const generate = useCallback(async (id, followUpAnswers) => {
    //console.log("hello");
    setBusyIds((p) => ({ ...p, [id]: true }));
    setRecErrors((p) => ({ ...p, [id]: null }));
    const res = await getRecommendation(id, followUpAnswers);
    if (res.ok) {
      setRecs((p) => ({ ...p, [id]: res.data.recommendation }));
    } else {
      const msg = res.data?.problems?.join(' ') ?? res.data?.error ?? 'Could not get a recommendation.';
      setRecErrors((p) => ({ ...p, [id]: msg }));
    }
    setBusyIds((p) => ({ ...p, [id]: false }));
  }, []);


  useEffect(() => {
    if (deepLinkHandled.current || loading || error) return;
    deepLinkHandled.current = true;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('dispute');
    //console.log(id);
    console.log(id);
    if (!id) return;

    // Clear the URL so a refresh doesn't trigger another AI call.
    window.history.replaceState({}, '', window.location.pathname);

    const card = cards.find((c) => c.id === id);
    if (!card) { setNotice(`Dispute ${id} was not found.`); return; }

    setSelectedId(id);
    const actionable = card.analysis.waitingOn === 'seller' && card.analysis.supported;
    if (params.get('generate') === '1' && actionable && !recs[id]) generate(id);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [loading, error, cards, recs, generate]);

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    const card = cards.find((c) => c.id === id);
    setSelectedCard(card);
    const actionable = card?.analysis.waitingOn === 'seller' && card?.analysis.supported;
    // In live mode a button will do this instead.
    if (mode === 'demo' && actionable && !recs[id] && !busyIds[id]) generate(id);
  }, [cards, mode, recs, busyIds, generate]);

  const handleApproved = useCallback((id, result) => {
    setApproved((p) => ({ ...p, [id]: { mode: result.mode, action: result.action, paypalStatus: result.paypalStatus } }));
    if (result.mode === 'live') refresh(); // pick up the dispute's new status from PayPal
  }, [refresh]);


  const handleContextSaved = useCallback((id, context) => {
    setCards((p) => p.map((c) => (c.id === id ? { ...c, context } : c)));
    setRecs((p) => { const next = { ...p }; delete next[id]; return next; });
  }, []);



  useEffect(() => { refresh(); }, [refresh]);

  const rows = useMemo(
    () => cards.map((c) => ({ ...c, rec: recs[c.id], approved: approved[c.id] })),
    [cards, recs, approved]
  );

  const stats = useMemo(() => {
    const mine = cards.filter((c) => c.analysis.waitingOn === 'seller');
    const days = mine.map((c) => c.analysis.daysLeft).filter((d) => d !== null && d !== undefined && d > 0);
    const cents = mine.reduce((sum, c) => sum + Math.round((c.analysis.disputeAmountValue ?? 0) * 100), 0);

    //console.log(cents)
    return {
      needAction: mine.length,
      total: cents / 100,
      currency: mine[0]?.analysis.currency ?? 'CAD', // sandbox data is single-currency
      nextDeadline: days.length ? Math.min(...days) : null,
    };
  }, [cards]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [loading]);

  const selected = cards.find((c) => c.id === selectedId);

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <header className="border-b-2 bg-[#002991]/20 shadow-xl" style={{ borderColor: BLUE }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: BLUE }}>Dispute Mediator</h1>
            <p className="text-xs text-slate-400">Fair, fast dispute resolution. Built on the PayPal sandbox.</p>
          </div>
          {mode === 'demo' && (
            <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-medium text-amber-300">
              Demo mode: sample data, nothing is sent to PayPal
            </span>
          )}
        </div>
      </header>
      { (
        <div className="mb-6 flex justify-center  text-sm text-slate-200">
          <div className="flex items-start justify-between border border-[#009CDE]/40 bg-[#009CDE]/10 p-4 gap-4">
            <div>
              <div className="font-semibold text-white">Judge's guide: 3 steps, no setup needed</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-left">
                <li>Click any dispute in the table. A saved agent recommendation appears below it.</li>
                <li>Read the reasoning, then edit the amount or note. Try an amount that is too high to see the safety check.</li>
                <li>Click Approve, then Confirm. In demo mode nothing is sent to PayPal, and the server still re-validates everything.</li>
              </ol>
              <p className="mt-2 text-xs text-slate-400">Sample disputes with saved AI answers. Live mode (real sandbox, real AI calls) is shown in the video and described in the README.</p>
            </div>
            <button type="button" onClick={() => setShowGuide(false)} aria-label="Dismiss guide" className="text-slate-400 hover:text-white">✕</button>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Needs your action" value={stats.needAction} accent={BLUE} />
          <StatTile label="Total at stake" value={money(stats.total, stats.currency)} accent="#86efac" />
          <StatTile
            label="Next deadline"
            value={stats.nextDeadline === null || stats.nextDeadline == -1 ? '—' : `${stats.nextDeadline} day${stats.nextDeadline === 1 ? '' : 's'}`}
            accent="#D0021B"
          />
          <StatTile label="Suggestions ready" value={Object.keys(recs).length} accent="#FFB800" />
        </div>

        <div className="mt-6">
          <div className="mb-2 flex justify-end text-xs text-slate-400">
            {mode === 'demo' ? 'Click a dispute to see the agent’s suggestion' : 'Click a dispute to open it'}
          </div>
          {loading && (
            <div className="py-10 text-center text-slate-400">
              <p>Loading disputes…</p>
              {slow && <p className="mt-2 text-sm text-slate-500">The demo runs on a free tier and may be waking up. This can take up to a minute.</p>}
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-lg bg-red-500/10 p-4 text-red-300">
              {error} Is the API running on port 3000?
            </div>
          )}
          {!loading && !error && cards.length === 0 && (
            <p className="py-10 text-center text-slate-400">No disputes found.</p>
          )}
          {rows.length > 0 && <DisputeGrid rows={rows} onSelect={handleSelect} />}
        </div>

        {selected && (
          <div className="mt-6">
            <RecommendationPanel
              key={selected.id}
              card={selected}
              ref={panelRef}
              rec={recs[selected.id]}
              busy={!!busyIds[selected.id]}
              error={recErrors[selected.id]}
              approved={approved[selected.id]}
              onGenerate={(answers) => generate(selected.id, answers)}
              onApproved={handleApproved}
              onContextSaved={handleContextSaved}
            />
          </div>
        )}
        {selected && (
          <section className="mt-6 rounded-lg bg-white/5 p-5">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            {busyIds[selected.id] && <p className="mt-2 text-slate-400">Asking the agent…</p>}
            {recErrors[selected.id] && <p className="mt-2 text-red-300">{recErrors[selected.id]}</p>}
            {recs[selected.id] && (
              <div className="mt-2 space-y-1">
                <p className="text-slate-300">
                  {ACTION_LABELS[recs[selected.id].action]} · {recSummary(recs[selected.id])}
                </p>
                <p className="text-sm text-slate-400">{recs[selected.id].reasoning}</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;