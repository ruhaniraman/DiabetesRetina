import React, { useState, useEffect, useCallback } from 'react';
import { 
  FiEye, FiUploadCloud, FiGlobe, 
  FiAlertTriangle, FiLogOut, FiRefreshCw, 
  FiPlay, FiArrowRight 
} from 'react-icons/fi';

// Default Source Text (English)
const DEFAULT_TEXTS = {
  portalSub: "RETINARESCUE • PERSONAL RETINAL HEALTH PORTAL",
  title: "Retina Rescue",
  overallRiskTitle: "Overall Assessment: Stage 2 - Moderate Risk",
  overallRiskDesc: "Moderate signs detected in Left Eye (OS). Right Eye (OD) is clear. Keep blood sugar controlled and schedule a consultation.",
  dualCardTitle: "Bilateral Retinal Examination (OS / OD)",
  leftEyeLabel: "Left Eye (OS)",
  rightEyeLabel: "Right Eye (OD)",
  rawView: "Standard",
  aiView: "AI Heatmap",
  replaceBtn: "Replace Photo",
  processAllBtn: "Run Sequential AI Assessment",
  processingLeft: "Processing Left Eye Pipeline...",
  processingRight: "Processing Right Eye Pipeline...",
  queued: "Queued for Processing",
  recordsTitle: "My Health Record",
  patientName: "Jane Doe",
  patientMeta: "54 Yrs • Female • DOB: 12 May 1972",
  bloodGroup: "Blood Group: A+",
  assignedDoctorLabel: "YOUR EYE SPECIALIST",
  vitalsTitle: "OCULAR VITALS & BASELINE",
  upperBp: "Upper BP",
  lowerBp: "Lower BP",
  hba1c: "HbA1c Level",
  indicatorLabel: "KEY FINDINGS",
  indicatorVal: "Minor Spots (OS)",
  maculaLabel: "CENTER VISION",
  maculaVal: "Clear & Healthy",
  recentScans: "DIAGNOSTIC IMAGING LOG",
  octScan: "OCT Retinal Scan",
  fundusScan: "Fundus Photography",
  bothEyes: "OU (Both Eyes)",
  leftEyeOnly: "OS (Left Eye)",
  statusMild: "Mild Concern",
  statusNormal: "Normal",
  detailedReportBtn: "DETAILED REPORT",
  logout: "Log Out"
};

// In-Memory Translation Cache to reduce API calls
const translationCache = {};

/**
 * Dynamic Real-Time Google Translation Service
 * Replace GOOGLE_API_KEY or target API endpoint with your backend proxy URL (e.g., /api/translate)
 */
async function translateText(text, targetLang, apiKey = "") {
  if (targetLang === 'en' || !text) return text;
  
  const cacheKey = `${targetLang}:${text}`;
  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  try {
    // Standard Google Cloud Translation REST API Call
    // If calling via backend proxy, change URL to: `/api/translate`
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        format: 'text'
      })
    });

    if (!response.ok) throw new Error('Translation API request failed');
    
    const data = await response.json();
    const translatedText = data?.data?.translations?.[0]?.translatedText || text;
    
    translationCache[cacheKey] = translatedText;
    return translatedText;
  } catch (error) {
    console.warn("Real-time translation failed, falling back to source text:", error);
    return text; // Fallback to original English text
  }
}

