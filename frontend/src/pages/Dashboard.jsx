import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  FiEye, FiGlobe, 
  FiAlertTriangle, FiLogOut, FiRefreshCw, 
  FiPlay, FiArrowRight, FiUser, FiCalendar,
  FiCheckCircle, FiMaximize2, FiX
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
    return text;
  }
}

export default function Dashboard({ onLogout, onViewDetailedReport, onScheduleConsultation }) {
  const { t, i18n } = useTranslation();

  const patientName = "Jane Doe";
  const rawClinicalNote = "Moderate signs detected in Left Eye (OS). Right Eye (OD) is clear. Keep blood sugar controlled and schedule a consultation.";
  const [translatedClinicalNote, setTranslatedClinicalNote] = useState(rawClinicalNote);
  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);

  const [leftEye, setLeftEye] = useState({ stage: 'Stage 2 - Moderate', status: 'completed' });
  const [rightEye, setRightEye] = useState({ stage: 'Stage 0 - Clear', status: 'completed' });

  const [leftImage, setLeftImage] = useState(null);
  const [rightImage, setRightImage] = useState(null);
  
  const [leftQualityStatus, setLeftQualityStatus] = useState(null);
  const [rightQualityStatus, setRightQualityStatus] = useState(null);
  const [leftVerdict, setLeftVerdict] = useState(null);
  const [rightVerdict, setRightVerdict] = useState(null);
  
  const [leftViewMode, setLeftViewMode] = useState('original');
  const [rightViewMode, setRightViewMode] = useState('original');
  
  const [leftMaskUrl, setLeftMaskUrl] = useState(null);
  const [leftMaskStatus, setLeftMaskStatus] = useState('idle');
  
  const [rightMaskUrl, setRightMaskUrl] = useState(null);
  const [rightMaskStatus, setRightMaskStatus] = useState('idle');

  const [fullscreenImage, setFullscreenImage] = useState(null);

  useEffect(() => {
    let isMounted = true;
    translateDynamicText(rawClinicalNote, i18n.language).then(translated => {
      if (isMounted) setTranslatedClinicalNote(translated);
    });
    return () => { isMounted = false; };
  }, [i18n.language]);

  const handleLanguageChange = (lang) => i18n.changeLanguage(lang);

  const fetchStage2Segmentation = async (file, setMaskUrl, setMaskStatus) => {
    setMaskStatus('loading');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://localhost:5000/api/stage2-segmentation', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error(`Backend Error ${res.status}`);
      const data = await res.json();
      if (data.maskUrl) {
        setMaskUrl(data.maskUrl);
        setMaskStatus('success');
      } else {
        throw new Error('No mask URL returned');
      }
    } catch (err) {
      console.error("Stage 2 backend service error:", err);
      setMaskStatus('error');
    }
  };

  const verifyImageQuality = async (file, setQualityStatus, setVerdict, setMaskUrl, setMaskStatus) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:5000/api/stage1-quality', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Stage 1 Quality Service failed');
      const data = await res.json();
      
      if (data.verdict === 'reject') {
        setQualityStatus('rejected');
        setVerdict('reject');
      } else {
        setQualityStatus('accepted');
        setVerdict(data.verdict);
        fetchStage2Segmentation(file, setMaskUrl, setMaskStatus);
      }
    } catch (err) {
      setQualityStatus('accepted');
      setVerdict('accept');
      fetchStage2Segmentation(file, setMaskUrl, setMaskStatus);
    }
  };

  const handleLeftFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLeftImage(URL.createObjectURL(file));
      setLeftViewMode('original');
      setLeftMaskUrl(null);
      verifyImageQuality(file, setLeftQualityStatus, setLeftVerdict, setLeftMaskUrl, setLeftMaskStatus);
    }
  };

  const handleRightFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRightImage(URL.createObjectURL(file));
      setRightViewMode('original');
      setRightMaskUrl(null);
      verifyImageQuality(file, setRightQualityStatus, setRightVerdict, setRightMaskUrl, setRightMaskStatus);
    }
  };

  const runSequentialPipeline = async () => {
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
      }, 1000);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 font-['Plus_Jakarta_Sans',sans-serif] p-4 sm:p-6 lg:p-8 select-none max-w-7xl mx-auto antialiased">
      <main className="flex flex-col gap-6">
        
        {/* HEADER BAR */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1 px-1">
          <div className="flex items-center gap-4">
            <button onClick={onLogout} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-2xl shadow-sm text-white flex items-center justify-center shrink-0 transition cursor-pointer">
              <Logo />
            </button>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-['Outfit',sans-serif] font-bold text-slate-900 tracking-tight leading-none">
              Welcome, {patientName}
            </h1>
          </div>
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <div className="flex items-center bg-white border border-slate-200/90 rounded-xl p-1 text-xs font-semibold shadow-2xs">
              <FiGlobe className="ml-2 mr-1.5 text-slate-400" />
              <button onClick={() => handleLanguageChange('en')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${i18n.language === 'en' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500'}`}>EN</button>
              <button onClick={() => handleLanguageChange('hi')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${i18n.language === 'hi' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500'}`}>हिंदी</button>
              <button onClick={() => handleLanguageChange('kn')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${i18n.language === 'kn' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500'}`}>ಕನ್ನಡ</button>
            </div>
            <button onClick={onLogout} title="Logout" className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/90 bg-white shadow-2xs transition cursor-pointer">
              <FiLogOut className="text-base" />
            </button>
          </div>
        </header>

        {/* RISK ASSESSMENT BANNER */}
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-white bg-white border border-amber-200/90 border-l-4 border-l-amber-500 rounded-2xl p-5 md:p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500 text-white rounded-xl shadow-sm flex items-center justify-center shrink-0">
                <FiAlertTriangle className="text-2xl" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white">Stage 2 Risk</span>
                </div>
                <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">Overall Assessment: Stage 2 – Moderate Risk</h2>
                <p className="text-xs md:text-sm text-slate-600 font-medium">{translatedClinicalNote}</p>
              </div>
            </div>
            <button onClick={onScheduleConsultation} className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer">
              <FiCalendar className="text-amber-400 text-sm" />
              <span>Schedule Consultation</span>
              <FiArrowRight className="text-sm" />
            </button>
          </div>
        </div>

        {/* MAIN DASHBOARD CONTENT GRID */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          
          {/* LEFT MAIN PANEL: RETINAL EXAM */}
          <div className="flex-1 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-200/60 text-amber-600">
                    <FiEye className="text-base" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base tracking-tight">Bilateral Retinal Examination (OS / OD)</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">Stage 1 Quality Assessment & Stage 2 Lesion Workstation</p>
              </div>
              <button onClick={runSequentialPipeline} disabled={isProcessingPipeline} className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2 transition cursor-pointer shadow-xs">
                {isProcessingPipeline ? <FiRefreshCw className="animate-spin text-sm" /> : <FiPlay className="text-xs fill-current text-amber-400" />}
                <span>Run AI Assessment</span>
              </button>
            </div>

            {/* Scan Viewports Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
              
              {/* LEFT EYE VIEWPORT */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col space-y-4">
                {/* STRICT 2-ROW LOCK HEADER */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Left Eye (OS)</span>
                    {leftQualityStatus === 'accepted' && (
                      <div className="flex items-center bg-slate-200/80 border border-slate-300/80 rounded-xl p-0.5 text-[11px] font-bold shadow-2xs">
                        <button onClick={() => setLeftViewMode('original')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${leftViewMode === 'original' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}>Original</button>
                        <button onClick={() => setLeftViewMode('mapped')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${leftViewMode === 'mapped' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600'}`}>Mapped</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-h-[24px]">
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2.5 py-0.5 rounded-lg border border-amber-200">{leftEye.stage}</span>
                    {leftVerdict === 'enhance' ? (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold uppercase">IMAGE ENHANCED</span>
                    ) : (
                      <span className="invisible px-2 py-0.5 text-[10px] select-none">placeholder</span>
                    )}
                  </div>
                </div>

                <div className="relative bg-[#0b1329] rounded-xl h-[380px] w-full flex flex-col items-center justify-center text-center border border-slate-800 shadow-inner overflow-hidden">
                  <label className="absolute inset-0 z-30 cursor-pointer flex flex-col items-center justify-center">
                    <input type="file" accept="image/*" className="hidden" onChange={handleLeftFileUpload} />
                  </label>

                  {leftImage ? (
                    <>
                      <img src={leftImage} alt="Left Eye Scan" className="absolute inset-0 w-full h-full object-contain z-10" />
                      
                      {leftViewMode === 'mapped' && leftMaskStatus === 'loading' && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm pointer-events-none">
                           <span className="text-white text-sm font-bold animate-pulse">Generating Mask...</span>
                        </div>
                      )}

                      {leftViewMode === 'mapped' && leftMaskStatus === 'error' && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-rose-900/60 backdrop-blur-sm pointer-events-none">
                           <span className="text-rose-200 text-sm font-bold">Backend Processing Failed</span>
                        </div>
                      )}

                      {leftViewMode === 'mapped' && leftMaskStatus === 'success' && leftMaskUrl && (
                         <img src={leftMaskUrl} alt="Lesion Mask" className="absolute inset-0 w-full h-full object-contain z-20 opacity-85 pointer-events-none" />
                      )}

                      <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(leftImage); }} className="absolute top-3 right-3 z-40 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg transition cursor-pointer">
                        <FiMaximize2 className="text-sm" />
                      </button>
                    </>
                  ) : (
                    <div className="relative z-10 flex flex-col items-center pointer-events-none">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-3xl mb-3">
                        <FiEye />
                      </div>
                      <span className="text-white font-semibold text-sm">Click to Upload Fundus Image</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT EYE VIEWPORT */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col space-y-4">
                {/* STRICT 2-ROW LOCK HEADER */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Right Eye (OD)</span>
                    {rightQualityStatus === 'accepted' && (
                      <div className="flex items-center bg-slate-200/80 border border-slate-300/80 rounded-xl p-0.5 text-[11px] font-bold shadow-2xs">
                        <button onClick={() => setRightViewMode('original')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${rightViewMode === 'original' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}>Original</button>
                        <button onClick={() => setRightViewMode('mapped')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${rightViewMode === 'mapped' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600'}`}>Mapped</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-h-[24px]">
                    <span className="text-[11px] font-bold text-emerald-900 bg-emerald-100/90 px-2.5 py-0.5 rounded-lg border border-emerald-200">{rightEye.stage}</span>
                    {rightVerdict === 'enhance' ? (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold uppercase">IMAGE ENHANCED</span>
                    ) : (
                      <span className="invisible px-2 py-0.5 text-[10px] select-none">placeholder</span>
                    )}
                  </div>
                </div>

                <div className="relative bg-[#0b1329] rounded-xl h-[380px] w-full flex flex-col items-center justify-center text-center border border-slate-800 shadow-inner overflow-hidden">
                  <label className="absolute inset-0 z-30 cursor-pointer flex flex-col items-center justify-center">
                    <input type="file" accept="image/*" className="hidden" onChange={handleRightFileUpload} />
                  </label>

                  {rightImage ? (
                    <>
                      <img src={rightImage} alt="Right Eye Scan" className="absolute inset-0 w-full h-full object-contain z-10" />
                      
                      {rightViewMode === 'mapped' && rightMaskStatus === 'loading' && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm pointer-events-none">
                           <span className="text-white text-sm font-bold animate-pulse">Generating Mask...</span>
                        </div>
                      )}

                      {rightViewMode === 'mapped' && rightMaskStatus === 'error' && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-rose-900/60 backdrop-blur-sm pointer-events-none">
                           <span className="text-rose-200 text-sm font-bold">Backend Processing Failed</span>
                        </div>
                      )}

                      {rightViewMode === 'mapped' && rightMaskStatus === 'success' && rightMaskUrl && (
                         <img src={rightMaskUrl} alt="Lesion Mask" className="absolute inset-0 w-full h-full object-contain z-20 opacity-85 pointer-events-none" />
                      )}

                      <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(rightImage); }} className="absolute top-3 right-3 z-40 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg transition cursor-pointer">
                        <FiMaximize2 className="text-sm" />
                      </button>
                    </>
                  ) : (
                    <div className="relative z-10 flex flex-col items-center pointer-events-none">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-3xl mb-3">
                        <FiEye />
                      </div>
                      <span className="text-white font-semibold text-sm">Click to Upload Fundus Image</span>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* COMMON MASK LEGEND */}
            {(leftViewMode === 'mapped' || rightViewMode === 'mapped') && (
              <div className="mt-2 bg-slate-50 border border-slate-200/90 rounded-xl p-4 flex flex-wrap items-center justify-center gap-6 shadow-xs animate-in fade-in duration-300">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider mr-2">Detected Pathology:</span>
                <div className="flex items-center gap-2 text-[11px] font-extrabold text-slate-600 uppercase">
                  <span className="w-3 h-3 rounded-full bg-purple-500 shadow-sm border border-purple-300"></span>
                  Neovascularization
                </div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold text-slate-600 uppercase">
                  <span className="w-3 h-3 rounded-full bg-rose-500 shadow-sm border border-rose-300"></span>
                  Hemorrhage
                </div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold text-slate-600 uppercase">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-sm border border-emerald-300"></span>
                  Hard Exudate
                </div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold text-slate-600 uppercase">
                  <span className="w-3 h-3 rounded-full bg-amber-400 shadow-sm border border-amber-300"></span>
                  Microaneurysm
                </div>
              </div>
            )}
            
          </div>

          {/* HEALTH RECORD SIDEBAR */}
          <aside className="w-full lg:w-96 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col justify-between shrink-0 shadow-xs space-y-6">
            <div className="space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">My Health Record</h2>
                  <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80">Blood Group: A+</span>
                </div>
                <div className="flex items-center gap-3.5 bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/70">
                  <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
                    <FiUser />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{patientName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">54 Yrs • Female • DOB: 12 May 1972</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3.5 bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-xs">AV</div>
                <div>
                  <span className="text-[10px] font-extrabold text-blue-900/60 uppercase tracking-wider block">YOUR EYE SPECIALIST</span>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">Dr. Alex Vance</p>
                  <p className="text-[11px] text-slate-500">Chief Ophthalmologist</p>
                </div>
              </div>
            </div>

            <button onClick={onViewDetailedReport} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-xs transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer mt-4">
              <span>Detailed Report</span>
              <FiArrowRight className="text-sm" />
            </button>
          </aside>

        </div>
      </main>

      {fullscreenImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8" onClick={() => setFullscreenImage(null)}>
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setFullscreenImage(null)} className="absolute top-4 right-4 z-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition cursor-pointer">
              <FiX className="text-xl" />
            </button>
            <img src={fullscreenImage} alt="Fullscreen Scan" className="max-h-[90vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800" />
          </div>
        </div>
      )}
    </div>
  );
}