import React, { useEffect, useState } from 'react';
import AuthLayout, { Field, FormAlert } from '../components/AuthLayout';
import { verifyEmail, resendCode } from '../api/auth';

const RESEND_SECONDS = 60;

export default function VerifyEmail({ email, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // A code was just emailed, so the resend button starts on cooldown.
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
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    try {
      const { token, user } = await verifyEmail({ email, code });
      onVerified(token, user);
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
      await resendCode({ email });
      setInfo('A new code is on its way.');
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
      heroTitle="Check your inbox."
      heroText="We sent a 6-digit code to confirm this email address belongs to you."
      title="Verify your email"
      subtitle={`Enter the code we sent to ${email}. It expires in 10 minutes. Check your spam folder if you don't see it.`}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={error} />
        <FormAlert message={info} tone="success" />

        <Field
          id="verify-code"
          label="Verification code"
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
          <span>{loading ? 'Verifying…' : 'Verify email'}</span>
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
          {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="font-bold text-[#0d1424] hover:underline cursor-pointer"
        >
          Use a different email
        </button>
      </div>
    </AuthLayout>
  );
}
