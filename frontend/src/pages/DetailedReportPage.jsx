import React, { useState } from 'react';
import { 
  FiArrowLeft, FiActivity, FiShield, 
  FiLayers, FiCheckCircle, FiEye 
} from 'react-icons/fi';

export default function DetailedReportPage({ patientData, onBack }) {
  const [selectedEye, setSelectedEye] = useState('OS');
  const [viewMode, setViewMode] = useState('overlay');

  const diabetesYrs = parseInt(patientData.diabetesDuration || '0', 10);
  const sysBP = parseInt(patientData.systolicBP || '0', 10);
  const diaBP = parseInt(patientData.diastolicBP || '0', 10);

  const isHighRiskSystemic = diabetesYrs >= 10 || sysBP >= 135 || diaBP >= 85;

  return (
    <div className="min-h-screen bg-[#f1f3f7] text-slate-800 font-sans p-3 md:p-6 select-none max-w-7xl mx-auto space-y-6">
      
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-3 bg-white border border-slate-200/80 rounded-2xl text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-sm"
          >
            <FiArrowLeft className="text-lg" />
          </button>
          <div>
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase block">
              RETINARESCUE • DIAGNOSTIC REPORT
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Detailed Retinal Analysis</h1>
          </div>
        </div>

        <button 
          onClick={onBack}
          className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-xs font-bold hover:bg-slate-800 transition cursor-pointer shadow-sm self-start sm:self-auto"
        >
          Return to Dashboard
        </button>
      </div>

      {/* Biomarker Summary Banner */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-lg">
              <FiActivity />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Patient Biomarker Calibration Summary</h2>
              <p className="text-[11px] text-slate-400 font-medium">Systemic data integrated with deep-learning lesion detection</p>
            </div>
          </div>
          <span className="bg-slate-100 text-slate-700 font-extrabold text-[10px] px-3 py-1 rounded-full uppercase">
            ID: {patientData.fullName.replace(/\s+/g, '-').toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Patient Name</span>
            <p className="text-xs font-extrabold text-slate-900 mt-1">{patientData.fullName}</p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Age Calibration</span>
            <p className="text-xs font-extrabold text-slate-900 mt-1">{patientData.age} Years Old</p>
          </div>

          <div className={`p-3.5 rounded-2xl border ${sysBP >= 135 ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-slate-50 border-slate-100'}`}>
            <span className="text-[10px] font-extrabold uppercase block opacity-70">Blood Pressure</span>
            <p className="text-xs font-extrabold mt-1">{patientData.systolicBP} / {patientData.diastolicBP} mmHg</p>
          </div>

          <div className={`p-3.5 rounded-2xl border ${diabetesYrs >= 10 ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-slate-50 border-slate-100'}`}>
            <span className="text-[10px] font-extrabold uppercase block opacity-70">Diabetes History</span>
            <p className="text-xs font-extrabold mt-1">{patientData.diabetesDuration} Years Duration</p>
          </div>
        </div>

        <div className="bg-[#0b1329] text-white p-4 rounded-2xl text-xs space-y-1.5 border border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-extrabold">
            <FiShield />
            <span>AI + Systemic Risk Correlation Engine</span>
          </div>
          <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
            {isHighRiskSystemic ? (
              <>
                <strong className="text-amber-300">Elevated Microvascular Risk Multiplier:</strong> Due to a diabetes duration of <strong>{patientData.diabetesDuration} years</strong> and blood pressure at <strong>{patientData.systolicBP}/{patientData.diastolicBP} mmHg</strong>, subtle microaneurysms detected in the left eye have a higher probability of progressing into hard exudates and macular edema.
              </>
            ) : (
              <>
                <strong>Standard Systemic Baseline:</strong> Patient blood pressure and diabetes duration indicate a controlled systemic profile. Detected retinal lesions are currently localized and under low progression threat.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Viewer & Layer Toggles */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold">
            <button 
              onClick={() => setSelectedEye('OS')}
              className={`px-5 py-2 rounded-xl transition cursor-pointer ${selectedEye === 'OS' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Left Eye (OS) • Stage 2
            </button>
            <button 
              onClick={() => setSelectedEye('OD')}
              className={`px-5 py-2 rounded-xl transition cursor-pointer ${selectedEye === 'OD' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Right Eye (OD) • Stage 0
            </button>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold self-start md:self-auto">
            <button 
              onClick={() => setViewMode('original')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'original' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Original Photo
            </button>
            <button 
              onClick={() => setViewMode('heatmap')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'heatmap' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500'}`}
            >
              AI Heatmap
            </button>
            <button 
              onClick={() => setViewMode('overlay')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'overlay' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}
            >
              Lesion Overlay
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#0b1329] rounded-[2rem] p-8 min-h-[360px] flex flex-col items-center justify-center text-center relative overflow-hidden border border-slate-800">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-4xl mb-3 text-amber-400 backdrop-blur-md">
              <FiEye className={viewMode !== 'original' ? 'scale-110 text-amber-300' : ''} />
            </div>

            <div className="space-y-1">
              <span className="text-white font-extrabold text-base block">
                {selectedEye === 'OS' ? 'Oculus Sinister (Left Eye)' : 'Oculus Dexter (Right Eye)'} — {viewMode.toUpperCase()} VIEW
              </span>
              <p className="text-xs text-slate-400 font-medium max-w-md">
                {viewMode === 'original' && "Unprocessed standard fundus snapshot capturing retinal microvasculature."}
                {viewMode === 'heatmap' && "Grad-CAM spatial activation mapping areas driving neural network DR severity scores."}
                {viewMode === 'overlay' && "Computer vision bounding boxes pin-pointing microaneurysms and cotton wool spots."}
              </p>
            </div>

            <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md px-3 py-1 rounded-xl text-[10px] font-bold text-white uppercase">
              {viewMode} Mode
            </div>
            <div className="absolute top-4 right-4 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-xl text-[10px] font-bold uppercase">
              High Resolution Verified
            </div>
          </div>

          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FiLayers className="text-amber-600" /> Detected Micro-Lesions ({selectedEye})
              </h3>

              {selectedEye === 'OS' ? (
                <div className="space-y-2 text-xs">
                  <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-amber-950 block">Microaneurysms</span>
                      <span className="text-[10px] text-amber-800">Localized in Temporal Quad</span>
                    </div>
                    <span className="font-black text-amber-900 bg-amber-200/60 px-2 py-1 rounded-lg">4 Detected</span>
                  </div>

                  <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-amber-950 block">Hard Exudates</span>
                      <span className="text-[10px] text-amber-800">Superior Macular Margin</span>
                    </div>
                    <span className="font-black text-amber-900 bg-amber-200/60 px-2 py-1 rounded-lg">2 Detected</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-700 block">Neovascularization</span>
                      <span className="text-[10px] text-slate-400">Optic Disc Area</span>
                    </div>
                    <span className="font-bold text-slate-400">None</span>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-xs text-emerald-950 space-y-1">
                  <div className="flex items-center gap-2 font-black text-emerald-800">
                    <FiCheckCircle />
                    <span>Healthy Retinal Vascular Architecture</span>
                  </div>
                  <p className="text-[11px] text-emerald-900/80 font-medium">
                    No microaneurysms, hemorrhages, or exudates detected in Oculus Dexter.
                  </p>
                </div>
              )}
            </div>

            <button 
              onClick={() => window.print()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl shadow-sm transition text-xs uppercase tracking-wider cursor-pointer"
            >
              Print Official Report
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}