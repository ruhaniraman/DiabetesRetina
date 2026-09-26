import { useTranslation } from 'react-i18next';
import { FiInfo } from 'react-icons/fi';

export default function Disclaimer({ className = '' }) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-start gap-2.5 rounded-lg bg-slate-50 px-4 py-3 border border-slate-200 ${className}`}>
      <FiInfo className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
      <p className="text-[11px] leading-relaxed text-slate-500 font-medium">{t('clinical.disclaimer')}</p>
    </div>
  );
}
