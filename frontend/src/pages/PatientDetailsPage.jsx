import { useState } from 'react';
import { FiUser, FiActivity, FiClock, FiArrowRight, FiEye, FiCalendar, FiDroplet } from 'react-icons/fi';

const inputClass =
  'w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pr-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition';
const labelClass = 'text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];

function Field({ id, label, icon: Icon, children }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <div className="relative flex items-center">
        {Icon && <Icon className="absolute left-3.5 text-slate-400 text-sm" aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}

/** onSubmit(profile) and onErase() are async and throw on failure; this page shows the message. */
export default function PatientDetailsPage({ initialData, onSubmit, onErase, onCancel }) {
  const [form, setForm] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const bind = (name) => ({
    id: `patient-${name}`,
    value: form[name],
    onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  const describe = (err) => {
    const fieldErrors = Object.values(err.data?.errors || {});
    return fieldErrors.length ? `${err.message} ${fieldErrors.join(' ')}` : err.message;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit({ ...form, fullName: form.fullName.trim() });
    } catch (err) {
      setError(describe(err));
      setSaving(false);
    }
  };

  const handleErase = async () => {
    const sure = window.confirm(
      'Permanently delete your saved profile and ALL of your exam history from the server? This cannot be undone.',
    );
    if (!sure) return;
    setError('');
    try {
      await onErase();
    } catch (err) {
      setError(describe(err));
    }
  };

  const withIcon = `${inputClass} pl-10`;
  const plain = `${inputClass} pl-3.5`;

  return (
    <div className="min-h-screen bg-[#f1f3f7] flex items-center justify-center p-4 font-sans">
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 max-w-lg w-full shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
            <FiEye />
          </div>
          <div>
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase block">RETINARESCUE • CLINICAL ONBOARDING</span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Patient Clinical Profile</h1>
          </div>
        </div>

        <p className="text-xs text-slate-500 font-medium mb-6">
          Your details are stored encrypted on the server so they are here next time you sign in, alongside your exam results.
          Retinal photos are never stored. You can delete everything at any time from this page.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-xs font-semibold">{error}</div>
          )}

          <Field id="patient-fullName" label="Full Name" icon={FiUser}>
            <input type="text" required minLength={2} autoComplete="name" placeholder="Full name" className={withIcon} {...bind('fullName')} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="patient-dob" label="Date of Birth" icon={FiCalendar}>
              <input type="date" required max={today} min="1900-01-01" className={`${withIcon} cursor-pointer`} {...bind('dob')} />
            </Field>
            <Field id="patient-gender" label="Gender">
              <select required className={`${plain} cursor-pointer`} {...bind('gender')}>
                <option value="" disabled>Select…</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="patient-bloodGroup" label="Blood Group" icon={FiDroplet}>
              <select required className={`${withIcon} cursor-pointer`} {...bind('bloodGroup')}>
                <option value="" disabled>Select…</option>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field id="patient-diabetesDuration" label="Diabetes Duration (Yrs)" icon={FiClock}>
              <input type="number" required min="0" max="90" step="1" placeholder="e.g. 12" className={withIcon} {...bind('diabetesDuration')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="patient-systolicBP" label="Systolic BP (mmHg)" icon={FiActivity}>
              <input type="number" required min="60" max="260" placeholder="e.g. 130" className={withIcon} {...bind('systolicBP')} />
            </Field>
            <Field id="patient-diastolicBP" label="Diastolic BP (mmHg)">
              <input type="number" required min="30" max="160" placeholder="e.g. 85" className={plain} {...bind('diastolicBP')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="patient-hba1c" label="HbA1c (%)">
              <input type="number" required min="3" max="20" step="0.1" placeholder="e.g. 7.2" className={plain} {...bind('hba1c')} />
            </Field>
            <Field id="patient-fastingSugar" label="Fasting Sugar (mg/dL)">
              <input type="number" required min="30" max="700" placeholder="e.g. 110" className={plain} {...bind('fastingSugar')} />
            </Field>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-6 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer active:scale-[0.99]"
          >
            <span>{saving ? 'Saving…' : 'Save Profile & Open Dashboard'}</span>
            {!saving && <FiArrowRight className="text-base" />}
          </button>

          <button type="button" onClick={onCancel} className="w-full text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer">
            Cancel
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <h2 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider mb-1">Your data</h2>
          <p className="text-[11px] text-slate-500 font-medium mb-3">
            Removes your saved profile and every saved exam from the server. Your account stays.
          </p>
          <button
            type="button"
            onClick={handleErase}
            className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition cursor-pointer"
          >
            Delete my health data
          </button>
        </div>
      </div>
    </div>
  );
}
