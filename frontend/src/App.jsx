import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';

// Page Imports matching your src/pages directory
import Login from './pages/Login';
import Signup from './pages/Signup';
import PatientDetailsPage from './pages/PatientDetailsPage';
import Dashboard from './pages/Dashboard';
import DetailedReportPage from './pages/DetailedReportPage';

export default function App() {
  const navigate = useNavigate();

  // Shared Patient State
  const [patientData, setPatientData] = useState({
    fullName: 'Jane Doe',
    age: '54',
    systolicBP: '138',
    diastolicBP: '88',
    diabetesDuration: '12'
  });

  return (
    <Routes>
      {/* 1. STEP ONE: Sign In (Default Route) */}
      <Route 
        path="/" 
        element={
          <Login 
            onLogin={() => navigate('/patient-details')} 
            onGoToSignup={() => navigate('/signup')} 
          />
        } 
      />

      {/* STEP ONE (ALT): Sign Up */}
      <Route 
        path="/signup" 
        element={
          <Signup 
            onSignup={() => navigate('/patient-details')} 
            onGoToLogin={() => navigate('/')} 
          />
        } 
      />

      {/* 2. STEP TWO: Patient Details Onboarding */}
      <Route 
        path="/patient-details" 
        element={
          <PatientDetailsPage 
            initialData={patientData} 
            onSubmit={(data) => {
              setPatientData(data);
              navigate('/dashboard');
            }} 
          />
        } 
      />

      {/* 3. STEP THREE: Main Dashboard */}
      <Route 
        path="/dashboard" 
        element={
          <Dashboard 
            patientData={patientData}
            onEditPatient={() => navigate('/patient-details')}
            onViewDetailedReport={() => navigate('/report')}
            onLogout={() => navigate('/')}
          />
        } 
      />

      {/* 4. STEP FOUR: Detailed Diagnostic Report */}
      <Route 
        path="/report" 
        element={
          <DetailedReportPage 
            patientData={patientData}
            onBack={() => navigate('/dashboard')}
          />
        } 
      />
    </Routes>
  );
}