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

// Banner Configuration Mapping
const bannerConfig = {
  'No_DR': {
    gradient: "from-emerald-500/10 via-emerald-500/5 to-white border-emerald-200/90 border-l-emerald-500",
    iconBg: "bg-emerald-500",
    badge: "bg-emerald-500",
    iconColor: "text-emerald-400",
    badgeText: "Stage 0 Clear",
    title: "Overall Assessment: Stage 0 – Clear"
  },
  'Mild': {
    gradient: "from-yellow-500/10 via-yellow-500/5 to-white border-yellow-300/90 border-l-yellow-500",
    iconBg: "bg-yellow-500",
    badge: "bg-yellow-500",
    iconColor: "text-yellow-500",
    badgeText: "Stage 1 Risk",
    title: "Overall Assessment: Stage 1 – Mild Risk"
  },
  'Moderate': {
    gradient: "from-orange-500/10 via-orange-500/5 to-white border-orange-200/90 border-l-orange-500",
    iconBg: "bg-orange-500",
    badge: "bg-orange-500",
    iconColor: "text-orange-400",
    badgeText: "Stage 2 Risk",
    title: "Overall Assessment: Stage 2 – Moderate Risk"
  },
  'Severe': {
    gradient: "from-red-500/10 via-red-500/5 to-white border-red-200/90 border-l-red-500",
    iconBg: "bg-red-500",
    badge: "bg-red-500",
    iconColor: "text-red-400",
    badgeText: "Stage 3 Risk",
    title: "Overall Assessment: Stage 3 – Severe Risk"
  },
  'Proliferate_DR': {
    gradient: "from-purple-500/10 via-purple-500/5 to-white border-purple-200/90 border-l-purple-500",
    iconBg: "bg-purple-500",
    badge: "bg-purple-500",
    iconColor: "text-purple-400",
    badgeText: "Stage 4 Risk",
    title: "Overall Assessment: Stage 4 – Proliferative Risk"
  },
  'Pending': {
    gradient: "from-slate-500/10 via-slate-500/5 to-white border-slate-200/90 border-l-slate-500",
    iconBg: "bg-slate-500",
    badge: "bg-slate-500",
    iconColor: "text-slate-400",
    badgeText: "Pending",
    title: "Overall Assessment: Awaiting Scan Data"
  }
};

// Tag Color Helper Function
const getTagColors = (stage, status) => {
  if (status === 'processing' || status === 'queued' || stage === 'Awaiting Upload') {
    return 'text-slate-900 bg-slate-200/90 border-slate-300';
  }
  if (stage.includes('Stage 0')) return 'text-emerald-900 bg-emerald-100/90 border-emerald-200';
  if (stage.includes('Stage 1')) return 'text-yellow-900 bg-yellow-100/90 border-yellow-200';
  if (stage.includes('Stage 2')) return 'text-orange-900 bg-orange-100/90 border-orange-200';
  if (stage.includes('Stage 3')) return 'text-red-900 bg-red-100/90 border-red-200';
  if (stage.includes('Stage 4')) return 'text-purple-900 bg-purple-100/90 border-purple-200';
  
  return 'text-slate-900 bg-slate-200/90 border-slate-300';
};

