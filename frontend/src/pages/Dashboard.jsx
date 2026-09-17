import React, { useState, useRef } from 'react';
import { 
  FiGrid, FiUser, FiCalendar, FiActivity, FiBell, FiSettings, 
  FiArrowLeft, FiPlus, FiMinus, FiUpload, FiGlobe, FiEye, 
  FiCheck, FiX, FiFileText, FiShield
} from 'react-icons/fi';
import { translations } from '../translations';

export default function Dashboard({ user, onLogout, lang = 'en', setLang }) {
  const [activeLang, setActiveLang] = useState(lang);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState('G-2');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [activeTab, setActiveTab] = useState('overview');

  const [clinicalContext, setClinicalContext] = useState({
    age: 54,
    hba1c: '8.2',
    sysBP: '138',
    diaBP: '86',
    duration: '12'
  });

  const fileInputRef = useRef(null);
  const t = translations[activeLang] || translations.en;

  const handleLangChange = (newLang) => {
    setActiveLang(newLang);
    if (setLang) setLang(newLang);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(URL.createObjectURL(file));
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f8] text-slate-800 font-sans p-4 md:p-6 flex gap-6 select-none">
      
      {/* 1. FAR-LEFT FLOATING SIDEBAR NAVIGATION */}
      <aside className="hidden lg:flex flex-col items-center justify-between py-6 px-3 bg-white rounded-[2.5rem] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-slate-100 w-20 shrink-0">
        <div className="flex flex-col items-center gap-8">
          {/* Logo / Back Button */}
          <button 
            onClick={onLogout}
            className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 transition"
            title="Exit Workspace"
          >
            <FiArrowLeft className="text-xl" />
          </button>

          {/* Main Navigation Stack */}
          <nav className="flex flex-col gap-4">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition ${
                activeTab === 'overview' 
                  ? 'bg-amber-100 text-amber-900 font-bold shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FiGrid />
            </button>
            
            <button 
              onClick={() => setActiveTab('patient')}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition ${
                activeTab === 'patient' 
                  ? 'bg-amber-100 text-amber-900 font-bold shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FiUser />
            </button>

            <button 
              onClick={() => setActiveTab('calendar')}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition ${
                activeTab === 'calendar' 
                  ? 'bg-amber-100 text-amber-900 font-bold shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FiCalendar />
            </button>

            <button 
              onClick={() => setActiveTab('analytics')}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition ${
                activeTab === 'analytics' 
                  ? 'bg-amber-100 text-amber-900 font-bold shadow-sm' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FiActivity />
            </button>

            <button 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition relative"
            >
              <FiBell />
              <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-rose-500" />
            </button>
          </nav>
        </div>

        {/* Settings Button */}
        <button className="w-12 h-12 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 flex items-center justify-center text-lg transition">
          <FiSettings />
        </button>
      </aside>

      {/* MAIN DASHBOARD LAYOUT */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* 2. CENTER & LEFT CONTENT AREA */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          
          {/* Top Header Bar with Language Picker */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                {t.title} • {t.subtitle}
              </span>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                Retinal Assessment
              </h1>
            </div>

            {/* Language Switcher Pill */}
            <div className="flex items-center bg-white border border-slate-200/80 rounded-2xl p-1 shadow-sm text-xs font-semibold">
              <FiGlobe className="ml-3 mr-1 text-slate-400" />
              <button 
                onClick={() => handleLangChange('en')} 
                className={`px-3 py-1.5 rounded-xl transition ${activeLang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                EN
              </button>
              <button 
                onClick={() => handleLangChange('hi')} 
                className={`px-3 py-1.5 rounded-xl transition ${activeLang === 'hi' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                हिंदी
              </button>
              <button 
                onClick={() => handleLangChange('kn')} 
                className={`px-3 py-1.5 rounded-xl transition ${activeLang === 'kn' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                ಕನ್ನಡ
              </button>
            </div>
          </div>

          {/* Key Metrics Overview */}
          <div className="flex items-center gap-6">
            <div>
              <div className="text-5xl font-extrabold text-slate-900 tracking-tight">G-2</div>
              <div className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">Moderate NPDR Risk</div>
            </div>

            <div className="h-10 w-[1px] bg-slate-200" />

            {/* Quick Zoom Controls */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setZoomLevel(prev => Math.min(prev + 20, 200))}
                className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 text-slate-700 flex items-center justify-center shadow-sm hover:bg-slate-50 active:scale-95 transition"
              >
                <FiPlus />
              </button>
              <button 
                onClick={() => setZoomLevel(prev => Math.max(prev - 20, 100))}
                className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 text-slate-700 flex items-center justify-center shadow-sm hover:bg-slate-50 active:scale-95 transition"
              >
                <FiMinus />
              </button>
            </div>
          </div>

          {/* MAIN FUNDUS SCAN CARD (Centered Graphic Focus) */}
          <div className="relative bg-white rounded-[2.5rem] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden min-h-[320px]">
            
            {/* Background Anatomical Decorative Outline */}
            <div className="absolute -right-10 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
              <FiEye className="text-[320px] text-slate-900" />
            </div>

            {/* Floating Dark Card (Inspiration Style Overlay) */}
            <div className="bg-slate-900 text-white rounded-[2rem] p-6 shadow-2xl w-full md:w-72 shrink-0 z-10 flex flex-col justify-between h-72">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-amber-400 flex items-center justify-center">
                  <FiEye className="text-lg" />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-mono block uppercase">Confidence</span>
                  <span className="text-xl font-bold text-emerald-400">96.4%</span>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">Retinal Scan</h3>
                <p className="text-xs text-slate-400 mt-0.5">Fundus Image • Stage 01</p>
                
                {/* Micro Severity Indicator */}
                <div className="flex gap-1.5 mt-4">
                  {['G0', 'G1', 'G2', 'G3', 'G4'].map((g, idx) => (
                    <div 
                      key={g} 
                      className={`h-2 flex-1 rounded-full ${idx <= 2 ? 'bg-amber-400' : 'bg-slate-800'}`} 
                    />
                  ))}
                </div>
              </div>

              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2 border border-slate-700"
              >
                <FiUpload /> Change Image
              </button>
            </div>

            {/* Diagnostic Image Display Area */}
            <div className="w-full h-full flex flex-col items-center justify-center relative min-h-[260px] z-10">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />

              {!selectedImage ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-full border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-[2rem] p-8 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/50 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                    <FiUpload className="text-xl" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">{t.dropText}</p>
                  <p className="text-xs text-slate-400 mt-1 text-center">{t.stage1Sub}</p>
                </div>
              ) : (
                <div className="relative w-full h-64 rounded-[2rem] overflow-hidden flex items-center justify-center bg-slate-950 shadow-inner">
                  <img 
                    src={selectedImage} 
                    alt="Retina Fundus Scan" 
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-rose-600 transition"
                  >
                    <FiX />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RECENT ASSIGNMENTS / TESTS SECTION */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Tests & Context</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Test Card 1 - HbA1c */}
              <div className="bg-white rounded-[2rem] p-5 shadow-[0_10px_25px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                    HbA1c
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">Everyday</span>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-extrabold text-slate-900">{clinicalContext.hba1c}%</span>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Glycated Hemoglobin</p>
                </div>
              </div>

              {/* Test Card 2 - BP */}
              <div className="bg-white rounded-[2rem] p-5 shadow-[0_10px_25px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">
                    BP
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">28 Nov</span>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-extrabold text-slate-900">{clinicalContext.sysBP}/{clinicalContext.diaBP}</span>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Blood Pressure (mmHg)</p>
                </div>
              </div>

              {/* Test Card 3 - Duration */}
              <div className="bg-white rounded-[2rem] p-5 shadow-[0_10px_25px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xs">
                    DM
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">30 Nov</span>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-extrabold text-slate-900">{clinicalContext.duration} Yrs</span>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Diabetes History</p>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* 3. RIGHT PANEL - DISEASE HISTORY & TIMELINE */}
        <div className="xl:col-span-4 bg-white rounded-[2.5rem] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col gap-6">
          
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Patient Record</h2>
            <span className="text-xs font-semibold text-slate-400 font-mono">#DR-2026</span>
          </div>

          {/* Timeline Node 1 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 font-mono">Nov</span>
              <span className="text-2xl font-extrabold text-slate-900">24</span>
            </div>

            {/* Doctor Card */}
            <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3 border border-slate-100">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm">
                DV
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Dr. Alex Vance</h4>
                <p className="text-xs text-slate-400">Chief Ophthalmologist</p>
              </div>
            </div>

            {/* Clinical Indicators */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">Indicator</span>
                <span className="text-xs font-bold text-amber-900 mt-0.5 block">Microaneurysms</span>
              </div>
              <div className="bg-sky-50 border border-sky-100 rounded-2xl p-3">
                <span className="text-[10px] font-bold text-sky-800 uppercase block">Macula Status</span>
                <span className="text-xs font-bold text-sky-900 mt-0.5 block">Clear Center</span>
              </div>
            </div>
          </div>

          {/* Timeline Node 2 - Scans Grid */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 font-mono">Oct</span>
              <span className="text-2xl font-extrabold text-slate-900">28</span>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FiActivity className="text-amber-500" /> OCT Scans
                </span>
                <span className="text-[10px] text-slate-400 font-mono">4 Images</span>
              </div>

              {/* 2x2 Thumbnail Grid (Matching the Brain MRI style in image) */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="h-16 bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center text-slate-600 text-xs font-mono">
                  SCAN 01
                </div>
                <div className="h-16 bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center text-slate-600 text-xs font-mono">
                  SCAN 02
                </div>
              </div>
            </div>
          </div>

          {/* Final Action Button */}
          <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider mt-2">
            <FiFileText /> Export Diagnostic Report
          </button>

        </div>

      </div>
    </div>
  );
}