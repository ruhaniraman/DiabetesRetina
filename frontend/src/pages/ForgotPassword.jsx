import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthLayout, { Field, FormAlert } from '../components/AuthLayout';
import { forgotPassword, resetPassword } from '../api/auth';
import { normalizePhone, validatePhone, validatePassword } from '../utils/validation';
import { useMessages } from '../messages';

const RESEND_SECONDS = 60;

const submitClass =
  'w-full py-3.5 px-4 bg-[#0d1424] hover:bg-[#1a2744] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.99] mt-2 flex items-center justify-center gap-2 cursor-pointer';

/**
 * Two steps on one page: (1) enter your phone, (2) enter the code sent by SMS and a new password.
 * The server answers step 1 identically whether or not the account exists, so this page
 * never says whether a number is registered.
 */
export default function ForgotPassword({ onDone, onBackToLogin }) {
  const { t } = useTranslation();
  const { tm } = useMessages();
  const [step, setStep] = useState('phone'); // 'phone' | 'reset'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const normalizedPhone = normalizePhone(phone);

  const requestCode = async (e) => {
    e?.preventDefault();
    if (loading) return;
    const phoneError = validatePhone(phone);
    setErrors({ phone: phoneError });
    setFormError('');
    if (phoneError) return;

    setLoading(true);
    try {
      await forgotPassword({ phone: normalizedPhone });
      setStep('reset');
      setInfo(t('forgot.sent', { phone: normalizedPhone }));
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setFormError('');
    try {
      await forgotPassword({ phone: normalizedPhone });
      setInfo(t('forgot.resent'));
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (loading) return;
    const next = {
      code: /^\d{6}$/.test(code) ? '' : 'Enter the 6-digit code sent to your phone.',
      password: validatePassword(password),
      confirm: !confirm ? 'Please confirm your password.' : confirm !== password ? 'Passwords do not match.' : '',
    };
    setErrors(next);
    setFormError('');
    setInfo('');
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    try {
      await resetPassword({ phone: normalizedPhone, code, password });
      onDone(t('forgot.done'));
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clear = (field) => setErrors((prev) => ({ ...prev, [field]: '' }));

  return (
    <AuthLayout
      heroTitle={t('forgot.heroTitle')}
      heroText={t('forgot.heroText')}
      title={step === 'phone' ? t('forgot.titlePhone') : t('forgot.titleReset')}
      subtitle={
        step === 'phone'
          ? t('forgot.subtitlePhone')
          : t('forgot.subtitleReset')
      }
    >
      {step === 'phone' ? (
        <form onSubmit={requestCode} noValidate className="space-y-4">
          <FormAlert message={tm(formError)} />
          <Field
            id="forgot-phone"
            label={t('forgot.phone')}
            type="tel"
            autoComplete="tel"
            autoFocus
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              clear('phone');
              setFormError('');
            }}
            placeholder="98765 43210"
            error={tm(errors.phone)}
          />
          <button type="submit" disabled={loading} className={submitClass}>
            <span>{loading ? t('forgot.sending') : t('forgot.send')}</span>
            {!loading && <span className="text-base">→</span>}
          </button>
        </form>
      ) : (
        <form onSubmit={submitReset} noValidate className="space-y-4">
          <FormAlert message={tm(formError)} />
          <FormAlert message={info} tone="success" />

          <Field
            id="reset-code"
            label={t('forgot.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              clear('code');
              setFormError('');
            }}
            placeholder="123456"
            inputClassName="text-center !text-lg tracking-[0.5em]"
            error={tm(errors.code)}
          />
          <Field
            id="reset-password"
            label={t('forgot.newPassword')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear('password');
              setFormError('');
            }}
            placeholder={t('forgot.newPasswordHint')}
            error={tm(errors.password)}
          />
          <Field
            id="reset-confirm"
            label={t('forgot.confirm')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clear('confirm');
              setFormError('');
            }}
            placeholder={t('forgot.confirmHint')}
            error={tm(errors.confirm)}
          />
          <button type="submit" disabled={loading} className={submitClass}>
            <span>{loading ? t('forgot.updating') : t('forgot.update')}</span>
            {!loading && <span className="text-base">→</span>}
          </button>

          <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-2">
            <button
              type="button"
              onClick={resendCode}
              disabled={cooldown > 0 || loading}
              className="font-bold text-[#0d1424] hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
            >
              {cooldown > 0 ? t('forgot.resendIn', { n: cooldown }) : t('forgot.resend')}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setErrors({});
                setFormError('');
                setInfo('');
              }}
              className="font-bold text-[#0d1424] hover:underline cursor-pointer"
            >
              {t('forgot.differentPhone')}
            </button>
          </div>
        </form>
      )}

      <p className="text-xs text-center text-slate-500 font-medium mt-6">
        {t('forgot.remembered')}{' '}
        <button type="button" onClick={onBackToLogin} className="font-bold text-[#0d1424] hover:underline cursor-pointer">
          {t('forgot.back')}
        </button>
      </p>
    </AuthLayout>
  );
}