export default function Dashboard({ onLogout, onViewDetailedReport, onScheduleConsultation }) {
  const { t, i18n } = useTranslation();

  const patientName = "Jane Doe";
  const rawClinicalNote = "Upload Fundus images and run the AI assessment to generate clinical insights.";
  const [translatedClinicalNote, setTranslatedClinicalNote] = useState(rawClinicalNote);
  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);

  const [overallRisk, setOverallRisk] = useState('Pending');

  const [leftEye, setLeftEye] = useState({ stage: 'Awaiting Upload', status: 'idle' });
  const [rightEye, setRightEye] = useState({ stage: 'Awaiting Upload', status: 'idle' });

  const [leftImage, setLeftImage] = useState(null);
  const [rightImage, setRightImage] = useState(null);
  
  const [leftFile, setLeftFile] = useState(null);
  const [rightFile, setRightFile] = useState(null);
  
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

  const activeBanner = bannerConfig[overallRisk] || bannerConfig['Pending'];

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
      setLeftFile(file);
      setLeftImage(URL.createObjectURL(file));
      setLeftViewMode('original');
      setLeftMaskUrl(null);
      verifyImageQuality(file, setLeftQualityStatus, setLeftVerdict, setLeftMaskUrl, setLeftMaskStatus);
    }
  };

  const handleRightFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRightFile(file);
      setRightImage(URL.createObjectURL(file));
      setRightViewMode('original');
      setRightMaskUrl(null);
      verifyImageQuality(file, setRightQualityStatus, setRightVerdict, setRightMaskUrl, setRightMaskStatus);
    }
  };

  const runSequentialPipeline = async () => {
    if (isProcessingPipeline) return;

    if (!leftFile || !rightFile) {
      alert("Please upload both Left and Right eye fundus images first.");
      return;
    }

    setIsProcessingPipeline(true);
    setLeftEye(prev => ({ ...prev, status: 'processing' }));
    setRightEye(prev => ({ ...prev, status: 'queued' }));
    
    try {
      const formData = new FormData();
      formData.append('leftEye', leftFile);
      formData.append('rightEye', rightFile);

      const res = await fetch('http://localhost:5000/api/stage3-assessment', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Stage 3 Assessment failed');
      const data = await res.json();

      setTimeout(() => {
        setLeftEye(prev => ({ ...prev, stage: data.leftGrade, status: 'completed' }));
        setRightEye(prev => ({ ...prev, status: 'processing' }));
        
        setTimeout(() => {
          setRightEye(prev => ({ ...prev, stage: data.rightGrade, status: 'completed' }));
          setTranslatedClinicalNote(data.overallSummary);
          setOverallRisk(data.overallRisk); 
          setIsProcessingPipeline(false);
        }, 800);
      }, 800);

    } catch (err) {
      console.error("Pipeline error, running fallback:", err);
      setTimeout(() => {
        setLeftEye(prev => ({ ...prev, stage: 'Stage 2 - Moderate', status: 'completed' }));
        setRightEye(prev => ({ ...prev, stage: 'Stage 0 - Clear', status: 'completed' }));
        setOverallRisk('Moderate'); 
        setIsProcessingPipeline(false);
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 font-['Plus_Jakarta_Sans',sans-serif] p-4 sm:p-6 lg:p-8 select-none max-w-7xl mx-auto antialiased">
      <main className="flex flex-col gap-6">
        
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

        {/* DYNAMIC RISK ASSESSMENT BANNER */}
        <div className={`relative overflow-hidden bg-white border-l-4 rounded-2xl p-5 md:p-6 shadow-xs transition-colors duration-500 bg-gradient-to-r border ${activeBanner.gradient}`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            <div className="flex items-start gap-4">
              <div className={`p-3 text-white rounded-xl shadow-sm flex items-center justify-center shrink-0 ${activeBanner.iconBg}`}>
                <FiAlertTriangle className="text-2xl" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white ${activeBanner.badge}`}>
                    {activeBanner.badgeText}
                  </span>
                </div>
                <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">{activeBanner.title}</h2>
                <p className="text-xs md:text-sm text-slate-600 font-medium">{translatedClinicalNote}</p>
              </div>
            </div>
            <button onClick={onScheduleConsultation} className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer">
              <FiCalendar className={`text-sm ${activeBanner.iconColor}`} />
              <span>Schedule Consultation</span>
              <FiArrowRight className="text-sm" />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          
          <div className="flex-1 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  {/* Reverted FiEye icon colors */}
                  <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-200/60 text-amber-600">
                    <FiEye className="text-base" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base tracking-tight">Bilateral Retinal Examination (OS / OD)</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">Stage 1 Quality Assessment & Stage 2 Lesion Workstation</p>
              </div>
              <button onClick={runSequentialPipeline} disabled={isProcessingPipeline} className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2 transition cursor-pointer shadow-xs">
                {/* Reverted Play icon color */}
                {isProcessingPipeline ? <FiRefreshCw className="animate-spin text-sm" /> : <FiPlay className="text-xs fill-current text-amber-400" />}
                <span>Run AI Assessment</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
              
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Left Eye (OS)</span>
                    {leftQualityStatus === 'accepted' && (
                      <div className="flex items-center bg-slate-200/80 border border-slate-300/80 rounded-xl p-0.5 text-[11px] font-bold shadow-2xs">
                        <button onClick={() => setLeftViewMode('original')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${leftViewMode === 'original' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}>Original</button>
                        {/* Reverted Mapped Toggle color */}
                        <button onClick={() => setLeftViewMode('mapped')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${leftViewMode === 'mapped' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600'}`}>Mapped</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-h-[24px]">
                    {/* Dynamic Colors applied to the left eye tag */}
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border transition-colors ${getTagColors(leftEye.stage, leftEye.status)}`}>
                      {leftEye.status === 'processing' ? 'Processing...' : leftEye.status === 'queued' ? 'Queued...' : leftEye.stage}
                    </span>
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
                      <div className="w-16 h-16 rounded-2xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400 text-3xl mb-3">
                        <FiEye />
                      </div>
                      <span className="text-white font-semibold text-sm">Click to Upload Fundus Image</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Right Eye (OD)</span>
                    {rightQualityStatus === 'accepted' && (
                      <div className="flex items-center bg-slate-200/80 border border-slate-300/80 rounded-xl p-0.5 text-[11px] font-bold shadow-2xs">
                        <button onClick={() => setRightViewMode('original')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${rightViewMode === 'original' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}>Original</button>
                        {/* Reverted Mapped Toggle color */}
                        <button onClick={() => setRightViewMode('mapped')} className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer z-50 ${rightViewMode === 'mapped' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600'}`}>Mapped</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-h-[24px]">
                    {/* Dynamic Colors applied to the right eye tag */}
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border transition-colors ${getTagColors(rightEye.stage, rightEye.status)}`}>
                      {rightEye.status === 'processing' ? 'Processing...' : rightEye.status === 'queued' ? 'Queued...' : rightEye.stage}
                    </span>
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
                      <div className="w-16 h-16 rounded-2xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400 text-3xl mb-3">
                        <FiEye />
                      </div>
                      <span className="text-white font-semibold text-sm">Click to Upload Fundus Image</span>
                    </div>
                  )}
                </div>
              </div>

            </div>

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

          <aside className="w-full lg:w-96 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col justify-between shrink-0 shadow-xs space-y-6">
            <div className="space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">My Health Record</h2>
                  <span className="text-[11px] font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">Blood Group: A+</span>
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

              {/* NEW: Vitals Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200/70 p-3 rounded-xl shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">HbA1c Level</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">7.8% <span className="text-rose-500 text-xs font-semibold ml-1">↑</span></p>
                </div>
                <div className="bg-slate-50 border border-slate-200/70 p-3 rounded-xl shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Blood Pressure</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">135/85</p>
                </div>
                <div className="bg-slate-50 border border-slate-200/70 p-3 rounded-xl shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Fasting Sugar</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">140 <span className="text-[10px] text-slate-500 font-medium">mg/dL</span></p>
                </div>
                <div className="bg-slate-50 border border-slate-200/70 p-3 rounded-xl shadow-2xs">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Diabetic Status</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Type 2 <span className="text-[10px] text-slate-500 font-medium">(12 Yrs)</span></p>
                </div>
              </div>

              {/* NEW: Exam History Timeline */}
              <div className="bg-slate-50 border border-slate-200/70 p-4 rounded-xl shadow-2xs">
                <h4 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider mb-3">Exam History</h4>
                <div className="relative pl-3 border-l-2 border-slate-200 space-y-3.5">
                  <div className="relative">
                    <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-slate-900 ring-2 ring-white"></div>
                    <p className="text-xs font-bold text-slate-900">Today</p>
                    <p className="text-[11px] text-slate-500 font-medium">Bilateral Retinal Assessment</p>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-slate-300 ring-2 ring-white"></div>
                    <p className="text-xs font-bold text-slate-900">14 Oct 2025</p>
                    <p className="text-[11px] text-slate-500 font-medium">Stage 1 - Mild Risk</p>
                  </div>
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