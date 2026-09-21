import { useState } from 'react';
import AuthLayout, { Field, FormAlert } from '../components/AuthLayout';
import { login } from '../api/auth';
import { validateEmail } from '../utils/validation';
import { LOGIN_HERO } from '../clinicalText';

export default function Login({ onLogin, onGoToSignup, onNeedsVerification, onForgotPassword, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const nextErrors = {
      email: validateEmail(email),
      password: password ? '' : 'Password is required.',
    };
    setErrors(nextErrors);
    setFormError('');
    if (nextErrors.email || nextErrors.password) return;

    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    try {
      const { user } = await login({ email: normalizedEmail, password });
      onLogin(user);
    } catch (err) {
      // Account exists but the email was never verified: send them to the code screen.
      if (err.data?.code === 'EMAIL_NOT_VERIFIED') {
        onNeedsVerification(err.data.email || normalizedEmail);
        return;
      }
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      heroTitle={<>Early detection <br />for preserving vision.</>}
      heroText={LOGIN_HERO.text}
      title="Welcome Back"
      subtitle={LOGIN_HERO.subtitle}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={notice} tone="success" />
        <FormAlert message={formError} />

        <Field
          id="login-email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((prev) => ({ ...prev, email: '' }));
            setFormError('');
          }}
          placeholder="doctor@retinarescue.com"
          error={errors.email}
        />

        <Field
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((prev) => ({ ...prev, password: '' }));
            setFormError('');
          }}
          placeholder="••••••••"
          error={errors.password}
        />

        <div className="text-right -mt-1">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs font-bold text-[#0d1424] hover:underline cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[#0d1424] hover:bg-[#1a2744] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.99] mt-2 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{loading ? 'Signing in…' : 'Sign In'}</span>
          {!loading && <span className="text-base">→</span>}
        </button>
      </form>

      <p className="text-xs text-center text-slate-500 font-medium mt-6">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onGoToSignup}
          className="font-bold text-[#0d1424] hover:underline cursor-pointer"
        >
          Sign Up
        </button>
      </p>
    </AuthLayout>
  );
}
