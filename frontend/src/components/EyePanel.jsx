import { FiEye, FiMaximize2 } from 'react-icons/fi';

/** One eye's upload viewport, quality status and original/mapped toggle. */
export default function EyePanel({ title, inputId, scan, tagLabel, tagClass, referralFlagged = false, onUpload, onExpand }) {
  const { imageUrl, viewMode, quality, mask } = scan;
  const accepted = quality.status === 'accepted';

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  return (
    <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900">{title}</span>
          {accepted && (
            <div className="flex items-center bg-slate-200/80 border border-slate-300/80 rounded-xl p-0.5 text-[11px] font-bold shadow-2xs" role="group" aria-label={`${title} view`}>
              <button
                type="button"
                onClick={() => scan.setViewMode('original')}
                aria-pressed={viewMode === 'original'}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${viewMode === 'original' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => scan.setViewMode('mapped')}
                aria-pressed={viewMode === 'mapped'}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${viewMode === 'mapped' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600'}`}
              >
                Mapped
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 min-h-[24px] flex-wrap">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border transition-colors ${tagClass}`}>{tagLabel}</span>
          {referralFlagged && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[10px] font-extrabold uppercase" title="The most likely stage is lower, but the screening model's referral threshold was reached">
              Referral flagged
            </span>
          )}
          {accepted && quality.verdict === 'enhance' && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold uppercase">Poor lighting</span>
          )}
        </div>

        {quality.status === 'checking' && <p className="text-[11px] font-semibold text-slate-500" role="status">Checking image quality…</p>}
        {(quality.status === 'rejected' || quality.status === 'error') && (
          <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5" role="alert">
            {quality.reason || 'This image could not be checked.'}
          </p>
        )}
      </div>

      <div className="relative bg-[#0b1329] rounded-xl h-[380px] w-full flex flex-col items-center justify-center text-center border border-slate-800 shadow-inner overflow-hidden">
        <label className="absolute inset-0 z-30 cursor-pointer flex flex-col items-center justify-center focus-within:ring-2 focus-within:ring-amber-400">
          <span className="sr-only">Upload fundus image for {title}</span>
          <input id={inputId} type="file" accept="image/*" className="sr-only" onChange={handleChange} />
        </label>

        {imageUrl ? (
          <>
            <img src={imageUrl} alt={`${title} fundus scan`} className="absolute inset-0 w-full h-full object-contain z-10" />

            {viewMode === 'mapped' && mask.status === 'loading' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm pointer-events-none">
                <span className="text-white text-sm font-bold animate-pulse">Generating mask…</span>
              </div>
            )}
            {viewMode === 'mapped' && mask.status === 'error' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-rose-900/60 backdrop-blur-sm pointer-events-none p-4">
                <span className="text-rose-100 text-sm font-bold">Lesion mapping failed</span>
                <span className="text-rose-200 text-xs">{mask.error}</span>
              </div>
            )}
            {viewMode === 'mapped' && mask.status === 'success' && mask.url && (
              <img src={mask.url} alt={`${title} lesion mask`} className="absolute inset-0 w-full h-full object-contain z-20 opacity-85 pointer-events-none" />
            )}

            <button
              type="button"
              aria-label={`View ${title} fullscreen`}
              onClick={() => onExpand(imageUrl)}
              className="absolute top-3 right-3 z-40 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg transition cursor-pointer"
            >
              <FiMaximize2 className="text-sm" />
            </button>
          </>
        ) : (
          <div className="relative z-10 flex flex-col items-center pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400 text-3xl mb-3">
              <FiEye />
            </div>
            <span className="text-white font-semibold text-sm">Click to Upload Fundus Image</span>
          </div>
        )}
      </div>
    </div>
  );
}
