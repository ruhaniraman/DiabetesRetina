import React, { useState, useEffect, useRef } from 'react';
import { 
  FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiGlobe 
} from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { FaHospitalUser } from 'react-icons/fa';

// --- TRANSLATION DICTIONARY ---
const TRANSLATIONS = {
  en: {
    title: "Welcome Back!",
    subtitle: "Enter your practitioner credentials to access clinical tools",
    emailLabel: "Email Address",
    emailPlaceholder: "doctor@hospital.org",
    passwordLabel: "Password",
    rememberMe: "Remember me",
    forgotPassword: "Forgot Password?",
    loginBtn: "Log In",
    googleSso: "Google SSO",
    hospitalPortal: "Hospital Portal",
    or: "OR",
    noAccount: "Don't have an account?",
    signUp: "Sign up"
  },
  hi: {
    title: "वापसी पर स्वागत है!",
    subtitle: "नैदानिक उपकरणों तक पहुंचने के लिए अपनी साख दर्ज करें",
    emailLabel: "ईमेल पता",
    emailPlaceholder: "doctor@hospital.org",
    passwordLabel: "पासवर्ड",
    rememberMe: "मुझे याद रखें",
    forgotPassword: "पासवर्ड भूल गए?",
    loginBtn: "लॉग इन करें",
    googleSso: "गूगल एसएसओ",
    hospitalPortal: "अस्पताल पोर्टल",
    or: "या",
    noAccount: "क्या आपका खाता नहीं है?",
    signUp: "साइन अप करें"
  },
  kn: {
    title: "ಮತ್ತೆ ಸ್ವಾಗತ!",
    subtitle: "ಕ್ಲಿನಿಕಲ್ ಪರಿಕರಗಳನ್ನು ಪ್ರವೇಶಿಸಲು ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ",
    emailLabel: "ಇಮೇಲ್ ವಿಳಾಸ",
    emailPlaceholder: "doctor@hospital.org",
    passwordLabel: "ಪಾಸ್‌ವರ್ಡ್",
    rememberMe: "ನನ್ನನ್ನು ನೆನಪಿಡಿ",
    forgotPassword: "ಪಾಸ್‌ವರ್ಡ್ ಮರೆತಿದ್ದೀರಾ?",
    loginBtn: "ಲಾಗಿನ್ ಮಾಡಿ",
    googleSso: "ಗೂಗಲ್ SSO",
    hospitalPortal: "ಆಸ್ಪತ್ರೆ ಪೋರ್ಟಲ್",
    or: "ಅಥವಾ",
    noAccount: "ಖಾತೆ ಇಲ್ಲವೇ?",
    signUp: "ಸೈನ್ ಅಪ್ ಮಾಡಿ"
  }
};

// --- UNIFORM TRACKING EYE COMPONENT ---
function UniformEye({ mousePos }) {
  const eyeRef = useRef(null);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!eyeRef.current || !mousePos.x) return;

    const rect = eyeRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = mousePos.x - centerX;
    const dy = mousePos.y - centerY;

    const angle = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);

    const maxTravel = 11;
    const travel = Math.min(dist / 12, maxTravel);

    setPupil({
      x: Math.cos(angle) * travel,
      y: Math.sin(angle) * travel,
    });
  }, [mousePos]);

  return (
    <div 
      ref={eyeRef} 
      className="relative w-28 h-16 flex items-center justify-center shrink-0"
    >
      <svg viewBox="0 0 100 55" className="w-full h-full drop-shadow-sm">
        <path 
          d="M 4 27.5 Q 50 1 96 27.5 Q 50 54 4 27.5 Z" 
          fill="#f5efe0" 
        />
      </svg>

      <div 
        className="absolute w-10 h-10 rounded-full bg-[#0a0f1d] flex items-center justify-center transition-transform duration-75 ease-out"
        style={{ transform: `translate(${pupil.x}px, ${pupil.y}px)` }}
      >
        <div className="w-2 h-2 rounded-full bg-white absolute top-1.5 right-2 opacity-90" />
      </div>
    </div>
  );
}

