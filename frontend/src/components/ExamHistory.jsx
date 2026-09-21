import { FiTrash2 } from 'react-icons/fi';
import { bannerConfig } from '../utils/drStyles';

const VISIBLE = 5;

const formatWhen = (ms) =>
  new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// "Stage 2 - Moderate" -> "Stage 2"
const shortGrade = (label) => label.split(' - ')[0];

export default function ExamHistory({ history }) {
  const { status, exams, remove } = history;

  const handleDelete = async (exam) => {
    if (!window.confirm(`Delete the exam from ${formatWhen(exam.createdAt)}? This cannot be undone.`)) return;
    try {
      await remove(exam.id);
    } catch {
      window.alert('The exam could not be deleted. Please try again.');
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200/70 p-4 rounded-xl shadow-2xs">
      <h4 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider mb-3">Exam History</h4>

      {status === 'loading' && <p className="text-[11px] text-slate-500 font-medium">Loading…</p>}
      {status === 'error' && exams.length === 0 && (
        <p className="text-[11px] text-rose-700 font-medium" role="alert">Your exam history could not be loaded.</p>
      )}
      {status === 'ready' && exams.length === 0 && <p className="text-[11px] text-slate-500 font-medium">No exams recorded yet.</p>}

      {exams.length > 0 && (
        <ul className="relative pl-3 border-l-2 border-slate-200 space-y-3.5">
          {exams.slice(0, VISIBLE).map((exam, i) => {
            const banner = bannerConfig[exam.overallRisk] || bannerConfig.Pending;
            return (
              <li key={exam.id} className="relative group">
                <div className={`absolute -left-[17px] top-1 w-2 h-2 rounded-full ring-2 ring-white ${i === 0 ? 'bg-slate-900' : 'bg-slate-300'}`}></div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">{formatWhen(exam.createdAt)}</p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      <span className={`inline-block px-1.5 py-px mr-1.5 rounded text-[9px] font-black uppercase text-white ${banner.badge}`}>{banner.badgeText}</span>
                      OS {shortGrade(exam.leftGrade)} · OD {shortGrade(exam.rightGrade)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(exam)}
                    aria-label={`Delete exam from ${formatWhen(exam.createdAt)}`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                  >
                    <FiTrash2 className="text-sm" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {exams.length > VISIBLE && <p className="text-[11px] text-slate-500 font-medium mt-3">+ {exams.length - VISIBLE} earlier exam(s)</p>}
    </div>
  );
}
