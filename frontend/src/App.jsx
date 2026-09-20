import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import PatientDetailsPage from './pages/PatientDetailsPage';
import DetailedReportPage from './pages/DetailedReportPage';

export default function App() {
  const navigate = useNavigate();

  const [patientData, setPatientData] = useState({
    fullName: 'Jane Doe',
    age: '54',
    systolicBP: '138',
    diastolicBP: '88',
    diabetesDuration: '12'
  });

  return (
    <Routes>
      {/* FORCING DASHBOARD TO BE THE ROOT PAGE */}
      <Route
        path="/"
        element={
          <Dashboard
            patientData={patientData}
            onEditPatient={() => navigate('/patient-details')}
            onViewDetailedReport={() => navigate('/report')}
            onLogout={() => alert("Logged out (bypassed)")}
          />
        }
      />

      <Route
        path="/patient-details"
        element={
          <PatientDetailsPage
            initialData={patientData}
            onSubmit={(data) => {
              setPatientData(data);
              navigate('/');
            }}
          />
        }
      />

      <Route
        path="/report"
        element={
          <DetailedReportPage
            patientData={patientData}
            onBack={() => navigate('/')}
          />
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}