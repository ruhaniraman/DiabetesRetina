import React, { useState } from 'react';

export default function Login({ onLogin, onGoToSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin();
  };

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
        .prominent-glow-1 {
          animation: floatGlowLarge 5s ease-in-out infinite;
        }
        .prominent-glow-2 {
          animation: floatGlowLarge 7s ease-in-out infinite reverse;
        }
      `}</style>

      <div className="bg-white rounded-[32px] p-3 sm:p-4 shadow-xl max-w-4xl w-full flex flex-col md:flex-row gap-6 border border-gray-200/60">
        
        {/* Left Side: Animated Hero Panel */}
        <div className="vibrant-hero-bg w-full md:w-1/2 text-white rounded-[24px] p-8 sm:p-10 flex flex-col justify-start relative overflow-hidden min-h-[380px] md:min-h-[460px]">
          
          <div className="prominent-glow-1 absolute -bottom-10 -left-10 w-72 h-72 bg-amber-500/45 rounded-full blur-3xl pointer-events-none" />
          <div className="prominent-glow-2 absolute top-0 -right-10 w-64 h-64 bg-blue-500/35 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 pt-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white mb-4">
              Early detection <br />for preserving vision.
            </h1>
            <p className="text-slate-200 text-sm sm:text-base font-medium max-w-xs drop-shadow-sm">
              AI-powered retinal screening & diagnostic biomarker analytics.
            </p>
          </div>
        </div>

        {/* Right Side: Form Panel */}
        <div className="w-full md:w-1/2 p-4 sm:p-8 flex flex-col justify-center">
          
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
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" strokeWidth="2.6" />
              </svg>
            </div>
            <div>
              <span className="text-2xl font-extrabold text-[#0d1424] tracking-tight block leading-none">
                Retina Rescue
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 block mt-1.5">
                Personal Health Portal
              </span>
            </div>
          </div>

          <h2 className="text-xl font-extrabold text-[#0d1424] mb-1">Welcome Back</h2>
          <p className="text-xs text-slate-500 font-medium mb-6">Sign in to access your clinical dashboard & reports.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@retinarescue.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200/80 text-xs font-semibold text-[#0d1424] bg-slate-50/70 focus:bg-white focus:outline-none focus:border-[#0d1424] focus:ring-1 focus:ring-[#0d1424] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200/80 text-xs font-semibold text-[#0d1424] bg-slate-50/70 focus:bg-white focus:outline-none focus:border-[#0d1424] focus:ring-1 focus:ring-[#0d1424] transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-[#0d1424] hover:bg-[#1a2744] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.99] mt-2 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Sign In</span>
              <span className="text-base">→</span>
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
        </div>

      </div>
    </div>
  );
}