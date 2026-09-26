import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FiDownload, FiLoader, FiTrash2 } from 'react-icons/fi';
import { downloadExamReport } from '../api/patient';
import { saveBlob } from '../utils/download';
import { bannerConfig } from '../utils/drStyles';
import { useMessages } from '../messages';
import { changeFromPrevious } from '../utils/examChange';

const VISIBLE = 5;

const CHANGE_STYLE = { higher: 'bg-rose-50 text-rose-800 border-rose-200', lower: 'bg-sky-50 text-sky-800 border-sky-200', same: 'bg-slate-100 text-slate-600 border-slate-200' };

const formatWhen = (ms, lang) =>
  new Date(ms).toLocaleString(lang && lang !== 'en' ? lang : undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ExamHistory({ history }) {
  const { t, i18n } = useTranslation();
  const { stage } = useMessages();
  const lang = i18n.resolvedLanguage || 'en';
  const { status, exams, remove, reportPendingFor } = history;
  const [downloading, setDownloading] = useState(null);
  const [downloadError, setDownloadError] = useState('');

  const handleDownload = async (exam) => {
    setDownloading(exam.id);
    setDownloadError('');
    try {
      const blob = await downloadExamReport(exam.id);
      saveBlob(blob, `retina-rescue-report-${new Date(exam.createdAt).toISOString().slice(0, 10)}.pdf`);
    } catch {
      setDownloadError(t('history.downloadFailed'));
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (exam) => {
    if (!window.confirm(t('history.confirmDelete', { when: formatWhen(exam.createdAt, lang) }))) return;
    try {
      await remove(exam.id);
    } catch {
      window.alert(t('history.deleteFailed'));
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
      <h4 className="text-[11px] font-semibold text-slate-900 uppercase tracking-wider mb-4">{t('history.title')}</h4>

      {status === 'loading' && <p className="text-[11px] text-slate-500 font-medium">{t('history.loading')}</p>}
      {status === 'error' && exams.length === 0 && (
        <p className="text-[11px] text-rose-700 font-medium" role="alert">{t('history.loadError')}</p>
      )}
      {status === 'ready' && exams.length === 0 && <p className="text-[11px] text-slate-500 font-medium">{t('history.none')}</p>}

      {exams.length > 0 && (
        <ul className="relative ml-1.5 pl-4 border-l-2 border-slate-200 space-y-4">
          {exams.slice(0, VISIBLE).map((exam, i) => {
            const bannerKey = bannerConfig[exam.overallRisk] ? exam.overallRisk : 'Pending';
            const banner = bannerConfig[bannerKey];
            return (
              <li key={exam.id} className="relative group">
                <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full ring-4 ring-slate-50 ${i === 0 ? banner.badge : 'bg-slate-300'}`}></div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {exam.hasReport ? (
                      <button
                        type="button"
                        onClick={() => handleDownload(exam)}
                        disabled={downloading === exam.id}
                        title={t('history.download')}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-900 hover:text-sky-700 hover:underline disabled:opacity-60 cursor-pointer"
                      >
                        {formatWhen(exam.createdAt, lang)}
                        {downloading === exam.id ? <FiLoader className="animate-spin text-sky-700" aria-hidden="true" /> : <FiDownload className="text-sky-700" aria-hidden="true" />}
                        <span className="sr-only">{t('history.download')}</span>
                      </button>
                    ) : (
                      <p className="text-xs font-bold text-slate-900">{formatWhen(exam.createdAt, lang)}</p>
                    )}
                    <p className="text-[11px] text-slate-500 font-medium">
                      <span className={`inline-block px-2 py-0.5 mr-1.5 rounded-full text-[9px] font-bold uppercase text-white ${banner.badge}`}>{t(`clinical.banner.${bannerKey}.badge`)}</span>
                      OS {stage(exam.leftGrade)} · OD {stage(exam.rightGrade)}
                    </p>
                    {!exam.hasReport && (
                      <p className="text-[10px] text-slate-400">{reportPendingFor === exam.id ? t('history.preparing') : t('history.noReport')}</p>
                    )}
                    {(() => {
                      const change = changeFromPrevious(exam, exams[i + 1]);
                      return change ? (
                        <span className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${CHANGE_STYLE[change]}`}>{t(`history.${change}`)}</span>
                      ) : null;
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(exam)}
                    aria-label={t('history.deleteAria', { when: formatWhen(exam.createdAt, lang) })}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                  >
                    <FiTrash2 className="text-sm" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {downloadError && <p role="alert" className="text-[11px] text-rose-700 font-medium mt-3">{downloadError}</p>}
      {exams.length > VISIBLE && <p className="text-[11px] text-slate-500 font-medium mt-3">{t('history.more', { n: exams.length - VISIBLE })}</p>}
    </div>
  );
}