// --- FULL PANEL EYE WALLPAPER ---
function EyePatternWallpaperPanel() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const rows = [
    { id: 'r1', offset: true },
    { id: 'r2', offset: false },
    { id: 'r3', offset: true },
    { id: 'r4', offset: false },
    { id: 'r5', offset: true },
    { id: 'r6', offset: false },
  ];

  return (
    <div className="w-full md:w-5/12 bg-[#1d4ed8] rounded-[2rem] relative overflow-hidden flex items-center justify-center min-h-[420px] md:min-h-full cursor-pointer select-none">
      <div className="w-[135%] flex flex-col gap-6 py-4 justify-center items-center">
        {rows.map((row) => (
          <div 
            key={row.id}
            className={`flex justify-center gap-6 w-full ${
              row.offset ? '-translate-x-14' : 'translate-x-0'
            }`}
          >
            {[...Array(4)].map((_, i) => (
              <UniformEye key={i} mousePos={mousePos} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MAIN LOGIN PAGE ---
export default function Login({ onLogin, onSwitchToSignup, lang: externalLang, setLang: externalSetLang }) {
  // Internal language state fallback if external prop is not supplied
  const [internalLang, setInternalLang] = useState('en');
  const currentLang = externalLang || internalLang;

  const handleLangChange = (newLang) => {
    if (externalSetLang) {
      externalSetLang(newLang);
    } else {
      setInternalLang(newLang);
    }
  };

  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onLogin) onLogin({ email, password });
  };

  return (
    <div className="min-h-screen bg-[#f4f5f8] text-slate-800 font-sans p-4 md:p-8 flex items-center justify-center select-none">
      
      {/* MAIN CONTAINER */}
      <div className="w-full max-w-4xl bg-slate-200/50 rounded-[2.5rem] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-white/80 flex flex-col md:flex-row overflow-hidden min-h-[580px]">
        
        {/* LEFT PANEL: FULL PATTERN TRACKING EYE WALLPAPER */}
        <EyePatternWallpaperPanel />

        {/* RIGHT PANEL: FORM AREA */}
        <div className="w-full md:w-7/12 bg-white rounded-[2rem] p-8 md:p-10 flex flex-col justify-between relative shadow-sm">
          
          {/* Top Bar Language Selector */}
          <div className="flex justify-end items-center">
            <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-1 text-xs font-semibold">
              <FiGlobe className="ml-2 mr-1 text-slate-400" />
              <button 
                type="button"
                onClick={() => handleLangChange('en')} 
                className={`px-2.5 py-1 rounded-xl transition ${currentLang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                EN
              </button>
              <button 
                type="button"
                onClick={() => handleLangChange('hi')} 
                className={`px-2.5 py-1 rounded-xl transition ${currentLang === 'hi' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                हिंदी
              </button>
              <button 
                type="button"
                onClick={() => handleLangChange('kn')} 
                className={`px-2.5 py-1 rounded-xl transition ${currentLang === 'kn' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                ಕನ್ನಡ
              </button>
            </div>
          </div>

          {/* Header Title */}
          <div className="my-4">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight text-center md:text-left">
              {t.title}
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1 text-center md:text-left">
              {t.subtitle}
            </p>
          </div>

          {/* Social SSO Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <button 
              type="button"
              className="flex items-center justify-center gap-2 border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              <FcGoogle className="text-base" /> {t.googleSso}
            </button>
            <button 
              type="button"
              className="flex items-center justify-center gap-2 border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              <FaHospitalUser className="text-base text-sky-600" /> {t.hospitalPortal}
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-slate-100 w-full" />
            <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest absolute">
              — {t.or} —
            </span>
          </div>

          {/* Main Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                {t.emailLabel}
              </label>
              <div className="relative flex items-center">
                <FiMail className="absolute left-4 text-slate-400 text-base" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                {t.passwordLabel}
              </label>
              <div className="relative flex items-center">
                <FiLock className="absolute left-4 text-slate-400 text-base" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-11 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 text-slate-400 hover:text-slate-600 transition text-base"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-500 font-medium">
                <input 
                  type="checkbox" 
                  className="rounded-lg border-slate-200 text-slate-900 focus:ring-blue-600 accent-slate-900" 
                />
                {t.rememberMe}
              </label>
              <button type="button" className="text-blue-700 hover:text-blue-800 font-bold">
                {t.forgotPassword}
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider active:scale-[0.99] mt-2"
            >
              {t.loginBtn} <FiArrowRight className="text-base" />
            </button>
          </form>

          {/* Switch Link */}
          <div className="mt-6 text-center text-xs text-slate-400 font-medium">
            {t.noAccount}{' '}
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-slate-900 font-extrabold hover:underline ml-1"
            >
              {t.signUp}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}