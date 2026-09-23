import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

/**
 * Shared shell for Login, Signup and VerifyEmail so the hero panel,
 * animation styles and brand header live in one place.
 */
export default function AuthLayout({ heroTitle, heroText, title, subtitle, children }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#eceff4] flex items-center justify-center p-4 sm:p-6 font-sans">
      {/* Dynamic Moving Gradient Styles */}
      <style>{`
        @keyframes moveProminentGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes floatGlowLarge {
          0%, 100% { transform: translate(0px, 0px) scale(1); opacity: 0.7; }
          50% { transform: translate(35px, -35px) scale(1.3); opacity: 1; }
        }
        .vibrant-hero-bg {
          background: linear-gradient(-45deg, #0d1424, #1e293b, #b45309, #2563eb, #0f172a);
          background-size: 350% 350%;
          animation: moveProminentGradient 6s ease infinite;
        }
        .prominent-glow-1 { animation: floatGlowLarge 5s ease-in-out infinite; }
        .prominent-glow-2 { animation: floatGlowLarge 7s ease-in-out infinite reverse; }
        @media (prefers-reduced-motion: reduce) {
          .vibrant-hero-bg, .prominent-glow-1, .prominent-glow-2 { animation: none; }
        }
      `}</style>

      <div className="bg-white rounded-[32px] p-3 sm:p-4 shadow-xl max-w-4xl w-full flex flex-col md:flex-row gap-6 border border-gray-200/60">
        {/* Left Side: Animated Hero Panel */}
        <div className="vibrant-hero-bg w-full md:w-1/2 text-white rounded-[24px] p-8 sm:p-10 flex flex-col justify-start relative overflow-hidden min-h-[380px] md:min-h-[460px]">
          <div className="prominent-glow-1 absolute -bottom-10 -left-10 w-72 h-72 bg-amber-500/45 rounded-full blur-3xl pointer-events-none" />
          <div className="prominent-glow-2 absolute top-0 -right-10 w-64 h-64 bg-blue-500/35 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 pt-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white mb-4">
              {heroTitle}
            </h1>
            <p className="text-slate-200 text-sm sm:text-base font-medium max-w-xs drop-shadow-sm">
              {heroText}
            </p>
          </div>
        </div>

        {/* Right Side: Form Panel */}
        <div className="w-full md:w-1/2 p-4 sm:p-8 flex flex-col justify-center">
          <div className="flex justify-end mb-3">
            <LanguageSwitcher />
          </div>
          {/* Brand Header with Custom Eye Icon */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-11 h-11 bg-[#fef6e4] rounded-[16px] flex items-center justify-center flex-shrink-0 border border-[#fde4b8] shadow-sm">
              <svg
                className="w-6 h-6 text-[#b44300]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" strokeWidth="2.6" />
              </svg>
            </div>
            <div>
              <span className="text-2xl font-extrabold text-[#0d1424] tracking-tight block leading-none">
                {t('common.brand')}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 block mt-1.5">
                {t('common.portal')}
              </span>
            </div>
          </div>

          <h2 className="text-xl font-extrabold text-[#0d1424] mb-1">{title}</h2>
          <p className="text-xs text-slate-500 font-medium mb-6">{subtitle}</p>

          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Labelled input with inline error text. Password fields get a Show/Hide toggle.
 * Any extra props (value, onChange, placeholder, autoComplete...) go to the <input>.
 */
export function Field({ id, label, error, type = 'text', inputClassName = '', ...inputProps }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';

  const tone = error
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
    : 'border-slate-200/80 focus:border-[#0d1424] focus:ring-[#0d1424]';

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full px-4 py-3 rounded-xl border text-xs font-semibold text-[#0d1424] bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 transition-all ${tone} ${isPassword ? 'pr-16' : ''} ${inputClassName}`}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-[#0d1424] cursor-pointer"
          >
            {visible ? t('common.hide') : t('common.show')}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Form-level message (server errors, success info). */
export function FormAlert({ message, tone = 'error' }) {
  if (!message) return null;
  const styles =
    tone === 'error'
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`px-4 py-3 rounded-xl border text-xs font-semibold ${styles}`}>
      {message}
    </div>
  );
}
