import { FiArrowLeft, FiCheckCircle, FiAlertCircle, FiXCircle } from 'react-icons/fi';
import HeroBand, { cardClass } from '../components/HeroBand';
import Logo from '../components/Logo';
import evidence from '../data/evidence.json';

/*
 * Evidence: each problem-statement requirement with the result measured for it and the report it comes from. The rows are generated
 * from the committed validation results by validation/export_evidence.py (a test fails when they are stale), so nothing here is typed
 * in by hand. English only (for reviewers and judges).
 */

const STAGES = {
  1: 'Stage 1 · Image quality',
  2: 'Stage 2 · Structures and lesions',
  3: 'Stage 3 · DR grading',
  4: 'Stage 4 · Explainability',
  5: 'Stage 5 · District deployment (Simulink)',
  V: 'Validation against benchmarks',
};
const STATUS = {
  met: { label: 'Met', icon: FiCheckCircle, cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  partial: { label: 'Partly met', icon: FiAlertCircle, cls: 'bg-amber-50 text-amber-900 border-amber-200' },
  gap: { label: 'Not met', icon: FiXCircle, cls: 'bg-rose-50 text-rose-800 border-rose-200' },
};

export default function EvidencePage({ onBack, rows = evidence }) {
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const stages = Object.keys(STAGES).filter((s) => rows.some((r) => String(r.stage) === s));

  return (
    <div className="min-h-screen bg-[#eef1f6] text-slate-800 font-sans antialiased">
      <HeroBand className="pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-lg shadow-black/20 shrink-0">
                <Logo className="w-8 h-6" />
              </div>
              <span className="text-lg font-extrabold tracking-tight text-white">Evidence</span>
            </div>
            <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 cursor-pointer">
              <FiArrowLeft aria-hidden="true" /> Back
            </button>
          </header>
          <div className="pt-4 max-w-3xl">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-400/90">SIH26038 · problem statement vs measured results</span>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white">What each requirement asked for, and what we measured</h1>
            <p className="mt-2 text-sm text-slate-300">
              Every number comes from a validation report in the repository, on photographs the models never trained on. Where a target is only partly met,
              the row says why.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
              {Object.entries(STATUS).map(([key, s]) => (
                <span key={key} className={`rounded-full border px-3 py-1 ${s.cls}`}>
                  {counts[key] || 0} {s.label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </HeroBand>

      <main className="relative -mt-16 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-5">
        {stages.map((stage) => (
          <section key={stage} className={`${cardClass} p-5 space-y-3`} aria-label={STAGES[stage]}>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">{STAGES[stage]}</h2>
            <ul className="divide-y divide-slate-100">
              {rows
                .filter((r) => String(r.stage) === stage)
                .map((r) => {
                  const s = STATUS[r.status] || STATUS.partial;
                  const Icon = s.icon;
                  return (
                    <li key={r.requirement} className="py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto] gap-2 md:gap-5 items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{r.requirement}</p>
                        <p className="text-[11px] text-slate-500">Target: {r.target}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-700">{r.result}</p>
                        <p className="text-[11px] font-mono text-slate-400">{r.source}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${s.cls}`}>
                        <Icon aria-hidden="true" /> {s.label}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
