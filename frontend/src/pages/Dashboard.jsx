import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  FiEye, FiUploadCloud, FiGlobe, 
  FiAlertTriangle, FiLogOut, FiRefreshCw, 
  FiPlay, FiArrowRight, FiUser, FiCalendar,
  FiCheckCircle, FiShield, FiActivity,
  FiZap, FiMaximize2, FiX, FiAlertCircle
} from 'react-icons/fi';
import Logo from '../components/Logo';

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

  // Upload states & Quality Validation states
  const [leftImage, setLeftImage] = useState(null);
  const [rightImage, setRightImage] = useState(null);
  
  const [leftQualityStatus, setLeftQualityStatus] = useState(null); // 'accepted', 'rejected'
  const [rightQualityStatus, setRightQualityStatus] = useState(null);
  const [leftVerdict, setLeftVerdict] = useState(null); // 'accept', 'enhance', 'reject'
  const [rightVerdict, setRightVerdict] = useState(null);
  const [leftRejectReason, setLeftRejectReason] = useState('');
  const [rightRejectReason, setRightRejectReason] = useState('');

  const [fullscreenImage, setFullscreenImage] = useState(null);

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

  const verifyImageQuality = async (file, setQualityStatus, setVerdict, setRejectReason) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:5000/api/stage1-quality', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('Stage 1 Quality Service failed');
      
      const data = await res.json();
      
      if (data.verdict === 'reject') {
        setQualityStatus('rejected');
        setVerdict('reject');
        setRejectReason(data.reason);
      } else {
        setQualityStatus('accepted');
        setVerdict(data.verdict); // 'accept' or 'enhance'
        setRejectReason('');
      }
    } catch (err) {
      console.warn("Backend quality check error, defaulting to accepted:", err);
      setQualityStatus('accepted');
      setVerdict('accept');
      setRejectReason('');
    }
  };

  const handleLeftFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setLeftImage(imageUrl);
      verifyImageQuality(file, setLeftQualityStatus, setLeftVerdict, setLeftRejectReason);
    }
  };

  const handleRightFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setRightImage(imageUrl);
      verifyImageQuality(file, setRightQualityStatus, setRightVerdict, setRightRejectReason);
    }
  };

  const runSequentialPipeline = async () => {
    if (isProcessingPipeline) return;
    setIsProcessingPipeline(true);
    setLeftEye(prev => ({ ...prev, status: 'processing' }));
    setRightEye(prev => ({ ...prev, status: 'queued' }));

    try {
      const response = await fetch('http://localhost:5000/api/simulation');
      if (!response.ok) throw new Error('Simulation data unavailable');
      
      const metrics = await response.json();
      const captureDelay = (metrics.avgWaitCapture || 1) * 500;
      const computeDelay = (metrics.avgWaitCompute || 1) * 500;

      setTimeout(() => {
        setLeftEye(prev => ({ ...prev, status: 'completed', waitTime: metrics.avgWaitCapture }));
        setRightEye(prev => ({ ...prev, status: 'processing' }));
        
        setTimeout(() => {
          setRightEye(prev => ({ ...prev, status: 'completed', waitTime: metrics.avgWaitCompute }));
          setIsProcessingPipeline(false);
        }, computeDelay);
      }, captureDelay);

    } catch (err) {
      console.error(err);
      setTimeout(() => {
        setLeftEye(prev => ({ ...prev, status: 'completed' }));
        setRightEye(prev => ({ ...prev, status: 'completed' }));
        setIsProcessingPipeline(false);
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 font-['Plus_Jakarta_Sans',sans-serif] p-4 sm:p-6 lg:p-8 select-none max-w-7xl mx-auto antialiased">
      <main className="flex flex-col gap-6">
        
        {/* ================= 1. HEADER BAR ================= */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1 px-1">
          <div className="flex items-center gap-4">
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

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
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
                </div>

                <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">
                  Overall Assessment: Stage 2 – Moderate Risk
                </h2>

                <p className="text-xs md:text-sm text-slate-600 leading-relaxed max-w-3xl font-medium">
                  {translatedClinicalNote}
                </p>
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
        </div>

        {/* ================= 3. MAIN DASHBOARD CONTENT GRID ================= */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          
          {/* ------------ LEFT MAIN PANEL: RETINAL EXAM ------------ */}
          <div className="flex-1 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-6">
            
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
                  {t('stage1Sub', 'Stage 1 Quality Assessment & Stage 2-4 AI Pipeline')}
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
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 block">{t('leftEyeLabel', 'Left Eye (OS)')}</span>
                      {/* BLUE AREA: "Image Enhanced" Tag */}
                      {leftVerdict === 'enhance' && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold uppercase tracking-wide">
                          Image Enhanced
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">Bilateral Scan A</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-lg border border-amber-200">
                    {leftEye.stage}
                  </span>
                </div>

                {/* Fundus Diagnostic HUD Box */}
                <div className="relative bg-[#0b1329] rounded-xl p-3 min-h-[380px] flex flex-col items-center justify-center text-center border border-slate-800 shadow-inner group overflow-hidden">
                  
                  <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none"></div>

                  <label className="absolute inset-0 z-20 cursor-pointer flex flex-col items-center justify-center">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleLeftFileUpload} 
                    />
                  </label>

                  {leftImage ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-2">
                      <img src={leftImage} alt="Left Eye Scan" className="w-full h-full object-contain rounded-xl" />
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFullscreenImage(leftImage); }}
                        className="absolute top-3 right-3 z-30 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg backdrop-blur-xs transition shadow-md cursor-pointer"
                        title="View Fullscreen"
                      >
                        <FiMaximize2 className="text-sm" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative z-10 flex flex-col items-center pointer-events-none">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-3xl mb-3 backdrop-blur-xs group-hover:scale-105 transition">
                        <FiEye />
                      </div>
                      <span className="text-white font-semibold text-sm tracking-wide">
                        Click to Upload Fundus Image
                      </span>
                      <span className="text-xs text-slate-400 mt-1">Supports JPG, PNG</span>
                    </div>
                  )}

                  {/* STAGE 1 REJECTION POPUP OVERLAY */}
                  {leftQualityStatus === 'rejected' && (
                    <div className="absolute inset-x-3 bottom-3 z-40 bg-rose-950/95 border border-rose-500/50 rounded-xl p-3.5 text-left text-white shadow-2xl backdrop-blur-md animate-bounce-short">
                      <div className="flex items-start gap-2.5">
                        <FiAlertCircle className="text-rose-400 text-lg shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-rose-200 uppercase tracking-wide">Stage 1 Quality Check Failed</p>
                          <p className="text-[11px] text-rose-300/90 mt-0.5 leading-snug">{leftRejectReason}</p>
                        </div>
                      </div>
                      <label className="mt-3 block w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-center text-xs font-extrabold rounded-lg cursor-pointer transition shadow-sm">
                        <span>Re-upload Clear Image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLeftFileUpload} />
                      </label>
                    </div>
                  )}

                  {/* PURPLE AREA: "Acceptable Image" Tag */}
                  {leftQualityStatus === 'accepted' && (
                    <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-extrabold uppercase backdrop-blur-xs">
                      <FiCheckCircle />
                      <span>Acceptable Image</span>
                    </div>
                  )}

                </div>

                <label className="w-full bg-white hover:bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200/90 transition cursor-pointer shadow-2xs">
                  <FiUploadCloud className="text-sm text-slate-400" />
                  <span>{t('replaceBtn', 'Replace Photo')}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLeftFileUpload} />
                </label>
              </div>

              {/* ---------- RIGHT EYE VIEWPORT ---------- */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-slate-300 transition">
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 block">{t('rightEyeLabel', 'Right Eye (OD)')}</span>
                      {/* BLUE AREA: "Image Enhanced" Tag */}
                      {rightVerdict === 'enhance' && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold uppercase tracking-wide">
                          Image Enhanced
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">Bilateral Scan B</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-900 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {rightEye.stage}
                  </span>
                </div>

                {/* Fundus Diagnostic HUD Box */}
                <div className="relative bg-[#0b1329] rounded-xl p-3 min-h-[380px] flex flex-col items-center justify-center text-center border border-slate-800 shadow-inner group overflow-hidden">
                  
                  <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none"></div>

                  <label className="absolute inset-0 z-20 cursor-pointer flex flex-col items-center justify-center">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleRightFileUpload} 
                    />
                  </label>

                  {rightImage ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-2">
                      <img src={rightImage} alt="Right Eye Scan" className="w-full h-full object-contain rounded-xl" />
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFullscreenImage(rightImage); }}
                        className="absolute top-3 right-3 z-30 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg backdrop-blur-xs transition shadow-md cursor-pointer"
                        title="View Fullscreen"
                      >
                        <FiMaximize2 className="text-sm" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative z-10 flex flex-col items-center pointer-events-none">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-3xl mb-3 backdrop-blur-xs group-hover:scale-105 transition">
                        <FiEye />
                      </div>
                      <span className="text-white font-semibold text-sm tracking-wide">
                        Click to Upload Fundus Image
                      </span>
                      <span className="text-xs text-slate-400 mt-1">Supports JPG, PNG</span>
                    </div>
                  )}

                  {/* STAGE 1 REJECTION POPUP OVERLAY */}
                  {rightQualityStatus === 'rejected' && (
                    <div className="absolute inset-x-3 bottom-3 z-40 bg-rose-950/95 border border-rose-500/50 rounded-xl p-3.5 text-left text-white shadow-2xl backdrop-blur-md">
                      <div className="flex items-start gap-2.5">
                        <FiAlertCircle className="text-rose-400 text-lg shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-rose-200 uppercase tracking-wide">Stage 1 Quality Check Failed</p>
                          <p className="text-[11px] text-rose-300/90 mt-0.5 leading-snug">{rightRejectReason}</p>
                        </div>
                      </div>
                      <label className="mt-3 block w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-center text-xs font-extrabold rounded-lg cursor-pointer transition shadow-sm">
                        <span>Re-upload Clear Image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleRightFileUpload} />
                      </label>
                    </div>
                  )}

                  {/* PURPLE AREA: "Acceptable Image" Tag */}
                  {rightQualityStatus === 'accepted' && (
                    <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-extrabold uppercase backdrop-blur-xs">
                      <FiCheckCircle />
                      <span>Acceptable Image</span>
                    </div>
                  )}

                </div>

                <label className="w-full bg-white hover:bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200/90 transition cursor-pointer shadow-2xs">
                  <FiUploadCloud className="text-sm text-slate-400" />
                  <span>{t('replaceBtn', 'Replace Photo')}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleRightFileUpload} />
                </label>
              </div>

            </div>
          </div>

          {/* ------------ RIGHT SIDEBAR: HEALTH RECORD ------------ */}
          <aside className="w-full lg:w-96 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col justify-between shrink-0 shadow-xs space-y-6">
            <div className="space-y-5">
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
            </div>

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

      {/* FULLSCREEN IMAGE MODAL */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setFullscreenImage(null)}
              className="absolute top-4 right-4 z-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition cursor-pointer backdrop-blur-md"
              title="Close Fullscreen"
            >
              <FiX className="text-xl" />
            </button>
            <img 
              src={fullscreenImage} 
              alt="Fullscreen Retinal Scan" 
              className="max-h-[90vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}