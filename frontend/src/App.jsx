import React, { useState, useRef, useEffect } from 'react';
import { 
  FiRotateCcw, FiFileText, FiCheckCircle, FiActivity, FiX, FiEye, FiGlobe 
} from 'react-icons/fi';

// Translation Dictionaries (EN, HI, KN)
const translations = {
  en: {
    title: "RetinaRescue",
    subtitle: "AI Clinical Screening Suite",
    overview: "Overview",
    telemetry: "Telemetry",
    gradCam: "Grad-CAM",
    simulink: "Simulink Stream",
    stage1Tag: "Stage 01 • Fundus Scan",
    stage1Title: "Retinal Scan",
    dropText: "Click or Drag Retinal Scan Here",
    stage1Sub: "Stage 1 Quality Gate & Auto-Calibration Active",
    calibrated: "IDRiD Calibrated",
    benchmarks: "Quick Verified Case Benchmarks",
    screeningBtn: "Screening Through AI Pipeline...",
    stage2Tag: "Stage 02 • Patient Context",
    stage2Title: "Clinical Indicators",
    ageLabel: "Patient Age",
    hba1cLabel: "HbA1c Level (%)",
    sysBpLabel: "Systolic BP (mmHg)",
    diaBpLabel: "Diastolic BP (mmHg)",
    durationLabel: "Diabetes Duration (Years)",
    reportBtn: "View Diagnostic Report →",
    workflowTag: "District Center Workflow (Simulink Stream)",
    workflowTarget: "Target: 100,000+ Patients / Year",
    rateLabel: "Acquisition Rate",
    bwLabel: "Bandwidth",
    tpLabel: "Throughput",
    revLabel: "Review Time"
  },
  hi: {
    title: "रेटीना रेस्क्यू",
    subtitle: "एआई नैदानिक स्क्रीनिंग सूट",
    overview: "अवलोकन",
    telemetry: "टेलीमेट्री",
    gradCam: "ग्रैड-कैम",
    simulink: "सिमुलिंक स्ट्रीम",
    stage1Tag: "चरण 01 • फंडस स्कैन",
    stage1Title: "नेत्र पटल (रेटिना) स्कैन",
    dropText: "यहाँ रेटिना स्कैन क्लिक करें या ड्रैग करें",
    stage1Sub: "चरण 1 गुणवत्ता द्वार एवं ऑटो-कैलिब्रेशन सक्रिय",
    calibrated: "IDRiD कैलिब्रेटेड",
    benchmarks: "त्वरित सत्यापित केस मानक",
    screeningBtn: "एआई पाइपलाइन द्वारा जांच जारी...",
    stage2Tag: "चरण 02 • रोगी विवरण",
    stage2Title: "नैदानिक संकेतक",
    ageLabel: "रोगी की आयु",
    hba1cLabel: "एचबीए1सी स्तर (%)",
    sysBpLabel: "सिस्टोलिक बीपी (mmHg)",
    diaBpLabel: "डायस्टोलिक बीपी (mmHg)",
    durationLabel: "मधुमेह की अवधि (वर्ष)",
    reportBtn: "नैदानिक रिपोर्ट देखें →",
    workflowTag: "जिला केंद्र कार्यप्रवाह (सिमुलिंक स्ट्रीम)",
    workflowTarget: "लक्ष्य: 100,000+ रोगी / वर्ष",
    rateLabel: "अधिग्रहण दर",
    bwLabel: "बैंडविड्थ",
    tpLabel: "थ्रूपुट",
    revLabel: "समीक्षा समय"
  },
  kn: {
    title: "ರೆಟಿನಾ ರೆಸ್ಕ್ಯೂ",
    subtitle: "ಎಐ ಕ್ಲಿನಿಕಲ್ ಸ್ಕ್ರೀನಿಂಗ್ ಸೂಟ್",
    overview: "ಅವಲೋಕನ",
    telemetry: "ಟೆಲಿಮೆಟ್ರಿ",
    gradCam: "ಗ್ರಾಡ್-ಕ್ಯಾಮ್",
    simulink: "ಸಿಮುಲಿಂಕ್ ಸ್ಟ್ರೀಮ್",
    stage1Tag: "ಹಂತ 01 • ಫಂಡಸ್ ಸ್ಕ್ಯಾನ್",
    stage1Title: "ರೆಟಿನಾ ಸ್ಕ್ಯಾನ್",
    dropText: "ಇಲ್ಲಿ ರೆಟಿನಾ ಸ್ಕ್ಯಾನ್ ಕ್ಲಿಕ್ ಮಾಡಿ ಅಥವಾ ಡ್ರಾಗ್ ಮಾಡಿ",
    stage1Sub: "ಹಂತ 1 ಗುಣಮಟ್ಟದ ಗೇಟ್ ಮತ್ತು ಸ್ವಯಂಚಾಲಿತ ಕ್ಯಾಲಿಬ್ರೇಷನ್ ಸಕ್ರಿಯವಾಗಿದೆ",
    calibrated: "IDRiD ಕ್ಯಾಲಿಬ್ರೇಟೆಡ್",
    benchmarks: "ತ್ವರಿತ ಪರಿಶೀಲಿಸಿದ ಮಾದರಿಗಳು",
    screeningBtn: "ಎಐ ಮೂಲಕ ತಪಾಸಣೆ ನಡೆಸಲಾಗುತ್ತಿದೆ...",
    stage2Tag: "ಹಂತ 02 • ರೋಗಿಯ ವಿವರಗಳು",
    stage2Title: "ಕ್ಲಿನಿಕಲ್ ಸೂಚಕಗಳು",
    ageLabel: "ರೋಗಿಯ ವಯಸ್ಸು",
    hba1cLabel: "HbA1c ಮಟ್ಟ (%)",
    sysBpLabel: "ಸಿಸ್ಟೊಲಿಕ್ ಬಿಪಿ (mmHg)",
    diaBpLabel: "ಡಯಾಸ್ಟೊಲಿಕ್ ಬಿಪಿ (mmHg)",
    durationLabel: "ಮಧುಮೇಹದ ಅವಧಿ (ವರ್ಷಗಳು)",
    reportBtn: "ರೋಗನಿರ್ಣಯದ ವರದಿ ವೀಕ್ಷಿಸಿ →",
    workflowTag: "ಜಿಲ್ಲಾ ಕೇಂದ್ರದ ಕಾರ್ಯಪ್ರವಾಹ (ಸಿಮುಲಿಂಕ್ ಸ್ಟ್ರೀಮ್)",
    workflowTarget: "ಗುರಿ: 100,000+ ರೋಗಿಗಳು / ವರ್ಷ",
    rateLabel: "ಸಂಗ್ರಹಣಾ ದರ",
    bwLabel: "ಬ್ಯಾಂಡ್‌ವಿಡ್ತ್",
    tpLabel: "ಥ್ರೂಪುಟ್",
    revLabel: "ಪರಿಶೀಲನಾ ಸಮಯ"
  }
};

