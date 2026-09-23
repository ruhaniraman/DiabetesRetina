import { useTranslation } from 'react-i18next';
import { FiEye, FiMaximize2, FiUploadCloud } from 'react-icons/fi';
import { LESION_OVERLAY_ENABLED } from '../config';
import { useMessages } from '../messages';

/** One eye's upload viewport, quality status and original/mapped toggle. */
export default function EyePanel({ title, inputId, scan, tagLabel, tagClass, referralFlagged = false, overlayEnabled = LESION_OVERLAY_ENABLED, onUpload, onExpand }) {
  const { t } = useTranslation();
  const { tm } = useMessages();
  const { imageUrl, viewMode, quality, mask } = scan;
  const accepted = quality.status === 'accepted';

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 flex flex-col space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-[13px] text-amber-400">
              <FiEye aria-hidden="true" />
            </span>
            {title}
          </span>
          {accepted && overlayEnabled && (
            <div className="flex items-center bg-slate-200 border border-slate-300 rounded-xl p-0.5 text-[11px] font-bold shadow-2xs" role="group" aria-label={t('eye.viewGroup', { title })}>
              <button
                type="button"
                onClick={() => scan.setViewMode('original')}
                aria-pressed={viewMode === 'original'}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${viewMode === 'original' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
              >
                {t('eye.original')}
              </button>
              <button
                type="button"
                onClick={() => scan.setViewMode('mapped')}
                aria-pressed={viewMode === 'mapped'}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${viewMode === 'mapped' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600'}`}
              >
                {t('eye.mapped')}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 min-h-[24px] flex-wrap">
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${tagClass}`}>{tagLabel}</span>
          {referralFlagged && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[10px] font-extrabold uppercase" title={t('clinical.referralChipHint')}>
              {t('clinical.referralChipLabel')}
            </span>
          )}
          {accepted && quality.verdict === 'warn' && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold uppercase" title={tm(quality.reason)}>
              {t('eye.lowQuality')}
            </span>
          )}
        </div>

        {accepted && quality.verdict === 'warn' && (
          <p className="text-[11px] font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5" role="status">
            {tm(quality.reason)}
          </p>
        )}
        {quality.status === 'checking' && <p className="text-[11px] font-semibold text-slate-500" role="status">{t('eye.checking')}</p>}
        {(quality.status === 'rejected' || quality.status === 'error') && (
          <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5" role="alert">
            {tm(quality.reason) || t('eye.couldNotCheck')}
          </p>
        )}
      </div>

      <div className={`group relative bg-[radial-gradient(ellipse_at_center,#16223b_0%,#0b1329_70%)] rounded-2xl h-[320px] sm:h-[380px] w-full flex flex-col items-center justify-center text-center shadow-inner overflow-hidden transition ${imageUrl ? 'border border-slate-800' : 'border-2 border-dashed border-slate-600/70 hover:border-amber-400/80'}`}>
        <label className="absolute inset-0 z-30 cursor-pointer flex flex-col items-center justify-center focus-within:ring-2 focus-within:ring-amber-400">
          <span className="sr-only">{t('eye.uploadFor', { title })}</span>
          <input id={inputId} type="file" accept="image/*" className="sr-only" onChange={handleChange} />
        </label>

        {imageUrl ? (
          <>
            <img src={imageUrl} alt={t('eye.scanAlt', { title })} className="absolute inset-0 w-full h-full object-contain z-10" />

            {viewMode === 'mapped' && mask.status === 'loading' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm pointer-events-none">
                <span className="text-white text-sm font-bold animate-pulse">{t('eye.generating')}</span>
              </div>
            )}
            {viewMode === 'mapped' && mask.status === 'error' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-rose-900/60 backdrop-blur-sm pointer-events-none p-4">
                <span className="text-rose-100 text-sm font-bold">{t('eye.mappingFailed')}</span>
                <span className="text-rose-200 text-xs">{mask.error}</span>
              </div>
            )}
            {viewMode === 'mapped' && mask.status === 'success' && mask.url && (
              <img src={mask.url} alt={t('eye.maskAlt', { title })} className="absolute inset-0 w-full h-full object-contain z-20 opacity-85 pointer-events-none" />
            )}

            <button
              type="button"
              aria-label={t('eye.fullscreenFor', { title })}
              onClick={() => onExpand(imageUrl)}
              className="absolute top-3 right-3 z-40 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg transition cursor-pointer"
            >
              <FiMaximize2 className="text-sm" />
            </button>
          </>
        ) : (
          <div className="relative z-10 flex flex-col items-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-amber-400/10 ring-1 ring-amber-400/30 flex items-center justify-center text-amber-400 text-2xl mb-4 transition group-hover:scale-105 group-hover:bg-amber-400/15">
              <FiUploadCloud />
            </div>
            <span className="text-white font-semibold text-sm px-6">{t('eye.clickUpload')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
