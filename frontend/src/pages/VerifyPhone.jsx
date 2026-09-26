import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthLayout, { Field, FormAlert } from '../components/AuthLayout';
import { verifyPhone, resendCode } from '../api/auth';
import { useMessages } from '../messages';

const RESEND_SECONDS = 60;

export default function VerifyPhone({ phone, onVerified, onBack }) {
  const { t } = useTranslation();
  const { tm } = useMessages();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // A code was just sent, so the resend button starts on cooldown.
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!/^\d{6}$/.test(code)) {
      setError(t('msg.code6'));
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    try {
      const { user } = await verifyPhone({ phone, code });
      onVerified(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    setInfo('');
    try {
      await resendCode({ phone });
      setInfo(t('verify.newCode'));
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err.message);
      if (err.data?.retryAfter) setCooldown(err.data.retryAfter);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      heroTitle={t('verify.heroTitle')}
      heroText={t('verify.heroText')}
      title={t('verify.title')}
      subtitle={t('verify.subtitle', { phone })}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={tm(error)} />
        <FormAlert message={info} tone="success" />

        <Field
          id="verify-code"
          label={t('verify.code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
          placeholder="123456"
          inputClassName="text-center !text-lg tracking-[0.5em]"
          autoFocus
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[#0d1424] hover:bg-[#1a2744] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.99] mt-2 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{loading ? t('verify.verifying') : t('verify.submit')}</span>
          {!loading && <span className="text-base">→</span>}
        </button>
      </form>

      <div className="flex items-center justify-between text-xs text-slate-500 font-medium mt-6">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="font-bold text-[#0d1424] hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
        >
          {cooldown > 0 ? t('verify.resendIn', { n: cooldown }) : resending ? t('verify.sending') : t('verify.resend')}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="font-bold text-[#0d1424] hover:underline cursor-pointer"
        >
          {t('verify.differentPhone')}
        </button>
      </div>
    </AuthLayout>
  );
}
