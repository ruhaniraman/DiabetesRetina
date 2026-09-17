import React, { useState } from 'react';
import { FiUser, FiMail, FiLock, FiEye, FiArrowRight, FiShield, FiGlobe, FiBriefcase } from 'react-icons/fi';

export default function Signup({ onSignup, onSwitchToLogin, lang = 'en', setLang }) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'Ophthalmologist',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSignup) onSignup(formData);
  };

  return (
    <div className="min-h-screen bg-[#f4f5f8] text-slate-800 font-sans p-4 md:p-6 flex items-center justify-center relative select-none">
      
      {/* Top Right Language Switcher Pill */}
      <div className="absolute top-6 right-6 flex items-center bg-white border border-slate-200/80 rounded-2xl p-1 shadow-sm text-xs font-semibold">
        <FiGlobe className="ml-3 mr-1 text-slate-400" />
        <button 
          type="button"
          onClick={() => setLang && setLang('en')} 
          className={`px-3 py-1.5 rounded-xl transition ${lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
        >
          EN
        </button>
        <button 
          type="button"
          onClick={() => setLang && setLang('hi')} 
          className={`px-3 py-1.5 rounded-xl transition ${lang === 'hi' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
        >
          हिंदी
        </button>
        <button 
          type="button"
          onClick={() => setLang && setLang('kn')} 
          className={`px-3 py-1.5 rounded-xl transition ${lang === 'kn' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
        >
          ಕನ್ನಡ
        </button>
      </div>

      <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-8 md:p-10 shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-slate-100 relative overflow-hidden">
        {/* Background Decorative Graphic */}
        <div className="absolute -right-12 -bottom-12 opacity-5 pointer-events-none">
          <FiEye className="text-[280px] text-slate-900" />
        </div>

        {/* Header Branding */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-lg shadow-sm">
            <FiEye />
          </div>
          <div>
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block">RetinaRescue</span>
            <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
              <FiShield /> Clinical AI Suite v2.4
            </span>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Create Account</h1>
          <p className="text-xs font-medium text-slate-400 mt-1">Register for verified clinical practitioner access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name Input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Full Name</label>
            <div className="relative flex items-center">
              <FiUser className="absolute left-4 text-slate-400 text-base" />
              <input
                type="text"
                name="fullName"
                required
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Dr. Sarah Jenkins"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Email Input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Work Email</label>
            <div className="relative flex items-center">
              <FiMail className="absolute left-4 text-slate-400 text-base" />
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="sarah.jenkins@hospital.org"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Role Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Clinical Role</label>
            <div className="relative flex items-center">
              <FiBriefcase className="absolute left-4 text-slate-400 text-base" />
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:bg-white transition cursor-pointer"
              >
                <option value="Ophthalmologist">Ophthalmologist</option>
                <option value="Retinal Specialist">Retinal Specialist</option>
                <option value="General Practitioner">General Practitioner</option>
                <option value="Clinical Researcher">Clinical Researcher</option>
              </select>
            </div>
          </div>

          {/* Passwords */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative flex items-center">
                <FiLock className="absolute left-4 text-slate-400 text-base" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Confirm</label>
              <div className="relative flex items-center">
                <FiLock className="absolute left-4 text-slate-400 text-base" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider active:scale-[0.99]"
          >
            Create Account <FiArrowRight className="text-base" />
          </button>
        </form>

        {/* Switch Link */}
        <div className="mt-6 text-center text-xs text-slate-400 font-medium pt-4 border-t border-slate-100">
          Already registered?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-slate-900 font-extrabold hover:underline ml-1"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}