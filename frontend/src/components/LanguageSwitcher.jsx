import { useTranslation } from 'react-i18next';
import { FiGlobe } from 'react-icons/fi';
import { LANGUAGES } from '../languages';

/** The language buttons. Every page shows one, so the language can be changed wherever the person is. */
export default function LanguageSwitcher({ className = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'en';
  return (
    <div
      className={`inline-flex items-center bg-white border border-slate-200/90 rounded-xl p-1 text-xs font-semibold shadow-2xs ${className}`}
      role="group"
      aria-label={t('common.language')}
    >
      <FiGlobe className="ml-2 mr-1.5 text-slate-400" aria-hidden="true" />
      {LANGUAGES.map(({ code, label, name }) => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          aria-pressed={lang === code}
          title={name}
          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${lang === code ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
