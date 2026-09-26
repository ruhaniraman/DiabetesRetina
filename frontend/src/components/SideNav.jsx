import { useTranslation } from 'react-i18next';
import { FiCheckSquare, FiHelpCircle, FiLogOut, FiMap } from 'react-icons/fi';
import Logo from './Logo';

const itemClass =
  'flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[10px] font-semibold leading-tight text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer w-full text-center';

/**
 * Floating navigation for the signed-in pages: a rail on the left from tablet width up, a bar along the bottom on phones.
 * The logo (a link home when `onHome` is given) comes first, then the actions; sign out is pinned to the bottom.
 * Pages using it leave room with `md:pl-28` (and `pb-28 md:pb-12` for the phone bar).
 */
export default function SideNav({ onHome, onOpenReview, onOpenDistrictPlanner, onStartTour, onLogout }) {
  const { t } = useTranslation();
  const logo = <Logo className="w-12 h-9" />;
  return (
    <nav
      aria-label={t('dash.navLabel')}
      className="fixed z-40 bottom-3 inset-x-3 flex flex-row items-stretch gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:w-20 md:flex-col md:p-2"
    >
      <div className="hidden md:flex items-center justify-center border-b border-slate-200 pb-3 pt-1.5 mb-1">
        {onHome ? (
          <button type="button" onClick={onHome} title={t('report.back')} aria-label={t('report.back')} className="rounded-lg p-1.5 hover:bg-slate-100 transition cursor-pointer">
            {logo}
          </button>
        ) : (
          <span className="p-1.5" aria-hidden="true">{logo}</span>
        )}
      </div>

      <div className="flex flex-1 flex-row gap-1 md:flex-none md:flex-col">
        {onOpenReview && (
          <button type="button" onClick={onOpenReview} data-tour="review-button" title="30-second specialist review" className={itemClass}>
            <FiCheckSquare className="text-lg text-sky-700" aria-hidden="true" />
            <span>Specialist review</span>
          </button>
        )}
        {onStartTour && (
          <button type="button" onClick={onStartTour} data-tour="replay" title={t('tour.replayTitle')} className={itemClass}>
            <FiHelpCircle className="text-lg text-sky-700" aria-hidden="true" />
            <span>{t('tour.replay')}</span>
          </button>
        )}
        {onOpenDistrictPlanner && (
          <button type="button" onClick={onOpenDistrictPlanner} data-tour="district-button" title="District Planner (Stage 5)" className={itemClass}>
            <FiMap className="text-lg text-sky-700" aria-hidden="true" />
            <span>District Planner</span>
          </button>
        )}
      </div>

      <div className="flex border-l border-slate-200 pl-1 md:mt-auto md:border-l-0 md:border-t md:pl-0 md:pt-2">
        <button type="button" onClick={onLogout} title={t('logout')} className={`${itemClass} hover:!bg-rose-50 hover:!text-rose-700`}>
          <FiLogOut className="text-lg" aria-hidden="true" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </nav>
  );
}
