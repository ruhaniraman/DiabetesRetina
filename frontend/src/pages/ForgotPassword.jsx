import { useEffect, useState } from 'react';
import AuthLayout, { Field, FormAlert } from '../components/AuthLayout';
import { forgotPassword, resetPassword } from '../api/auth';
import { validateEmail, validatePassword } from '../utils/validation';

const RESEND_SECONDS = 60;

const submitClass =
  'w-full py-3.5 px-4 bg-[#0d1424] hover:bg-[#1a2744] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.99] mt-2 flex items-center justify-center gap-2 cursor-pointer';

/**
 * Two steps on one page: (1) enter your email, (2) enter the emailed code and a new password.
 * The server answers step 1 identically whether or not the account exists, so this page
 * never says whether an email is registered.
 */
export default function ForgotPassword({ onDone, onBackToLogin }) {
  const [step, setStep] = useState('email'); // 'email' | 'reset'
  const [email, setEmail] = useState('');
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

  const normalizedEmail = email.trim().toLowerCase();

  const requestCode = async (e) => {
    e?.preventDefault();
    if (loading) return;
    const emailError = validateEmail(email);
    setErrors({ email: emailError });
    setFormError('');
    if (emailError) return;

    setLoading(true);
    try {
      await forgotPassword({ email: normalizedEmail });
      setStep('reset');
      setInfo(`If an account exists for ${normalizedEmail}, we've sent it a 6-digit code. It expires in 10 minutes.`);
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
      await forgotPassword({ email: normalizedEmail });
      setInfo('If the account exists, a new code is on its way.');
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
      code: /^\d{6}$/.test(code) ? '' : 'Enter the 6-digit code from your email.',
      password: validatePassword(password),
      confirm: !confirm ? 'Please confirm your password.' : confirm !== password ? 'Passwords do not match.' : '',
    };
    setErrors(next);
    setFormError('');
    setInfo('');
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    try {
      await resetPassword({ email: normalizedEmail, code, password });
      onDone('Password updated. Sign in with your new password.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clear = (field) => setErrors((prev) => ({ ...prev, [field]: '' }));

  return (
    <AuthLayout
      heroTitle="Locked out? It happens."
      heroText="Reset your password with a one-time code sent to your email."
      title={step === 'email' ? 'Reset your password' : 'Choose a new password'}
      subtitle={
        step === 'email'
          ? "Enter your account email and we'll send you a 6-digit code."
          : 'Enter the code from your email and pick a new password.'
      }
    >
      {step === 'email' ? (
        <form onSubmit={requestCode} noValidate className="space-y-4">
          <FormAlert message={formError} />
          <Field
            id="forgot-email"
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clear('email');
              setFormError('');
            }}
            placeholder="doctor@retinarescue.com"
            error={errors.email}
          />
          <button type="submit" disabled={loading} className={submitClass}>
            <span>{loading ? 'Sending…' : 'Send code'}</span>
            {!loading && <span className="text-base">→</span>}
          </button>
        </form>
      ) : (
        <form onSubmit={submitReset} noValidate className="space-y-4">
          <FormAlert message={formError} />
          <FormAlert message={info} tone="success" />

          <Field
            id="reset-code"
            label="Reset code"
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
            error={errors.code}
          />
          <Field
            id="reset-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear('password');
              setFormError('');
            }}
            placeholder="At least 8 characters"
            error={errors.password}
          />
          <Field
            id="reset-confirm"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clear('confirm');
              setFormError('');
            }}
            placeholder="Repeat the password"
            error={errors.confirm}
          />
          <button type="submit" disabled={loading} className={submitClass}>
            <span>{loading ? 'Updating…' : 'Update password'}</span>
            {!loading && <span className="text-base">→</span>}
          </button>

          <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-2">
            <button
              type="button"
              onClick={resendCode}
              disabled={cooldown > 0 || loading}
              className="font-bold text-[#0d1424] hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setErrors({});
                setFormError('');
                setInfo('');
              }}
              className="font-bold text-[#0d1424] hover:underline cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      <p className="text-xs text-center text-slate-500 font-medium mt-6">
        Remembered it?{' '}
        <button type="button" onClick={onBackToLogin} className="font-bold text-[#0d1424] hover:underline cursor-pointer">
          Back to sign in
        </button>
      </p>
    </AuthLayout>
  );
}
