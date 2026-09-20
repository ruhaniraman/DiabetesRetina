import React, { useState } from 'react';
import { 
  FiUser, FiActivity, FiClock, 
  FiArrowRight, FiEye, FiCalendar, FiDroplet 
} from 'react-icons/fi';

export default function PatientDetailsPage({ onSubmit, initialData }) {
  const [formData, setFormData] = useState({
    fullName: 'Jane Doe',
    dob: '1972-05-12',
    gender: 'Female',
    bloodGroup: 'A+',
    age: '54',
    systolicBP: '138',
    diastolicBP: '88',
    diabetesDuration: '12',
    ...initialData
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="min-h-screen bg-[#f1f3f7] flex items-center justify-center p-4 font-sans select-none">
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 max-w-lg w-full shadow-sm">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
            <FiEye />
          </div>
          <div>
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase block">
              RETINARESCUE • CLINICAL ONBOARDING
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Patient Clinical Profile</h1>
          </div>
        </div>

        <p className="text-xs text-slate-500 font-medium mb-6">
          Please fill out your clinical baseline details. These biomarkers calibrate the AI diagnostic engine for accurate personalized reporting.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Full Name */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
              Full Name
            </label>
            <div className="relative flex items-center">
              <FiUser className="absolute left-3.5 text-slate-400 text-sm" />
              <input
                type="text"
                required
                placeholder="Jane Doe"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition"
              />
            </div>
          </div>

          {/* Date of Birth & Gender */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Date of Birth
              </label>
              <div className="relative flex items-center">
                <FiCalendar className="absolute left-3.5 text-slate-400 text-sm" />
                <input
                  type="date"
                  required
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Gender
              </label>
              <select
                required
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 px-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition cursor-pointer"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
          </div>

          {/* Blood Group & Age */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Blood Group
              </label>
              <div className="relative flex items-center">
                <FiDroplet className="absolute left-3.5 text-slate-400 text-sm" />
                <select
                  required
                  value={formData.bloodGroup}
                  onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition cursor-pointer"
                >
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Age (Years)
              </label>
              <input
                type="number"
                required
                placeholder="54"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 px-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition"
              />
            </div>
          </div>

          {/* Diabetes Duration */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
              Diabetes Duration (Yrs)
            </label>
            <div className="relative flex items-center">
              <FiClock className="absolute left-3.5 text-slate-400 text-sm" />
              <input
                type="number"
                required
                placeholder="12"
                value={formData.diabetesDuration}
                onChange={(e) => setFormData({ ...formData, diabetesDuration: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition"
              />
            </div>
          </div>

          {/* Blood Pressure */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
              Blood Pressure (mmHg)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative flex items-center">
                <FiActivity className="absolute left-3.5 text-slate-400 text-sm" />
                <input
                  type="number"
                  required
                  placeholder="Systolic (138)"
                  value={formData.systolicBP}
                  onChange={(e) => setFormData({ ...formData, systolicBP: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition"
                />
              </div>

              <input
                type="number"
                required
                placeholder="Diastolic (88)"
                value={formData.diastolicBP}
                onChange={(e) => setFormData({ ...formData, diastolicBP: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 px-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900 transition"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer active:scale-[0.99]"
          >
            <span>Save Profile & Open Dashboard</span>
            <FiArrowRight className="text-base" />
          </button>
        </form>

      </div>
    </div>
  );
}