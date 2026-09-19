import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  FiEye, FiUploadCloud, FiGlobe, 
  FiAlertTriangle, FiLogOut, FiRefreshCw, 
  FiPlay, FiArrowRight, FiUser, FiCalendar,
  FiCheckCircle, FiShield, FiActivity,
  FiZap, FiMaximize2
} from 'react-icons/fi';
import Logo from '../components/Logo';

// Helper function to translate dynamic clinical descriptions via FastAPI
async function translateDynamicText(text, targetLang) {
  if (targetLang === 'en' || !text) return text;
  try {
    const res = await fetch('http://localhost:5000/api/translate-dynamic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang })
    });
    if (!res.ok) throw new Error('Backend failed');
    const data = await res.json();
    return data.translatedText || text;
  } catch (err) {
    console.warn("FastAPI translation server offline, showing original text:", err);
    return text;
  }
}

export default function Dashboard({ onLogout, onViewDetailedReport, onScheduleConsultation }) {
  const { t, i18n } = useTranslation();

  const patientName = "Jane Doe";

  const rawClinicalNote = "Moderate signs detected in Left Eye (OS). Right Eye (OD) is clear. Keep blood sugar controlled and schedule a consultation.";
  const [translatedClinicalNote, setTranslatedClinicalNote] = useState(rawClinicalNote);
  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);

  const [leftEye, setLeftEye] = useState({ stage: 'Stage 2 - Moderate', accuracy: '96.4%', status: 'completed' });
  const [rightEye, setRightEye] = useState({ stage: 'Stage 0 - Clear', accuracy: '98.1%', status: 'completed' });

  useEffect(() => {
    let isMounted = true;
    translateDynamicText(rawClinicalNote, i18n.language).then(translated => {
      if (isMounted) setTranslatedClinicalNote(translated);
    });
    return () => { isMounted = false; };
  }, [i18n.language]);

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
  };

  const runSequentialPipeline = () => {
    if (isProcessingPipeline) return;
    setIsProcessingPipeline(true);
    setLeftEye(prev => ({ ...prev, status: 'processing' }));
    setRightEye(prev => ({ ...prev, status: 'queued' }));

    setTimeout(() => {
      setLeftEye(prev => ({ ...prev, status: 'completed' }));
      setRightEye(prev => ({ ...prev, status: 'processing' }));
      setTimeout(() => {
        setRightEye(prev => ({ ...prev, status: 'completed' }));
        setIsProcessingPipeline(false);
      }, 2000);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 font-['Plus_Jakarta_Sans',sans-serif] p-4 sm:p-6 lg:p-8 select-none max-w-7xl mx-auto antialiased">
      <main className="flex flex-col gap-6">
        
        {/* ================= 1. HEADER BAR ================= */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1 px-1">
          
          {/* Logo & Larger Aligned Greeting */}
          <div className="flex items-center gap-4">
            {/* Clickable Logo -> Redirects to Sign In */}
            <button 
              onClick={onLogout}
              title="Return to Sign In"
              className="p-3 bg-slate-900 hover:bg-slate-800 rounded-2xl shadow-sm text-white flex items-center justify-center shrink-0 transition cursor-pointer hover:scale-105 active:scale-95"
            >
              <Logo />
            </button>

            <div className="flex items-center">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-['Outfit',sans-serif] font-bold text-slate-900 tracking-tight leading-none">
                Welcome, {patientName}
              </h1>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {/* Language Switcher */}
            <div className="flex items-center bg-white border border-slate-200/90 rounded-xl p-1 text-xs font-semibold shadow-2xs">
              <FiGlobe className="ml-2 mr-1.5 text-slate-400" />
              <button 
                type="button"
                onClick={() => handleLanguageChange('en')} 
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${i18n.language === 'en' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                EN
              </button>
              <button 
                type="button"
                onClick={() => handleLanguageChange('hi')} 
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${i18n.language === 'hi' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                हिंदी
              </button>
              <button 
                type="button"
                onClick={() => handleLanguageChange('kn')} 
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${i18n.language === 'kn' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                ಕನ್ನಡ
              </button>
            </div>

            {/* Logout Button */}
            <button 
              onClick={onLogout}
              title="Logout"
              className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/90 bg-white shadow-2xs transition cursor-pointer"
            >
              <FiLogOut className="text-base" />
            </button>
          </div>
        </header>

        {/* ================= 2. RISK ASSESSMENT BANNER ================= */}
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-white bg-white border border-amber-200/90 border-l-4 border-l-amber-500 rounded-2xl p-5 md:p-6 shadow-xs">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            
            <div className="flex items-start gap-4">
              <div className="relative shrink-0 mt-0.5">
                <div className="absolute -inset-1 rounded-xl bg-amber-500/20 animate-pulse"></div>
                <div className="relative p-3 bg-amber-500 text-white rounded-xl shadow-sm flex items-center justify-center">
                  <FiAlertTriangle className="text-2xl" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-2xs">
                    Stage 2 Risk
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100/90 text-amber-900 border border-amber-200">
                    Moderate Progression
                  </span>
                  <span className="text-xs text-slate-400 hidden sm:inline">•</span>
                  <span className="text-xs text-slate-500 font-medium hidden sm:inline">AI Bilateral Screening</span>
                </div>

                <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">
                  Overall Assessment: Stage 2 – Moderate Risk
                </h2>

                <p className="text-xs md:text-sm text-slate-600 leading-relaxed max-w-3xl font-medium">
                  {translatedClinicalNote}
                </p>

                <div className="pt-1 flex flex-wrap gap-2 text-slate-700">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold bg-slate-100/90 border border-slate-200/80 px-2.5 py-1 rounded-lg">
                    <FiCheckCircle className="text-amber-600" />
                    <span>Left Eye (OS): Moderate Signs</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold bg-slate-100/90 border border-slate-200/80 px-2.5 py-1 rounded-lg">
                    <FiCheckCircle className="text-emerald-600" />
                    <span>Right Eye (OD): Clear</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold bg-amber-100/60 border border-amber-200/80 px-2.5 py-1 rounded-lg text-amber-900">
                    <span>Monitor Blood Sugar</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-amber-200/60 flex items-center justify-end">
              <button 
                onClick={onScheduleConsultation}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer group hover:shadow-md"
              >
                <FiCalendar className="text-amber-400 text-sm" />
                <span>Schedule Consultation</span>
                <FiArrowRight className="text-sm transition-transform group-hover:translate-x-1" />
              </button>
            </div>

          </div>

          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
        </div>

        {/* ================= 3. MAIN DASHBOARD CONTENT GRID ================= */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          
          {/* ------------ LEFT MAIN PANEL: RETINAL EXAM ------------ */}
          <div className="flex-1 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-6">
            
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-200/60 text-amber-600">
                    <FiEye className="text-base" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base tracking-tight">
                    {t('dualCardTitle', 'Bilateral Retinal Examination (OS / OD)')}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {t('dualCardSub', 'Oculus Sinister (Left Eye) & Oculus Dexter (Right Eye)')}
                </p>
              </div>

              <button 
                onClick={runSequentialPipeline}
                disabled={isProcessingPipeline}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs ${
                  isProcessingPipeline 
                    ? 'bg-amber-100 text-amber-900 border border-amber-200' 
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                {isProcessingPipeline ? (
                  <>
                    <FiRefreshCw className="animate-spin text-sm" />
                    <span>{t('processingPipeline', 'Processing Pipeline...')}</span>
                  </>
                ) : (
                  <>
                    <FiPlay className="text-xs fill-current text-amber-400" />
                    <span>{t('processAllBtn', 'Run AI Assessment')}</span>
                  </>
                )}
              </button>
            </div>

            {/* Scan Viewports Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
              
              {/* ---------- LEFT EYE VIEWPORT ---------- */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-slate-300 transition">
                
                {/* Header Info */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{t('leftEyeLabel', 'Left Eye (OS)')}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Bilateral Scan A</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-lg border border-amber-200">
                    {leftEye.stage}
                  </span>
                </div>

                {/* Fundus Diagnostic HUD Box */}
                <div className="relative bg-[#0b1329] rounded-xl p-5 min-h-[230px] flex flex-col items-center justify-center text-center border border-slate-800 shadow-inner group overflow-hidden">
                  
                  {/* Subtle Grid Reticle Effect */}
                  <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none"></div>
                  
                  {/* Status Overlay Tag */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700/80 text-[10px] text-slate-300 font-medium backdrop-blur-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>ANALYZED</span>
                  </div>

                  <div className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition cursor-pointer">
                    <FiMaximize2 className="text-xs" />
                  </div>

                  {/* Icon & Details */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-2xl mb-3 backdrop-blur-xs group-hover:scale-105 transition">
                      <FiEye />
                    </div>
                    
                    <span className="text-white font-semibold text-xs tracking-wide">
                      {t('originalFundus', 'Original Fundus Image')}
                    </span>

                    {/* Accuracy Badge */}
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                      <FiZap className="text-xs" />
                      <span>Accuracy: {leftEye.accuracy}</span>
                    </div>
                  </div>

                </div>

                {/* Upload Trigger */}
                <button className="w-full bg-white hover:bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200/90 transition cursor-pointer shadow-2xs">
                  <FiUploadCloud className="text-sm text-slate-400" />
                  <span>{t('replaceBtn', 'Replace Photo')}</span>
                </button>
              </div>

              {/* ---------- RIGHT EYE VIEWPORT ---------- */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-slate-300 transition">
                
                {/* Header Info */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{t('rightEyeLabel', 'Right Eye (OD)')}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Bilateral Scan B</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-900 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {rightEye.stage}
                  </span>
                </div>

                {/* Fundus Diagnostic HUD Box */}
                <div className="relative bg-[#0b1329] rounded-xl p-5 min-h-[230px] flex flex-col items-center justify-center text-center border border-slate-800 shadow-inner group overflow-hidden">
                  
                  {/* Subtle Grid Reticle Effect */}
                  <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none"></div>
                  
                  {/* Status Overlay Tag */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700/80 text-[10px] text-slate-300 font-medium backdrop-blur-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>CLEAR</span>
                  </div>

                  <div className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition cursor-pointer">
                    <FiMaximize2 className="text-xs" />
                  </div>

                  {/* Icon & Details */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-2xl mb-3 backdrop-blur-xs group-hover:scale-105 transition">
                      <FiEye />
                    </div>
                    
                    <span className="text-white font-semibold text-xs tracking-wide">
                      {t('originalFundus', 'Original Fundus Image')}
                    </span>

                    {/* Accuracy Badge */}
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                      <FiZap className="text-xs" />
                      <span>Accuracy: {rightEye.accuracy}</span>
                    </div>
                  </div>

                </div>

                {/* Upload Trigger */}
                <button className="w-full bg-white hover:bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200/90 transition cursor-pointer shadow-2xs">
                  <FiUploadCloud className="text-sm text-slate-400" />
                  <span>{t('replaceBtn', 'Replace Photo')}</span>
                </button>
              </div>

            </div>
          </div>

          {/* ------------ RIGHT SIDEBAR: HEALTH RECORD ------------ */}
          <aside className="w-full lg:w-96 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col justify-between shrink-0 shadow-xs space-y-6">
            
            <div className="space-y-5">
              
              {/* Header & Patient Card */}
              <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">{t('recordsTitle', 'My Health Record')}</h2>
                  <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80">
                    {t('bloodGroup', 'Blood Group: A+')}
                  </span>
                </div>

                <div className="flex items-center gap-3.5 bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/70">
                  <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center text-base shrink-0 shadow-2xs font-bold">
                    <FiUser />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{patientName}</p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      54 Yrs • Female • DOB: 12 May 1972
                    </p>
                  </div>
                </div>
              </div>

              {/* Eye Specialist Info */}
              <div className="flex items-center gap-3.5 bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                  AV
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-blue-900/60 uppercase tracking-wider block">{t('assignedDoctorLabel', 'YOUR EYE SPECIALIST')}</span>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">Dr. Alex Vance</p>
                  <p className="text-[11px] text-slate-500 font-medium">Chief Ophthalmologist</p>
                </div>
              </div>

              {/* Ocular Vitals */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    {t('vitalsTitle', 'OCULAR VITALS & BASELINE')}
                  </span>
                  <FiActivity className="text-xs text-slate-400" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/70 text-center">
                    <span className="text-[10px] font-bold text-slate-400 block">{t('upperBp', 'Upper BP')}</span>
                    <span className="text-xs font-extrabold text-slate-900 block mt-0.5">120 <span className="text-[10px] font-normal text-slate-500">mmHg</span></span>
                    <span className="text-[10px] font-bold text-emerald-600 block mt-0.5">{t('normal', 'Normal')}</span>
                  </div>

                  <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/70 text-center">
                    <span className="text-[10px] font-bold text-slate-400 block">{t('lowerBp', 'Lower BP')}</span>
                    <span className="text-xs font-extrabold text-slate-900 block mt-0.5">80 <span className="text-[10px] font-normal text-slate-500">mmHg</span></span>
                    <span className="text-[10px] font-bold text-emerald-600 block mt-0.5">{t('normal', 'Normal')}</span>
                  </div>

                  <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/70 text-center">
                    <span className="text-[10px] font-bold text-slate-400 block">{t('hba1c', 'HbA1c')}</span>
                    <span className="text-xs font-extrabold text-slate-900 block mt-0.5">5.8%</span>
                    <span className="text-[10px] font-bold text-emerald-600 block mt-0.5">{t('optimal', 'Optimal')}</span>
                  </div>
                </div>
              </div>

              {/* Key Diagnostic Findings */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/70">
                  <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wide block">{t('indicatorLabel', 'KEY FINDINGS')}</span>
                  <p className="text-xs font-bold text-amber-950 mt-1">{t('indicatorVal', 'Minor Spots (OS)')}</p>
                </div>

                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/70">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wide block">{t('maculaLabel', 'CENTER VISION')}</span>
                  <p className="text-xs font-bold text-emerald-950 mt-1">{t('maculaVal', 'Clear & Healthy')}</p>
                </div>
              </div>

            </div>

            {/* Bottom CTA Button */}
            <button 
              onClick={onViewDetailedReport}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-xs transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer mt-4"
            >
              <span>{t('detailedReportBtn', 'Detailed Report')}</span>
              <FiArrowRight className="text-sm" />
            </button>

          </aside>

        </div>
      </main>
    </div>
  );
}