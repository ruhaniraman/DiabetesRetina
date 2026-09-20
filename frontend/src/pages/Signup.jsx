import React, { useState } from 'react';
import AuthLayout, { Field, FormAlert } from '../components/AuthLayout';
import { signup, ApiError } from '../api/auth';
import { validateName, validateEmail, validatePassword, passwordRules } from '../utils/validation';

export default function Signup({ onSignup, onGoToLogin }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setFormError('');
  };

  const validate = () => {
    const next = {
      fullName: validateName(form.fullName),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirmPassword: !form.confirmPassword
        ? 'Please confirm your password.'
        : form.password !== form.confirmPassword
        ? 'Passwords do not match.'
        : '',
    };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || !validate()) return;

    const email = form.email.trim().toLowerCase();
    setLoading(true);
    setFormError('');
    try {
      await signup({ fullName: form.fullName.trim(), email, password: form.password });
      onSignup(email); // go to the verification screen
    } catch (err) {
      // The server returns per-field errors, e.g. "account already exists" on the email field.
      if (err instanceof ApiError && err.data?.errors) {
        setErrors((prev) => ({ ...prev, ...err.data.errors }));
      } else {
        setFormError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      heroTitle="Join Retina Rescue Portal."
      heroText="Start monitoring retinal health with intelligent deep learning tools."
      title="Create Account"
      subtitle="Enter your details below to set up your account."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        <FormAlert message={formError} />

        <Field
          id="signup-name"
          label="Full Name"
          autoComplete="name"
          value={form.fullName}
          onChange={update('fullName')}
          placeholder="Dr. Alex Vance"
          error={errors.fullName}
        />

        <Field
          id="signup-email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update('email')}
          placeholder="doctor@retinarescue.com"
          error={errors.email}
        />

        <div>
          <Field
            id="signup-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            placeholder="••••••••"
            error={errors.password}
          />
          {form.password && (
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Password requirements">
              {passwordRules.map((rule) => {
                const met = rule.test(form.password);
                return (
                  <li
                    key={rule.id}
                    className={`text-[10px] font-bold flex items-center gap-1 ${met ? 'text-emerald-600' : 'text-slate-400'}`}
                  >
                    <span aria-hidden="true">{met ? '✓' : '○'}</span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Field
          id="signup-confirm"
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          placeholder="••••••••"
          error={errors.confirmPassword}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[#0d1424] hover:bg-[#1a2744] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.99] mt-3 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{loading ? 'Sending code…' : 'Get Started'}</span>
          {!loading && <span className="text-base">→</span>}
        </button>
      </form>

      <p className="text-xs text-center text-slate-500 font-medium mt-6">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onGoToLogin}
          className="font-bold text-[#0d1424] hover:underline cursor-pointer"
        >
          Sign In
        </button>
      </p>
    </AuthLayout>
  );
}