export default function Dashboard({ user, onLogout, onViewDetailedReport, lang: externalLang, setLang: externalSetLang }) {
  const [internalLang, setInternalLang] = useState('en');
  const currentLang = externalLang || internalLang;

  const [t, setT] = useState(DEFAULT_TEXTS);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);

  // Left Eye (OS) and Right Eye (OD) States
  const [leftEye, setLeftEye] = useState({
    uploaded: true,
    status: 'completed',
    stage: 'Stage 2 - Moderate',
    accuracy: '96.4%',
    showAi: false
  });

  const [rightEye, setRightEye] = useState({
    uploaded: true,
    status: 'completed',
    stage: 'Stage 0 - Clear',
    accuracy: '98.1%',
    showAi: false
  });

  // Handle Dynamic Real-Time Translation on Language Change
  const updateTranslations = useCallback(async (targetLang) => {
    if (targetLang === 'en') {
      setT(DEFAULT_TEXTS);
      return;
    }

    setIsTranslating(true);
    const translatedObject = {};

    // Translate all keys concurrently
    const keys = Object.keys(DEFAULT_TEXTS);
    const promises = keys.map(key => translateText(DEFAULT_TEXTS[key], targetLang));

    const results = await Promise.all(promises);
    keys.forEach((key, index) => {
      translatedObject[key] = results[index];
    });

    setT(translatedObject);
    setIsTranslating(false);
  }, []);

  useEffect(() => {
    updateTranslations(currentLang);
  }, [currentLang, updateTranslations]);

  const handleLangChange = (newLang) => {
    if (externalSetLang) externalSetLang(newLang);
    else setInternalLang(newLang);
  };

  // Sequential AI Processing Execution
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
    <div className="min-h-screen bg-[#f1f3f7] text-slate-800 font-sans p-3 md:p-6 select-none max-w-7xl mx-auto">
      
      {/* MAIN CONTENT AREA */}
      <main className="flex flex-col gap-5">
        
        {/* Seamless Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2 py-1">
          <div>
            <span className="text-[11px] font-extrabold tracking-wider text-slate-400 uppercase block mb-1">
              {t.portalSub}
            </span>
            <div className="flex items-center gap-2.5">
              <FiEye className="text-2xl md:text-3xl text-amber-600 shrink-0" />
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                {t.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {/* Real-time Language Switcher */}
            <div className="flex items-center bg-white border border-slate-200/80 rounded-2xl p-1 shadow-sm text-xs font-semibold">
              <FiGlobe className={`ml-2.5 mr-1 text-slate-400 ${isTranslating ? 'animate-spin text-amber-600' : ''}`} />
              <button 
                type="button"
                onClick={() => handleLangChange('en')} 
                className={`px-3 py-1.5 rounded-xl transition ${currentLang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                EN
              </button>
              <button 
                type="button"
                onClick={() => handleLangChange('hi')} 
                className={`px-3 py-1.5 rounded-xl transition ${currentLang === 'hi' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                हिंदी
              </button>
              <button 
                type="button"
                onClick={() => handleLangChange('kn')} 
                className={`px-3 py-1.5 rounded-xl transition ${currentLang === 'kn' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                ಕನ್ನಡ
              </button>
            </div>

            {/* Log Out Button */}
            <button 
              onClick={onLogout}
              title={t.logout}
              className="p-2.5 rounded-2xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 bg-white shadow-sm flex items-center justify-center transition cursor-pointer"
            >
              <FiLogOut className="text-lg" />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* CENTER ASSESSMENT SECTION */}
          <div className="flex-1 flex flex-col gap-5">
            
            {/* Stage Risk Assessment Banner */}
            <div className="bg-[#f7efe1] border border-amber-200/60 rounded-[2rem] p-5 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <FiAlertTriangle className="text-amber-700 text-lg" />
                  <span className="text-xl font-black text-amber-950">{t.overallRiskTitle}</span>
                </div>
                <p className="text-xs text-amber-900/80 font-medium mt-1">
                  {t.overallRiskDesc}
                </p>
              </div>
            </div>

            {/* DUAL RETINAL SCAN CONTAINER */}
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-sm space-y-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <FiEye className="text-amber-600" /> {t.dualCardTitle}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">Bilateral Assessment • Oculus Sinister (OS) & Oculus Dexter (OD)</p>
                </div>

                {/* Sequential AI Trigger Button */}
                <button 
                  onClick={runSequentialPipeline}
                  disabled={isProcessingPipeline}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm ${
                    isProcessingPipeline 
                      ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {isProcessingPipeline ? (
                    <>
                      <FiRefreshCw className="animate-spin text-sm" />
                      <span>Processing Pipeline...</span>
                    </>
                  ) : (
                    <>
                      <FiPlay className="text-sm fill-current" />
                      <span>{t.processAllBtn}</span>
                    </>
                  )}
                </button>
              </div>

              {/* DUAL CARDS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. LEFT EYE (OS) CARD */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-[2rem] p-4 flex flex-col justify-between space-y-3 relative overflow-hidden">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs font-black text-slate-900 block">{t.leftEyeLabel}</span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md inline-block mt-0.5">
                        {leftEye.stage}
                      </span>
                    </div>

                    {/* AI Heatmap Switcher */}
                    <div className="flex bg-slate-200/70 p-0.5 rounded-xl text-[10px] font-bold">
                      <button 
                        onClick={() => setLeftEye(prev => ({ ...prev, showAi: false }))}
                        className={`px-2.5 py-1 rounded-lg transition ${!leftEye.showAi ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                      >
                        {t.rawView}
                      </button>
                      <button 
                        onClick={() => setLeftEye(prev => ({ ...prev, showAi: true }))}
                        className={`px-2.5 py-1 rounded-lg transition ${leftEye.showAi ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500'}`}
                      >
                        {t.aiView}
                      </button>
                    </div>
                  </div>

                  {/* Display Canvas Box */}
                  <div className="relative bg-[#0b1329] rounded-[1.5rem] p-6 min-h-[200px] flex flex-col items-center justify-center text-center overflow-hidden border border-slate-800">
                    {leftEye.status === 'processing' ? (
                      <div className="flex flex-col items-center gap-2 text-amber-400">
                        <FiRefreshCw className="text-3xl animate-spin" />
                        <span className="text-xs font-bold text-white">{t.processingLeft}</span>
                      </div>
                    ) : leftEye.status === 'queued' ? (
                      <div className="text-slate-400 text-xs font-bold">
                        <span>⏳ {t.queued}</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-amber-400 text-2xl mb-2 backdrop-blur-md">
                          <FiEye className={leftEye.showAi ? 'scale-110 text-amber-300 transition' : ''} />
                        </div>
                        <span className="text-white font-bold text-xs">
                          {leftEye.showAi ? "AI Lesion Heatmap" : "Original Fundus Image"}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold mt-1">Accuracy: {leftEye.accuracy}</span>
                      </>
                    )}
                  </div>

                  <button className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200 transition cursor-pointer">
                    <FiUploadCloud className="text-sm text-slate-500" /> {t.replaceBtn}
                  </button>
                </div>

                {/* 2. RIGHT EYE (OD) CARD */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-[2rem] p-4 flex flex-col justify-between space-y-3 relative overflow-hidden">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs font-black text-slate-900 block">{t.rightEyeLabel}</span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md inline-block mt-0.5">
                        {rightEye.stage}
                      </span>
                    </div>

                    {/* AI Heatmap Switcher */}
                    <div className="flex bg-slate-200/70 p-0.5 rounded-xl text-[10px] font-bold">
                      <button 
                        onClick={() => setRightEye(prev => ({ ...prev, showAi: false }))}
                        className={`px-2.5 py-1 rounded-lg transition ${!rightEye.showAi ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                      >
                        {t.rawView}
                      </button>
                      <button 
                        onClick={() => setRightEye(prev => ({ ...prev, showAi: true }))}
                        className={`px-2.5 py-1 rounded-lg transition ${rightEye.showAi ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500'}`}
                      >
                        {t.aiView}
                      </button>
                    </div>
                  </div>

                  {/* Display Canvas Box */}
                  <div className="relative bg-[#0b1329] rounded-[1.5rem] p-6 min-h-[200px] flex flex-col items-center justify-center text-center overflow-hidden border border-slate-800">
                    {rightEye.status === 'processing' ? (
                      <div className="flex flex-col items-center gap-2 text-amber-400">
                        <FiRefreshCw className="text-3xl animate-spin" />
                        <span className="text-xs font-bold text-white">{t.processingRight}</span>
                      </div>
                    ) : rightEye.status === 'queued' ? (
                      <div className="text-slate-400 text-xs font-bold">
                        <span>⏳ {t.queued}</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-emerald-400 text-2xl mb-2 backdrop-blur-md">
                          <FiEye className={rightEye.showAi ? 'scale-110 text-amber-300 transition' : ''} />
                        </div>
                        <span className="text-white font-bold text-xs">
                          {rightEye.showAi ? "AI Lesion Heatmap" : "Original Fundus Image"}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold mt-1">Accuracy: {rightEye.accuracy}</span>
                      </>
                    )}
                  </div>

                  <button className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200 transition cursor-pointer">
                    <FiUploadCloud className="text-sm text-slate-500" /> {t.replaceBtn}
                  </button>
                </div>

              </div>
            </div>

            {/* DIAGNOSTIC TELEMETRY CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
              <div className="bg-white border border-slate-100 rounded-[1.5rem] p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Quality Gate
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-slate-900">84%</span>
                    <span className="text-xs font-black text-emerald-600 uppercase">Good</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-2">
                  Image is suitable for screening.
                </p>
              </div>

              <div className="bg-white border border-slate-100 rounded-[1.5rem] p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Confidence Score
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-slate-900">60%</span>
                    <span className="text-xs font-black text-emerald-600 uppercase">Medium</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-2">
                  Top class softmax margin
                </p>
              </div>

              <div className="bg-white border border-slate-100 rounded-[1.5rem] p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
                    MCDO Epistemic
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-emerald-600">0.0025</span>
                    <span className="text-xs font-black text-emerald-600 uppercase">Stable</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-2">
                  10-Pass Bayesian Var
                </p>
              </div>

              <div className="bg-white border border-slate-100 rounded-[1.5rem] p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
                    OOD Detector
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-rose-600">YES</span>
                    <span className="text-xs font-extrabold text-slate-400 uppercase">In-Dist</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-2">
                  Real fundus verified
                </p>
              </div>
            </div>

          </div>

          {/* RIGHT SIDEBAR: MY HEALTH RECORD CARD */}
          <div className="w-full lg:w-96 bg-white rounded-[2.5rem] p-6 border border-slate-100 flex flex-col justify-between shrink-0 shadow-sm space-y-5">
            
            <div className="space-y-5">
              
              {/* Header & Patient Identification */}
              <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-black text-slate-900">{t.recordsTitle}</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-extrabold border border-slate-200">
                    #PT-2026
                  </span>
                </div>

                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-900">{t.patientName}</span>
                    <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                      {t.bloodGroup}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">
                    {t.patientMeta}
                  </p>
                </div>
              </div>

              {/* Doctor Info */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-900 font-extrabold flex items-center justify-center text-sm shrink-0">
                  AV
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">{t.assignedDoctorLabel}</span>
                  <p className="text-xs font-bold text-slate-900">Dr. Alex Vance</p>
                  <p className="text-[10px] text-slate-500 font-medium">Chief Ophthalmologist</p>
                </div>
              </div>

              {/* Ocular Baseline & Vitals Grid (Upper BP, Lower BP, HbA1c) */}
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">
                  {t.vitalsTitle}
                </span>
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100 text-center">
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-extrabold text-slate-400 block">{t.upperBp}</span>
                    <span className="text-xs font-black text-slate-900 block mt-0.5">120 mmHg</span>
                    <span className="text-[9px] font-semibold text-emerald-600">Normal</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-extrabold text-slate-400 block">{t.lowerBp}</span>
                    <span className="text-xs font-black text-slate-900 block mt-0.5">80 mmHg</span>
                    <span className="text-[9px] font-semibold text-emerald-600">Normal</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-extrabold text-slate-400 block">{t.hba1c}</span>
                    <span className="text-xs font-black text-slate-900 block mt-0.5">5.8%</span>
                    <span className="text-[9px] font-semibold text-emerald-600">Optimal</span>
                  </div>
                </div>
              </div>

              {/* Key Findings Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#fef9ee] p-3 rounded-2xl border border-amber-100/60">
                  <span className="text-[9px] uppercase font-bold text-amber-700 block">{t.indicatorLabel}</span>
                  <p className="text-xs font-extrabold text-amber-900 mt-0.5">{t.indicatorVal}</p>
                </div>
                <div className="bg-[#f0fdf4] p-3 rounded-2xl border border-emerald-100/60">
                  <span className="text-[9px] uppercase font-bold text-emerald-700 block">{t.maculaLabel}</span>
                  <p className="text-xs font-extrabold text-emerald-900 mt-0.5">{t.maculaVal}</p>
                </div>
              </div>

              {/* Diagnostic Imaging Log */}
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2.5">
                  {t.recentScans}
                </span>
                <div className="space-y-2">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-slate-100/80 transition cursor-pointer">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">{t.octScan}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                        Nov 24 • {t.leftEyeOnly}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      {t.statusMild}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-slate-100/80 transition cursor-pointer">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">{t.fundusScan}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                        Oct 28 • {t.bothEyes}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {t.statusNormal}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Detailed Report Navigation Action */}
            <button 
              onClick={onViewDetailedReport}
              className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider active:scale-[0.99] cursor-pointer"
            >
              <span>{t.detailedReportBtn}</span>
              <FiArrowRight className="text-base" />
            </button>

          </div>

        </div>

      </main>

    </div>
  );
}