// Glass Eyeball strictly contained within the eye socket via SVG clipPath
function LumisGlassEye({ onUploadClick, text }) {
  const eyeRef = useRef(null);
  const targetPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const [pupilPos, setPupilPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!eyeRef.current) return;
      const rect = eyeRef.current.getBoundingClientRect();
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;

      const dx = e.clientX - eyeCenterX;
      const dy = e.clientY - eyeCenterY;
      const angle = Math.atan2(dy, dx);
      
      const maxDistance = 14; 
      const distance = Math.min(Math.hypot(dx, dy), maxDistance);

      targetPos.current = {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance
      };
    };

    let animId;
    const updatePhysics = () => {
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.12;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.12;
      
      setPupilPos({ x: currentPos.current.x, y: currentPos.current.y });
      animId = requestAnimationFrame(updatePhysics);
    };

    window.addEventListener('mousemove', handleMouseMove);
    animId = requestAnimationFrame(updatePhysics);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div 
      ref={eyeRef}
      onClick={onUploadClick}
      className="relative w-full h-72 border border-white/25 bg-white/10 backdrop-blur-2xl rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/15 transition-all duration-300 group shadow-lg overflow-hidden"
    >
      <div className="absolute -top-10 -left-10 w-44 h-44 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -right-10 w-44 h-44 bg-pink-400/25 rounded-full blur-3xl pointer-events-none" />

      <svg className="w-32 h-32 filter drop-shadow-[0_8px_20px_rgba(15,23,42,0.4)] transition-transform duration-300 group-hover:scale-105" viewBox="0 0 100 100">
        <defs>
          <clipPath id="eyeSocketClip">
            <path d="M 8,50 Q 50,14 92,50 Q 50,86 8,50 Z" />
          </clipPath>

          <radialGradient id="lumisIris" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7DD3FC" />
            <stop offset="40%" stopColor="#38BDF8" />
            <stop offset="80%" stopColor="#1E40AF" />
            <stop offset="100%" stopColor="#0B132B" />
          </radialGradient>
        </defs>

        <path
          d="M 8,50 Q 50,14 92,50 Q 50,86 8,50 Z"
          fill="#FFFFFF"
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        <g clipPath="url(#eyeSocketClip)">
          <g style={{ transform: `translate(${pupilPos.x}px, ${pupilPos.y}px)` }}>
            <circle cx="50" cy="50" r="16" fill="url(#lumisIris)" />
            <circle cx="50" cy="50" r="11" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx="50" cy="50" r="7.5" fill="#0B132B" />
            <circle cx="45" cy="45" r="3" fill="#FFFFFF" opacity="0.95" />
            <circle cx="53" cy="53" r="1.5" fill="#FFFFFF" opacity="0.75" />
          </g>
        </g>

        <path
          d="M 8,50 Q 50,14 92,50 Q 50,86 8,50 Z"
          fill="none"
          stroke="rgba(255, 255, 255, 0.9)"
          strokeWidth="2"
        />
      </svg>

      <div className="mt-4 text-center z-10 px-4">
        <p className="text-xs font-bold uppercase tracking-widest text-white drop-shadow-sm group-hover:text-white transition-colors">
          {text.dropText}
        </p>
        <p className="text-[11px] text-white/70 mt-1 font-medium">{text.stage1Sub}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState('en'); // 'en', 'hi', 'kn'
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState('G-2');
  
  const [clinicalContext, setClinicalContext] = useState({
    age: 23,
    hba1c: 7.8,
    sysBP: 120,
    diaBP: 88,
    duration: 9
  });

  const fileInputRef = useRef(null);
  const t = translations[lang];

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(URL.createObjectURL(file));
    }
  };

  const presets = [
    { label: 'G-0', sub: 'Normal' },
    { label: 'G-1', sub: 'Mild' },
    { label: 'G-2', sub: 'Moderate' },
    { label: 'G-3', sub: 'Severe' },
    { label: 'G-4', sub: 'PDR' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#16243E] via-[#2B4C7E] to-[#E5889E] text-white font-sans p-4 md:p-8 relative overflow-hidden select-none">
      
      <div className="absolute top-0 left-[10%] w-[650px] h-[650px] bg-blue-600/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[10%] w-[600px] h-[600px] bg-pink-400/30 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-[40%] right-[30%] w-[400px] h-[400px] bg-rose-300/15 rounded-full blur-[120px] pointer-events-none" />

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Lumis Top Navigation Bar */}
      <header className="max-w-7xl mx-auto flex items-center justify-between mb-8 bg-white/10 backdrop-blur-2xl border border-white/20 p-4 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white text-slate-900 flex items-center justify-center font-bold text-lg shadow-md">
            <FiEye />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white drop-shadow-sm">
                {t.title}
              </span>
              <span className="text-[10px] bg-pink-500/25 text-pink-100 font-semibold px-2 py-0.5 rounded-full border border-pink-400/30">
                v2.4 Demo
              </span>
            </div>
            <p className="text-[11px] text-white/70 font-medium">{t.subtitle}</p>
          </div>
        </div>

        {/* Center Navigation Pill */}
        <div className="hidden md:flex items-center bg-white/10 backdrop-blur-md p-1 rounded-full border border-white/20 text-xs font-semibold">
          <button className="px-5 py-2 rounded-full bg-white text-slate-900 shadow-md font-bold">{t.overview}</button>
          <button className="px-5 py-2 rounded-full text-white/80 hover:text-white transition">{t.telemetry}</button>
          <button className="px-5 py-2 rounded-full text-white/80 hover:text-white transition">{t.gradCam}</button>
          <button className="px-5 py-2 rounded-full text-white/80 hover:text-white transition">{t.simulink}</button>
        </div>

        {/* Top Right Controls + Language Switcher (EN, HI, KN) */}
        <div className="flex items-center gap-3">
          
          <div className="flex items-center bg-white/15 border border-white/25 rounded-full p-1 text-xs font-bold shadow-sm">
            <FiGlobe className="ml-2.5 mr-1 text-white/80" />
            <button 
              onClick={() => setLang('en')} 
              className={`px-2.5 py-1 rounded-full transition ${lang === 'en' ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:text-white'}`}
            >
              EN
            </button>
            <button 
              onClick={() => setLang('hi')} 
              className={`px-2.5 py-1 rounded-full transition ${lang === 'hi' ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:text-white'}`}
            >
              हिंदी
            </button>
            <button 
              onClick={() => setLang('kn')} 
              className={`px-2.5 py-1 rounded-full transition ${lang === 'kn' ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:text-white'}`}
            >
              ಕನ್ನಡ
            </button>
          </div>

          <button onClick={() => setSelectedImage(null)} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white transition shadow-sm">
            <FiRotateCcw />
          </button>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* PANEL 1: RETINAL SCAN & QUALITY GATE */}
        <section className="lg:col-span-6 bg-white/10 backdrop-blur-2xl rounded-[2.3rem] p-7 border border-white/20 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-pink-200/90">{t.stage1Tag}</span>
                <h2 className="text-2.5xl font-bold text-white tracking-tight mt-0.5 drop-shadow-sm">{t.stage1Title}</h2>
              </div>
              <span className="bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 text-xs px-3.5 py-1 rounded-full font-semibold flex items-center gap-1.5 shadow-sm">
                <FiCheckCircle /> {t.calibrated}
              </span>
            </div>

            {!selectedImage ? (
              <LumisGlassEye onUploadClick={() => fileInputRef.current?.click()} text={t} />
            ) : (
              <div className="relative w-full h-72 bg-slate-950/80 backdrop-blur-xl rounded-3xl overflow-hidden flex items-center justify-center border border-white/20 group shadow-lg">
                <img src={selectedImage} alt="Retinal Fundus Scan" className="w-full h-full object-contain" />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-full border border-white/20 transition shadow-lg hover:scale-105"
                >
                  <FiX />
                </button>
              </div>
            )}

            <div className="mt-6">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70 block mb-3">
                {t.benchmarks}
              </span>
              <div className="grid grid-cols-5 gap-2.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setSelectedGrade(p.label)}
                    className={`py-2.5 rounded-2xl text-center border transition-all duration-300 ${
                      selectedGrade === p.label
                        ? 'bg-white text-slate-900 border-white shadow-lg scale-[1.03] font-bold'
                        : 'bg-white/10 text-white border-white/20 hover:bg-white/20 font-semibold'
                    }`}
                  >
                    <p className="text-xs font-bold">{p.label}</p>
                    <p className="text-[10px] opacity-75">{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button className="w-full mt-6 bg-white hover:bg-white/90 text-slate-900 text-xs font-bold uppercase tracking-widest py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition active:scale-[0.99]">
            <FiActivity className="text-base" /> {t.screeningBtn}
          </button>
        </section>

        {/* PANEL 2: PATIENT CLINICAL CONTEXT */}
        <section className="lg:col-span-6 bg-white/10 backdrop-blur-2xl rounded-[2.3rem] p-7 border border-white/20 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-pink-200/90">{t.stage2Tag}</span>
                <h2 className="text-2.5xl font-bold text-white tracking-tight mt-0.5 drop-shadow-sm">{t.stage2Title}</h2>
              </div>
              <span className="text-xs font-medium text-white/90 bg-white/10 px-3.5 py-1 rounded-full border border-white/20 shadow-sm">
                Multimodal EHR
              </span>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-white/10 rounded-2xl p-3.5 border border-white/20 shadow-sm focus-within:bg-white/15 transition">
                  <label className="block text-[11px] font-semibold text-white/70 mb-0.5">{t.ageLabel}</label>
                  <input
                    type="number"
                    value={clinicalContext.age}
                    onChange={(e) => setClinicalContext({ ...clinicalContext, age: e.target.value })}
                    className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none drop-shadow-sm"
                  />
                </div>
                <div className="bg-white/10 rounded-2xl p-3.5 border border-white/20 shadow-sm focus-within:bg-white/15 transition">
                  <label className="block text-[11px] font-semibold text-white/70 mb-0.5">{t.hba1cLabel}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={clinicalContext.hba1c}
                    onChange={(e) => setClinicalContext({ ...clinicalContext, hba1c: e.target.value })}
                    className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none drop-shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-white/10 rounded-2xl p-3.5 border border-white/20 shadow-sm focus-within:bg-white/15 transition">
                  <label className="block text-[11px] font-semibold text-white/70 mb-0.5">{t.sysBpLabel}</label>
                  <input
                    type="number"
                    value={clinicalContext.sysBP}
                    onChange={(e) => setClinicalContext({ ...clinicalContext, sysBP: e.target.value })}
                    className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none drop-shadow-sm"
                  />
                </div>
                <div className="bg-white/10 rounded-2xl p-3.5 border border-white/20 shadow-sm focus-within:bg-white/15 transition">
                  <label className="block text-[11px] font-semibold text-white/70 mb-0.5">{t.diaBpLabel}</label>
                  <input
                    type="number"
                    value={clinicalContext.diaBP}
                    onChange={(e) => setClinicalContext({ ...clinicalContext, diaBP: e.target.value })}
                    className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none drop-shadow-sm"
                  />
                </div>
              </div>

              <div className="bg-white/10 rounded-2xl p-3.5 border border-white/20 shadow-sm focus-within:bg-white/15 transition">
                <label className="block text-[11px] font-semibold text-white/70 mb-0.5">{t.durationLabel}</label>
                <input
                  type="number"
                  value={clinicalContext.duration}
                  onChange={(e) => setClinicalContext({ ...clinicalContext, duration: e.target.value })}
                  className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none drop-shadow-sm"
                />
              </div>
            </div>
          </div>

          <button className="w-full mt-6 bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-widest py-4 rounded-2xl border border-white/30 shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99]">
            <FiFileText className="text-base" /> {t.reportBtn}
          </button>
        </section>

        {/* BOTTOM SIMULINK STREAM BAR */}
        <section className="lg:col-span-12 bg-white/10 backdrop-blur-2xl rounded-3xl p-6 border border-white/20 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/70">{t.workflowTag}</span>
            <span className="text-xs font-bold text-white bg-white/10 px-3 py-1 rounded-full border border-white/20">{t.workflowTarget}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 p-4 rounded-2xl border border-white/15">
              <p className="text-[10px] text-white/70 font-semibold uppercase">{t.rateLabel}</p>
              <p className="text-2xl font-bold text-white mt-1 drop-shadow-sm">24 img/hr</p>
            </div>
            <div className="bg-white/10 p-4 rounded-2xl border border-white/15">
              <p className="text-[10px] text-white/70 font-semibold uppercase">{t.bwLabel}</p>
              <p className="text-2xl font-bold text-white mt-1 drop-shadow-sm">2.4 Mbps</p>
            </div>
            <div className="bg-white/10 p-4 rounded-2xl border border-white/15">
              <p className="text-[10px] text-white/70 font-semibold uppercase">{t.tpLabel}</p>
              <p className="text-2xl font-bold text-white mt-1 drop-shadow-sm">0.8s / img</p>
            </div>
            <div className="bg-white/10 p-4 rounded-2xl border border-white/15">
              <p className="text-[10px] text-white/70 font-semibold uppercase">{t.revLabel}</p>
              <p className="text-2xl font-bold text-emerald-300 mt-1 drop-shadow-sm">&lt; 30 sec</p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}